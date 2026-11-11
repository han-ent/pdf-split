import { ko } from '../i18n/ko';
import { flatToTree, levelsIn, outlineForPart, planBookmarkSplits } from '../lib/bookmarks';
import { outputFileNames, sanitizeFilename } from '../lib/filenames';
import { errorCodeFrom } from '../lib/errors';
import { fileStem, formatBytes } from '../lib/format';
import { downloadBlob, isPdf, readFile, releaseDownloads } from '../lib/files';
import { readOutline } from '../lib/outlineRead';
import { formatPageParts, parsePageRanges, rangesEvery, type RangeErrorCode } from '../lib/pageRanges';
import type { ProgressEvent } from '../lib/progress';
import { JobError, runJob } from '../lib/runJob';
import type { FlatBookmark, OutlineNode, PagePart } from '../lib/types';

interface LoadedPdf {
  file: File;
  pageCount: number;
  flat: FlatBookmark[];
}

interface OutputFile {
  filename: string;
  blob: Blob;
}

interface MergeItem {
  id: string;
  file: File;
  pageCount: number | null;
  outline: OutlineNode[] | null;
  error: string | null;
}

type Tab = 'split' | 'merge';
type SplitKind = 'bookmark' | 'pages';

let root: HTMLElement;
let tab: Tab = 'split';
let busy = false;
let statusText = '';
let progressRatio: number | null = null;

let loaded: LoadedPdf | null = null;
let kind: SplitKind = 'bookmark';
let level = 1;
let prefix = true;
let selected = new Set<number>();
let everyN = 10;
let pageInput = '';
let pageParts: PagePart[] | null = null;
let pageChecked = new Set<number>();
let splitOutputs: OutputFile[] | null = null;
let splitError: string | null = null;
let notice: string | null = null;
let pendingName: string | null = null;

let mergeItems: MergeItem[] = [];
let mergeOutputs: OutputFile[] | null = null;
let mergeError: string | null = null;
let mergeQueue: Promise<void> = Promise.resolve();
let idSeq = 0;

export function startApp(mount: HTMLElement): void {
  root = mount;
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());
  render();
}

function render(): void {
  const view = el('div', 'wrap');
  view.append(renderHeader(), tab === 'split' ? renderSplit() : renderMerge());
  root.replaceChildren(view);
  root.toggleAttribute('aria-busy', busy);
}

function renderHeader(): HTMLElement {
  const header = el('header');
  header.append(
    el('h1', '', ko.appTitle),
    el('p', 'tagline', ko.tagline),
    tabs(),
  );
  return header;
}

function tabs(): HTMLElement {
  const bar = el('div', 'tabs');
  bar.append(
    tabButton(ko.tabSplit, tab === 'split', () => switchTab('split')),
    tabButton(ko.tabMerge, tab === 'merge', () => switchTab('merge')),
  );
  return bar;
}

function tabButton(label: string, on: boolean, onClick: () => void): HTMLButtonElement {
  const node = button(label, '', onClick);
  node.setAttribute('aria-selected', on ? 'true' : 'false');
  return node;
}

function switchTab(next: Tab): void {
  if (busy || tab === next) return;
  tab = next;
  render();
}

function renderSplit(): HTMLElement {
  const stack = el('div', 'stack');
  if (!loaded) {
    stack.append(dropZone(ko.dropSplit, false, (files) => void openSplit(files)));
    if (pendingName) {
      const card = el('div', 'card');
      card.append(el('div', 'filename', pendingName), el('p', 'meta', ko.opening));
      stack.append(card);
    }
  } else {
    stack.append(fileBar(), splitCard());
  }
  stack.append(statusBlock());
  if (splitError) stack.append(banner(splitError, 'error'));
  if (notice) stack.append(banner(notice, 'notice'));
  if (splitOutputs && splitOutputs.length > 0) stack.append(resultCard(splitOutputs, splitZipName()));
  return stack;
}

function fileBar(): HTMLElement {
  const card = el('div', 'card filebar');
  const text = el('div');
  text.append(
    el('div', 'filename', loaded!.file.name),
    el('p', 'meta', ko.fileMeta(loaded!.pageCount, loaded!.flat.length, formatBytes(loaded!.file.size))),
  );
  card.append(text, button(ko.otherFile, 'btn secondary', () => clearSplit()));
  return card;
}

function clearSplit(): void {
  if (busy) return;
  loaded = null;
  splitOutputs = null;
  splitError = null;
  notice = null;
  pageParts = null;
  pageInput = '';
  pageChecked = new Set();
  selected = new Set();
  releaseDownloads();
  render();
}

function splitCard(): HTMLElement {
  const card = el('div', 'card');
  card.append(segment());
  if (kind === 'bookmark') card.append(bookmarkBody());
  else card.append(pageBody());
  card.append(actionBar(ko.startSplit(splitExportCount()), () => void exportSplit(), splitExportCount() === 0));
  return card;
}

function segment(): HTMLElement {
  const bar = el('div', 'segment');
  const marks = button(ko.modeBookmark, '', () => {
    kind = 'bookmark';
    splitOutputs = null;
    render();
  });
  marks.setAttribute('aria-pressed', kind === 'bookmark' ? 'true' : 'false');
  marks.disabled = busy || !loaded || loaded.flat.length === 0;
  const pages = button(ko.modePages, '', () => {
    kind = 'pages';
    splitOutputs = null;
    render();
  });
  pages.setAttribute('aria-pressed', kind === 'pages' ? 'true' : 'false');
  bar.append(marks, pages);
  return bar;
}

function bookmarkBody(): HTMLElement {
  const box = el('div');
  const flat = loaded!.flat;
  const levels = levelsIn(flat);
  const chips = el('div', 'row');
  chips.style.marginTop = '16px';
  for (const item of levels) {
    const chip = button(ko.level(item), '', () => {
      level = item;
      const plan = planBookmarkSplits(flat, level, loaded!.pageCount);
      selected = new Set(plan.map((part) => part.ordinal));
      splitOutputs = null;
      render();
    });
    chip.setAttribute('aria-pressed', item === level ? 'true' : 'false');
    chips.append(chip);
  }
  const plan = planBookmarkSplits(flat, level, loaded!.pageCount);
  const summary = el('p', 'meta');
  summary.style.margin = '8px 0 0';
  summary.textContent = `${ko.levelSummary(level, plan.length)} · ${ko.selectedCount(selectedCount(plan))} · ${ko.levelsPresent(levels.join(', '))}`;
  const tools = el('div', 'row');
  tools.style.marginTop = '8px';
  tools.append(
    button(ko.selectAll, 'btn ghost', () => {
      selected = new Set(plan.map((part) => part.ordinal));
      splitOutputs = null;
      render();
    }),
    button(ko.selectNone, 'btn ghost', () => {
      selected = new Set();
      splitOutputs = null;
      render();
    }),
  );
  box.append(
    chips,
    summary,
    tools,
    prefixCheck(),
    bookmarkList(plan),
    el('p', 'hint', ko.splitHint),
    el('p', 'hint', ko.subNote),
  );
  return box;
}

function selectedCount(plan: { ordinal: number }[]): number {
  return plan.filter((part) => selected.has(part.ordinal)).length;
}

function bookmarkList(plan: ReturnType<typeof planBookmarkSplits>): HTMLElement {
  const scroll = el('div', 'tree-scroll');
  scroll.id = 'bookmark-tree';
  const ranges = rangeByIndex(loaded!.flat, loaded!.pageCount);
  const chosen = plan.filter((part) => selected.has(part.ordinal));
  const names = outputFileNames(
    chosen.map((part) => part.title),
    prefix,
    ko.fallbackTitle,
  );
  const nameByOrdinal = new Map(chosen.map((part, index) => [part.ordinal, names[index]]));
  const partByIndex = new Map(plan.map((part) => [part.flatIndex, part]));

  loaded!.flat.forEach((item, flatIndex) => {
    const target = partByIndex.get(flatIndex);
    const row = el('div', `bm-row ${levelClass(item.level)}${target ? ' is-target' : ' is-child'}`);
    if (target && !selected.has(target.ordinal)) row.classList.add('is-off');
    const text = el('span', 'bm-text');
    text.append(el('span', 'bm-title', item.title || ko.fallbackTitle));
    const filename = target ? nameByOrdinal.get(target.ordinal) : undefined;
    if (filename) text.append(el('span', 'bm-file', filename));
    if (target) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.has(target.ordinal);
      box.disabled = busy;
      box.addEventListener('change', () => {
        const next = new Set(selected);
        if (box.checked) next.add(target.ordinal);
        else next.delete(target.ordinal);
        selected = next;
        splitOutputs = null;
        render();
      });
      row.append(box);
    }
    row.append(text);
    const range = ranges.get(flatIndex);
    if (range) row.append(el('span', 'bm-range', ko.rangeLabel(range.start, range.end)));
    scroll.append(row);
  });
  return scroll;
}

function levelClass(levelValue: number): string {
  if (levelValue <= 1) return 'lv-1';
  if (levelValue === 2) return 'lv-2';
  if (levelValue === 3) return 'lv-3';
  if (levelValue === 4) return 'lv-4';
  return 'lv-deep';
}

function rangeByIndex(flat: FlatBookmark[], total: number): Map<number, { start: number; end: number }> {
  const map = new Map<number, { start: number; end: number }>();
  for (const item of levelsIn(flat)) {
    for (const part of planBookmarkSplits(flat, item, total)) {
      map.set(part.flatIndex, { start: part.start, end: part.end });
    }
  }
  return map;
}

function pageBody(): HTMLElement {
  const box = el('div');
  const every = el('div', 'inline');
  every.style.marginTop = '16px';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.step = '1';
  input.inputMode = 'numeric';
  input.value = String(everyN);
  input.setAttribute('aria-label', ko.everyLabel);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (Number.isInteger(value) && value > 0) everyN = value;
  });
  every.append(
    input,
    el('span', 'inline-label', ko.everyLabel),
    button(ko.apply, 'btn secondary', () => applyEvery(Number(input.value))),
  );

  const field = el('div', 'field');
  const label = el('label', '', ko.customRanges);
  label.setAttribute('for', 'ranges');
  const area = document.createElement('textarea');
  area.id = 'ranges';
  area.rows = 5;
  area.placeholder = ko.rangePlaceholder;
  area.value = pageInput;
  area.addEventListener('input', () => {
    pageInput = area.value;
  });
  field.append(label, area, el('p', 'help', ko.rangeHelp));
  const applyRow = el('div', 'row');
  applyRow.style.marginTop = '8px';
  applyRow.append(button(ko.apply, 'btn secondary', () => applyCustom(area.value)));
  field.append(applyRow);
  box.append(every, field, prefixCheck(), pagePreview());
  return box;
}

function pagePreview(): HTMLElement {
  if (!pageParts || pageParts.length === 0) return el('p', 'hint', ko.rangeEmpty);
  const list = el('ul', 'preview');
  const titles = pageParts.map((part) => part.title.trim() || ko.partTitle(part.start, part.end));
  const chosen = pageParts.filter((_, index) => pageChecked.has(index));
  const chosenTitles = chosen.map((part) => part.title.trim() || ko.partTitle(part.start, part.end));
  const names = outputFileNames(chosenTitles, prefix, ko.fallbackTitle);
  const nameByIndex = new Map<number, string>();
  pageParts.forEach((_, index) => {
    if (!pageChecked.has(index)) return;
    const at = chosen.indexOf(pageParts![index]);
    if (at >= 0) nameByIndex.set(index, names[at]);
  });
  pageParts.forEach((part, index) => {
    const item = el('li');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = pageChecked.has(index);
    box.disabled = busy;
    box.addEventListener('change', () => {
      const next = new Set(pageChecked);
      if (box.checked) next.add(index);
      else next.delete(index);
      pageChecked = next;
      splitOutputs = null;
      render();
    });
    const text = el('div', 'name');
    text.append(el('div', 'filename', titles[index]), el('div', 'bm-file', nameByIndex.get(index) ?? ''));
    item.append(box, text, el('span', 'bm-range', ko.rangeLabel(part.start, part.end)));
    list.append(item);
  });
  return list;
}

function applyEvery(size: number): void {
  if (!loaded) return;
  const parsed = rangesEvery(loaded.pageCount, size);
  if (!parsed.ok) {
    splitError = rangeMessage(parsed.code);
    render();
    return;
  }
  everyN = size;
  setPageParts(parsed.parts);
}

function applyCustom(input: string): void {
  if (!loaded) return;
  pageInput = input;
  const parsed = parsePageRanges(input, loaded.pageCount);
  if (!parsed.ok) {
    splitError = rangeMessage(parsed.code);
    render();
    return;
  }
  setPageParts(parsed.parts);
}

function setPageParts(parts: PagePart[]): void {
  pageParts = parts;
  pageChecked = new Set(parts.map((_, index) => index));
  pageInput = formatPageParts(parts);
  splitError = null;
  splitOutputs = null;
  render();
}

function prefixCheck(): HTMLElement {
  const label = el('label', 'check');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = prefix;
  box.disabled = busy;
  box.addEventListener('change', () => {
    prefix = box.checked;
    splitOutputs = null;
    render();
  });
  const text = el('span');
  text.append(document.createTextNode(`${ko.prefix} `), el('span', 'meta', ko.prefixExample));
  label.append(box, text);
  return label;
}

function splitExportCount(): number {
  if (!loaded) return 0;
  if (kind === 'bookmark') {
    const plan = planBookmarkSplits(loaded.flat, level, loaded.pageCount);
    return plan.filter((part) => selected.has(part.ordinal)).length;
  }
  if (!pageParts) return 0;
  return pageParts.filter((_, index) => pageChecked.has(index)).length;
}

async function openSplit(files: File[]): Promise<void> {
  const file = files.find(isPdf);
  if (!file) {
    splitError = files.length ? ko.errType : ko.errNeedFile;
    render();
    return;
  }
  busy = true;
  splitError = null;
  notice = null;
  splitOutputs = null;
  loaded = null;
  pendingName = file.name;
  releaseDownloads();
  render();
  try {
    const bytes = await readFile(file, (ratio) => {
      showProgress(ratio * 0.75, ko.readingPct(Math.round(ratio * 100)));
    });
    showProgress(0.85, ko.opening);
    const { pageCount, flat } = await readOutline(bytes);
    if (pageCount < 1) {
      splitError = ko.errEmpty;
      return;
    }
    loaded = { file, pageCount, flat };
    const levels = levelsIn(flat);
    level = levels[0] ?? 1;
    const plan = planBookmarkSplits(flat, level, pageCount);
    selected = new Set(plan.map((part) => part.ordinal));
    kind = flat.length > 0 ? 'bookmark' : 'pages';
    notice = flat.length > 0 ? null : ko.noBookmarks;
    pageParts = null;
    pageInput = '';
    pageChecked = new Set();
  } catch (err) {
    console.error(err);
    splitError = messageFor(err);
    loaded = null;
  } finally {
    busy = false;
    pendingName = null;
    statusText = '';
    progressRatio = null;
    render();
  }
}

async function exportSplit(): Promise<void> {
  if (!loaded || busy) return;
  const pieces = kind === 'bookmark' ? bookmarkPieces() : pagePieces();
  if (!pieces) return;
  if (pieces.length === 0) {
    splitError = ko.errNeedPick;
    render();
    return;
  }
  busy = true;
  splitError = null;
  splitOutputs = null;
  releaseDownloads();
  render();
  try {
    showProgress(0.05, ko.opening);
    const bytes = await readFile(loaded.file, (ratio) => {
      showProgress(0.05 + ratio * 0.15, ko.readingPct(Math.round(ratio * 100)));
    });
    const buffer = bytes.buffer as ArrayBuffer;
    const done = await runJob({ op: 'split', buffer, pieces }, [buffer], paintJob);
    splitOutputs = (done.files ?? []).map((file) => ({
      filename: file.filename,
      blob: new Blob([file.buffer], { type: 'application/pdf' }),
    }));
  } catch (err) {
    console.error(err);
    splitError = messageFor(err);
  } finally {
    busy = false;
    statusText = '';
    progressRatio = null;
    render();
  }
}

function bookmarkPieces() {
  if (!loaded) return null;
  const plan = planBookmarkSplits(loaded.flat, level, loaded.pageCount).filter((part) =>
    selected.has(part.ordinal),
  );
  const names = outputFileNames(
    plan.map((part) => part.title),
    prefix,
    ko.fallbackTitle,
  );
  return plan.map((part, index) => ({
    filename: names[index],
    title: part.title,
    start: part.start,
    end: part.end,
    outline: outlineForPart(loaded!.flat, part.flatIndex, part.start, part.end),
  }));
}

function pagePieces() {
  if (!loaded) return null;
  const area = document.querySelector<HTMLTextAreaElement>('#ranges');
  const source = area ? area.value : pageInput;
  let parts = pageParts;
  let checked = pageChecked;
  if (!parts || source.trim() !== formatPageParts(parts).trim()) {
    const parsed = parsePageRanges(source, loaded.pageCount);
    if (!parsed.ok) {
      splitError = rangeMessage(parsed.code);
      render();
      return null;
    }
    parts = parsed.parts;
    checked = new Set(parts.map((_, index) => index));
    pageParts = parts;
    pageChecked = checked;
    pageInput = formatPageParts(parts);
  }
  const chosen = parts.filter((_, index) => checked.has(index));
  const names = outputFileNames(
    chosen.map((part) => part.title.trim() || ko.partTitle(part.start, part.end)),
    prefix,
    ko.fallbackTitle,
  );
  return chosen.map((part, index) => ({
    filename: names[index],
    title: part.title.trim() || ko.partTitle(part.start, part.end),
    start: part.start,
    end: part.end,
    outline: [] as OutlineNode[],
  }));
}

function splitZipName(): string {
  const stem = sanitizeFilename(fileStem(loaded?.file.name ?? 'pdf'), 'pdf');
  return `${stem}${ko.splitZipSuffix}`;
}

function renderMerge(): HTMLElement {
  const stack = el('div', 'stack');
  stack.append(dropZone(ko.dropMerge, true, (files) => addMerge(files)));
  const card = el('div', 'card');
  const head = el('div', 'filebar');
  head.append(el('h2', '', ko.tabMerge));
  if (mergeItems.length > 0) {
    head.append(
      button(ko.clearList, 'btn ghost', () => {
        mergeItems = [];
        mergeOutputs = null;
        mergeError = null;
        releaseDownloads();
        render();
      }),
    );
  }
  card.append(head, el('p', 'hint', ko.mergeHint));
  if (mergeItems.length === 0) card.append(el('p', 'hint', ko.emptyMerge));
  else card.append(mergeList());
  card.append(
    actionBar(ko.mergeRun, () => void runMerge(), readyMerge().length < 2),
  );
  stack.append(card, statusBlock());
  if (mergeError) stack.append(banner(mergeError, 'error'));
  if (mergeOutputs && mergeOutputs.length > 0) stack.append(resultCard(mergeOutputs, null));
  return stack;
}

function readyMerge(): MergeItem[] {
  return mergeItems.filter((item) => item.pageCount !== null && !item.error && item.outline);
}

function mergeList(): HTMLElement {
  const list = el('div', 'merge-list');
  list.id = 'merge-list';
  mergeItems.forEach((item, index) => {
    const row = el('div', 'merge-item');
    row.dataset.index = String(index);
    const handle = el('span', 'handle');
    handle.title = ko.dragHandle;
    handle.append(el('i'), el('i'), el('i'));
    const body = el('div', 'merge-body');
    const meta = item.error
      ? item.error
      : item.pageCount === null
        ? ko.readingRow
        : ko.fileMeta(item.pageCount, item.outline?.length ? countNodes(item.outline) : 0, formatBytes(item.file.size));
    body.append(el('div', 'merge-name', item.file.name), el('div', 'meta', meta));
    const actions = el('div', 'merge-actions');
    actions.append(
      button(ko.moveUp, 'btn ghost', () => reorder(index, index - 1), index === 0),
      button(ko.moveDown, 'btn ghost', () => reorder(index, index + 1), index === mergeItems.length - 1),
      button(ko.remove, 'btn ghost', () => {
        mergeItems = mergeItems.filter((entry) => entry.id !== item.id);
        mergeOutputs = null;
        render();
      }),
    );
    body.append(actions);
    row.append(handle, body);
    list.append(row);
  });
  bindDrag(list);
  return list;
}

function countNodes(nodes: OutlineNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
}

function reorder(from: number, to: number): void {
  if (busy || to < 0 || to >= mergeItems.length || from === to) return;
  const next = mergeItems.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  mergeItems = next;
  mergeOutputs = null;
  render();
}

function bindDrag(list: HTMLElement): void {
  let drag: { from: number; over: number; height: number; startY: number; pointerId: number } | null = null;
  const rows = () => [...list.querySelectorAll<HTMLElement>('.merge-item')];
  list.addEventListener('pointerdown', (event) => {
    if (busy || event.button !== 0) return;
    const handle = (event.target as HTMLElement).closest('.handle');
    if (!handle) return;
    const row = handle.closest('.merge-item') as HTMLElement;
    drag = {
      from: Number(row.dataset.index),
      over: Number(row.dataset.index),
      height: row.getBoundingClientRect().height + 8,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
    row.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  list.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const shift = Math.round((event.clientY - drag.startY) / drag.height);
    const over = Math.max(0, Math.min(mergeItems.length - 1, drag.from + shift));
    drag.over = over;
    rows().forEach((row, index) => {
      let offset = 0;
      if (index === drag!.from) offset = (over - drag!.from) * drag!.height;
      else if (drag!.from < over && index > drag!.from && index <= over) offset = -drag!.height;
      else if (drag!.from > over && index < drag!.from && index >= over) offset = drag!.height;
      row.style.transform = offset ? `translateY(${offset}px)` : '';
    });
  });
  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { from, over } = drag;
    drag = null;
    if (from !== over) reorder(from, over);
    else {
      rows().forEach((row) => {
        row.style.transform = '';
        row.classList.remove('is-dragging');
      });
    }
  };
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
}

function addMerge(files: File[]): void {
  const pdfs = files.filter(isPdf);
  if (pdfs.length === 0) {
    mergeError = ko.errType;
    render();
    return;
  }
  mergeError = null;
  for (const file of pdfs) {
    const item: MergeItem = { id: `m${++idSeq}`, file, pageCount: null, outline: null, error: null };
    mergeItems = [...mergeItems, item];
    mergeQueue = mergeQueue.then(() => readMergeItem(item));
  }
  mergeOutputs = null;
  render();
}

async function readMergeItem(item: MergeItem): Promise<void> {
  if (!mergeItems.some((entry) => entry.id === item.id)) return;
  try {
    const bytes = await readFile(item.file, (ratio) => {
      if (tab === 'merge') showProgress(ratio, ko.readingPct(Math.round(ratio * 100)));
    });
    if (!mergeItems.some((entry) => entry.id === item.id)) return;
    const { pageCount, flat } = await readOutline(bytes);
    if (!mergeItems.some((entry) => entry.id === item.id)) return;
    if (pageCount < 1) item.error = ko.errEmpty;
    else {
      item.pageCount = pageCount;
      item.outline = flatToTree(flat);
    }
  } catch (err) {
    console.error(err);
    item.error = messageFor(err);
  } finally {
    if (tab === 'merge' && !busy) {
      statusText = '';
      progressRatio = null;
      render();
    }
  }
}

async function runMerge(): Promise<void> {
  if (busy) return;
  if (mergeItems.some((item) => item.pageCount === null && !item.error)) {
    mergeError = ko.errReading;
    render();
    return;
  }
  const ready = readyMerge();
  if (ready.length < 2) {
    mergeError = ko.errNeedTwo;
    render();
    return;
  }
  busy = true;
  mergeError = null;
  mergeOutputs = null;
  releaseDownloads();
  render();
  try {
    const files = [];
    const transfer: ArrayBuffer[] = [];
    for (let index = 0; index < ready.length; index += 1) {
      const item = ready[index];
      showProgress(index / ready.length * 0.2, ko.readingPct(Math.round((index / ready.length) * 100)));
      const bytes = await readFile(item.file, () => {});
      const buffer = bytes.buffer as ArrayBuffer;
      files.push({
        title: fileStem(item.file.name),
        buffer,
        outline: item.outline ?? [],
      });
      transfer.push(buffer);
    }
    const done = await runJob({ op: 'merge', files }, transfer, paintJob);
    const name = `${sanitizeFilename(fileStem(ready[0].file.name), 'pdf')}${ko.mergedSuffix}`;
    mergeOutputs = [
      {
        filename: name,
        blob: new Blob([done.buffer!], { type: 'application/pdf' }),
      },
    ];
  } catch (err) {
    console.error(err);
    mergeError = messageFor(err);
  } finally {
    busy = false;
    statusText = '';
    progressRatio = null;
    render();
  }
}

function resultCard(files: OutputFile[], zipName: string | null): HTMLElement {
  const card = el('div', 'card');
  const title = files.length === 1 && !zipName ? ko.mergeDone : ko.resultSplit(files.length);
  card.append(el('h2', '', title));
  const list = el('ul', 'results');
  for (const file of files) {
    const item = el('li');
    item.append(
      el('div', 'result-name', file.filename),
      button(ko.saveOne, 'btn secondary', () => downloadBlob(file.blob, file.filename)),
    );
    list.append(item);
  }
  card.append(list);
  if (zipName && files.length > 1) {
    const bar = el('div', 'action-bar');
    bar.append(button(ko.saveZipAll, 'btn primary', () => void zipOutputs(files, zipName)));
    card.append(bar);
  } else if (files.length === 1) {
    const bar = el('div', 'action-bar');
    const label = zipName ? ko.exportOne : ko.downloadMerged;
    bar.append(button(label, 'btn primary', () => downloadBlob(files[0].blob, files[0].filename)));
    card.append(bar);
  }
  return card;
}

async function zipOutputs(files: OutputFile[], filename: string): Promise<void> {
  if (busy) return;
  busy = true;
  render();
  try {
    showProgress(null, ko.zipping);
    const payload = [];
    const transfer: ArrayBuffer[] = [];
    for (const file of files) {
      const buffer = await file.blob.arrayBuffer();
      payload.push({ filename: file.filename, buffer });
      transfer.push(buffer);
    }
    const done = await runJob({ op: 'zip', files: payload }, transfer, paintJob);
    downloadBlob(new Blob([done.buffer!], { type: 'application/zip' }), filename);
  } catch (err) {
    console.error(err);
    splitError = messageFor(err);
  } finally {
    busy = false;
    statusText = '';
    progressRatio = null;
    render();
  }
}

function actionBar(label: string, onClick: () => void, disabled: boolean): HTMLElement {
  const bar = el('div', 'action-bar');
  bar.append(button(label, 'btn primary', onClick, disabled));
  return bar;
}

function statusBlock(): HTMLElement {
  const box = el('div');
  const status = el('p', 'status', statusText);
  status.id = 'status';
  status.setAttribute('aria-live', 'polite');
  status.hidden = !statusText;
  const progress = el('div', 'progress');
  progress.id = 'progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  progress.hidden = !busy;
  const bar = el('div');
  bar.id = 'bar';
  if (progressRatio === null) bar.classList.add('indeterminate');
  else {
    bar.style.width = `${Math.round(progressRatio * 100)}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(progressRatio * 100)));
  }
  progress.append(bar);
  box.append(status, progress);
  return box;
}

function showProgress(ratio: number | null, text: string): void {
  statusText = text;
  progressRatio = ratio;
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const bar = document.getElementById('bar');
  if (status) {
    status.hidden = false;
    status.textContent = text;
  }
  if (progress) {
    progress.hidden = false;
    if (ratio === null) progress.removeAttribute('aria-valuenow');
    else progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }
  if (bar) {
    bar.classList.toggle('indeterminate', ratio === null);
    bar.style.width = ratio === null ? '' : `${Math.round(ratio * 100)}%`;
  }
}

function paintJob(progress: ProgressEvent): void {
  if (progress.phase === 'zip') {
    showProgress(null, ko.zipping);
    return;
  }
  if (progress.phase === 'load') {
    showProgress(0.2, ko.opening);
    return;
  }
  if (progress.phase === 'file') {
    const ratio = progress.total > 0 ? progress.done / progress.total : 0;
    showProgress(0.15 + ratio * 0.8, ko.merging(progress.done, progress.total));
    return;
  }
  const ratio = progress.total > 0 ? progress.done / progress.total : 0;
  showProgress(0.15 + ratio * 0.8, ko.progressSplit(progress.done, progress.total, progress.title));
}

function banner(text: string, tone: 'error' | 'notice'): HTMLElement {
  const node = el('p', `banner ${tone}`, text);
  if (tone === 'error') node.setAttribute('role', 'alert');
  return node;
}

function dropZone(label: string, multiple: boolean, onFiles: (files: File[]) => void): HTMLElement {
  const input = document.createElement('input');
  input.className = 'file-input';
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.multiple = multiple;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length > 0) onFiles(files);
  });
  const zone = el('div', 'drop');
  const pick = button(multiple ? ko.addFiles : ko.chooseFile, 'btn secondary', () => input.click());
  zone.append(el('p', 'drop-label', label), pick, input);
  zone.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('button, input')) return;
    if (!busy) input.click();
  });
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('hot');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('hot'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('hot');
    if (busy) return;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) onFiles(files);
  });
  return zone;
}

function messageFor(err: unknown): string {
  const code = err instanceof JobError ? err.code : errorCodeFrom(err);
  if (code === 'encrypted') return ko.errEncrypted;
  if (code === 'read') return ko.errRead;
  return ko.errProcess;
}

function rangeMessage(code: RangeErrorCode): string {
  if (code === 'empty') return ko.errRangeEmpty;
  if (code === 'order') return ko.errRangeOrder;
  if (code === 'bounds') return ko.errRangeBounds;
  return ko.errRangeFormat;
}

function button(label: string, className: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  const extra = className.replace(/\bbtn\b/g, '').trim();
  node.className = extra ? `btn ${extra}` : 'btn';
  node.textContent = label;
  node.disabled = disabled || busy;
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return node;
}

function el(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

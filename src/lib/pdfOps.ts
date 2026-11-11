import { PDFDocument } from 'pdf-lib';
import { offsetOutline } from './bookmarks';
import type { ProgressEvent } from './progress';
import type { OutlineNode } from './types';
import { writeOutline } from './outlineWrite';

export interface SplitPiece {
  filename: string;
  title: string;
  start: number;
  end: number;
  outline: OutlineNode[];
}

export interface MergePiece {
  title: string;
  bytes: Uint8Array;
  outline: OutlineNode[];
}

const CHUNK = 8;

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function pageIndices(start: number, end: number, pageCount: number): number[] {
  if (pageCount < 1) return [];
  const first = Math.max(1, Math.min(start, pageCount));
  const last = Math.max(first, Math.min(end, pageCount));
  const indices: number[] = [];
  for (let page = first; page <= last; page += 1) indices.push(page - 1);
  return indices;
}

export async function splitPdf(
  bytes: Uint8Array,
  pieces: readonly SplitPiece[],
  onProgress?: (event: ProgressEvent) => void,
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  onProgress?.({ phase: 'load', done: 0, total: Math.max(pieces.length, 1), title: '' });
  const src = await PDFDocument.load(bytes);
  const pageCount = src.getPageCount();
  const total = pieces.reduce((sum, piece) => {
    const indices = pageIndices(piece.start, piece.end, pageCount);
    return sum + indices.length;
  }, 0);
  let copied = 0;
  const outputs: { filename: string; bytes: Uint8Array }[] = [];

  for (const piece of pieces) {
    const out = await PDFDocument.create();
    const indices = pageIndices(piece.start, piece.end, pageCount);
    for (let offset = 0; offset < indices.length; offset += CHUNK) {
      const slice = indices.slice(offset, offset + CHUNK);
      const pages = await out.copyPages(src, slice);
      for (const page of pages) out.addPage(page);
      copied += slice.length;
      onProgress?.({
        phase: 'copy',
        done: copied,
        total: Math.max(total, 1),
        title: piece.title,
      });
      await yieldToLoop();
    }
    if (piece.outline.length > 0) await writeOutline(out, piece.outline);
    const title = piece.title.trim();
    if (title) out.setTitle(title);
    outputs.push({ filename: piece.filename, bytes: await out.save() });
  }
  return outputs;
}

export async function mergePdfs(
  files: readonly MergePiece[],
  onProgress?: (event: ProgressEvent) => void,
): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('empty');
  const out = await PDFDocument.create();
  const merged: OutlineNode[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    onProgress?.({ phase: 'load', done: index, total: files.length, title: file.title });
    const src = await PDFDocument.load(file.bytes);
    const offset = out.getPageCount();
    const indices = Array.from({ length: src.getPageCount() }, (_, page) => page);
    for (let cursor = 0; cursor < indices.length; cursor += CHUNK) {
      const slice = indices.slice(cursor, cursor + CHUNK);
      const pages = await out.copyPages(src, slice);
      for (const page of pages) out.addPage(page);
      await yieldToLoop();
    }
    if (file.outline.length > 0) merged.push(...offsetOutline(file.outline, offset));
    else merged.push({ title: file.title.trim() || 'untitled', page: offset + 1, children: [] });
    onProgress?.({ phase: 'file', done: index + 1, total: files.length, title: file.title });
  }

  if (merged.length > 0) await writeOutline(out, merged);
  const first = files[0].title.trim();
  if (first) out.setTitle(first);
  return out.save();
}

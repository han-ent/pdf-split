import type { BookmarkPart, FlatBookmark, OutlineNode } from './types';

/**
 * Page ranges follow pdf_tools.split_by_bookmarks.
 * The end page is the page before the next bookmark at the same level,
 * or the last page of the document. The range is then clamped into the document.
 * Pages before the first bookmark at that level are not included.
 */
export function planBookmarkSplits(
  flat: readonly FlatBookmark[],
  level: number,
  totalPages: number,
): BookmarkPart[] {
  if (totalPages < 1) return [];
  const picked: { flatIndex: number; title: string; page: number }[] = [];
  flat.forEach((item, flatIndex) => {
    if (item.level === level) picked.push({ flatIndex, title: item.title, page: item.page });
  });

  return picked.map((item, ordinal) => {
    const next = picked[ordinal + 1];
    const rawEnd = next ? next.page - 1 : totalPages;
    const start = Math.max(1, Math.min(item.page, totalPages));
    const end = Math.max(start, Math.min(rawEnd, totalPages));
    return {
      flatIndex: item.flatIndex,
      ordinal,
      title: item.title,
      start,
      end,
    };
  });
}

export function levelsIn(flat: readonly FlatBookmark[]): number[] {
  return [...new Set(flat.map((item) => item.level))].sort((a, b) => a - b);
}

export function flatToTree(flat: readonly FlatBookmark[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: { level: number; node: OutlineNode }[] = [];
  for (const item of flat) {
    const node: OutlineNode = { title: item.title, page: item.page, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ level: item.level, node });
  }
  return roots;
}

/**
 * Bookmarks that belong inside one split file: the chosen bookmark and its
 * descendants whose pages fall in the exported range. Pages are renumbered
 * so the part starts at page 1.
 */
export function outlineForPart(
  flat: readonly FlatBookmark[],
  flatIndex: number,
  start: number,
  end: number,
): OutlineNode[] {
  const root = flat[flatIndex];
  if (!root) return [];
  const slice: FlatBookmark[] = [root];
  for (let i = flatIndex + 1; i < flat.length; i += 1) {
    if (flat[i].level <= root.level) break;
    slice.push(flat[i]);
  }
  const kept = slice.filter((item, index) => {
    if (index === 0) return true;
    return item.page >= start && item.page <= end;
  });
  const base = root.level;
  const shifted: FlatBookmark[] = kept.map((item) => ({
    level: item.level - base + 1,
    title: item.title,
    page: item.page < 1 ? 1 : item.page - start + 1,
  }));
  return flatToTree(shifted);
}

export function offsetOutline(nodes: readonly OutlineNode[], offset: number): OutlineNode[] {
  return nodes.map((node) => ({
    title: node.title,
    page: node.page < 1 ? offset + 1 : node.page + offset,
    children: offsetOutline(node.children, offset),
  }));
}

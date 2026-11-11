import type { PagePart } from './types';

export type RangeErrorCode = 'empty' | 'format' | 'order' | 'bounds';

export type RangeParse =
  | { ok: true; parts: PagePart[] }
  | { ok: false; code: RangeErrorCode };

const RANGE_LIKE = /^(\d+)\s*(-\s*\d*)?(\s+|:|$)/;

function fail(code: RangeErrorCode): RangeParse {
  return { ok: false, code };
}

function parseToken(token: string, totalPages: number): RangeParse {
  const trimmed = token.trim();
  const head = trimmed.match(/^(\d+)\s*(.*)$/);
  if (!head) return fail('format');
  const start = Number(head[1]);
  let rest = head[2].trim();
  let end = start;
  if (rest.startsWith('-')) {
    rest = rest.slice(1).trim();
    const endMatch = rest.match(/^(\d+)?\s*(.*)$/);
    if (!endMatch) return fail('format');
    if (endMatch[1]) {
      end = Number(endMatch[1]);
      rest = endMatch[2].trim();
    } else {
      end = totalPages;
      rest = endMatch[2].trim();
    }
  }
  if (rest.startsWith(':')) rest = rest.slice(1).trim();
  if (!Number.isInteger(start) || !Number.isInteger(end)) return fail('format');
  if (start < 1 || end < 1 || start > totalPages || end > totalPages) return fail('bounds');
  if (start > end) return fail('order');
  return { ok: true, parts: [{ start, end, title: rest }] };
}

function piecesOf(line: string): string[] {
  const bits = line.split(',');
  if (bits.length === 1) return [line.trim()].filter(Boolean);
  const pieces = bits.map((bit) => bit.trim()).filter(Boolean);
  if (pieces.length > 1 && pieces.every((piece) => RANGE_LIKE.test(piece))) return pieces;
  return [line.trim()];
}

export function parsePageRanges(input: string, totalPages: number): RangeParse {
  if (totalPages < 1) return fail('bounds');
  const lines = input.split(/\n+/);
  const parts: PagePart[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    for (const piece of piecesOf(line)) {
      const parsed = parseToken(piece, totalPages);
      if (!parsed.ok) return parsed;
      parts.push(parsed.parts[0]);
    }
  }
  if (parts.length === 0) return fail('empty');
  return { ok: true, parts };
}

export function rangesEvery(totalPages: number, size: number): RangeParse {
  if (!Number.isInteger(size) || size < 1) return fail('format');
  if (totalPages < 1) return fail('bounds');
  const parts: PagePart[] = [];
  for (let start = 1; start <= totalPages; start += size) {
    parts.push({ start, end: Math.min(totalPages, start + size - 1), title: '' });
  }
  return { ok: true, parts };
}

export function formatPageParts(parts: readonly PagePart[]): string {
  return parts
    .map((part) => `${part.start}-${part.end}${part.title ? ` ${part.title}` : ''}`)
    .join('\n');
}

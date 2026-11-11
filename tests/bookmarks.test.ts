import { describe, expect, it } from 'vitest';
import { outlineForPart, planBookmarkSplits } from '../src/lib/bookmarks';
import { outputFileNames, sanitizeFilename } from '../src/lib/filenames';
import type { FlatBookmark } from '../src/lib/types';

const nested: FlatBookmark[] = [
  { level: 1, title: '1장', page: 1 },
  { level: 2, title: '1.1', page: 1 },
  { level: 2, title: '1.2', page: 4 },
  { level: 1, title: '2장', page: 6 },
  { level: 2, title: '2.1', page: 6 },
  { level: 3, title: '2.1.1', page: 7 },
];

describe('planBookmarkSplits', () => {
  it('uses only the chosen level as boundaries in a nested outline', () => {
    const chapters = planBookmarkSplits(nested, 1, 12);
    expect(chapters.map((part) => [part.title, part.start, part.end])).toEqual([
      ['1장', 1, 5],
      ['2장', 6, 12],
    ]);

    const sections = planBookmarkSplits(nested, 2, 12);
    expect(sections.map((part) => [part.title, part.start, part.end])).toEqual([
      ['1.1', 1, 3],
      ['1.2', 4, 5],
      ['2.1', 6, 12],
    ]);

    const leaves = planBookmarkSplits(nested, 3, 12);
    expect(leaves.map((part) => [part.title, part.start, part.end])).toEqual([['2.1.1', 7, 12]]);
  });

  it('keeps a single page when two bookmarks point at the same page', () => {
    const flat: FlatBookmark[] = [
      { level: 1, title: 'A', page: 5 },
      { level: 1, title: 'B', page: 5 },
      { level: 1, title: 'C', page: 8 },
    ];
    expect(planBookmarkSplits(flat, 1, 10).map((part) => [part.title, part.start, part.end])).toEqual([
      ['A', 5, 5],
      ['B', 5, 7],
      ['C', 8, 10],
    ]);
  });

  it('extends the last bookmark to the end of the document', () => {
    const flat: FlatBookmark[] = [{ level: 1, title: '끝', page: 3 }];
    expect(planBookmarkSplits(flat, 1, 10)).toMatchObject([{ title: '끝', start: 3, end: 10 }]);
  });

  it('omits pages before the first bookmark at that level', () => {
    const flat: FlatBookmark[] = [{ level: 1, title: '본문', page: 4 }];
    expect(planBookmarkSplits(flat, 1, 8)[0]).toMatchObject({ start: 4, end: 8 });
  });

  it('clamps bookmarks outside the document', () => {
    const flat: FlatBookmark[] = [
      { level: 1, title: '앞', page: -1 },
      { level: 1, title: '뒤', page: 99 },
    ];
    expect(planBookmarkSplits(flat, 1, 5).map((part) => [part.start, part.end])).toEqual([
      [1, 5],
      [5, 5],
    ]);
  });

  it('returns nothing for an empty level or an empty document', () => {
    expect(planBookmarkSplits(nested, 4, 12)).toEqual([]);
    expect(planBookmarkSplits(nested, 1, 0)).toEqual([]);
  });

  it('does not sort bookmarks that point backwards', () => {
    const flat: FlatBookmark[] = [
      { level: 1, title: 'A', page: 5 },
      { level: 1, title: 'B', page: 3 },
    ];
    expect(planBookmarkSplits(flat, 1, 10).map((part) => [part.title, part.start, part.end])).toEqual([
      ['A', 5, 5],
      ['B', 3, 10],
    ]);
  });
});

describe('outlineForPart', () => {
  it('keeps descendants and renumbers pages from 1', () => {
    const part = planBookmarkSplits(nested, 1, 12)[1];
    expect(outlineForPart(nested, part.flatIndex, part.start, part.end)).toEqual([
      {
        title: '2장',
        page: 1,
        children: [
          {
            title: '2.1',
            page: 1,
            children: [{ title: '2.1.1', page: 2, children: [] }],
          },
        ],
      },
    ]);
  });
});

describe('sanitizeFilename', () => {
  it('replaces illegal characters and trims dots', () => {
    expect(sanitizeFilename('a/b:c*?.pdf')).toBe('a_b_c__.pdf');
    expect(sanitizeFilename('  ..제1장.. ')).toBe('제1장');
    expect(sanitizeFilename('...')).toBe('untitled');
    expect(sanitizeFilename('   ')).toBe('untitled');
    expect(sanitizeFilename('a\nb')).toBe('a_b');
    expect(sanitizeFilename('가'.repeat(151))).toBe('가'.repeat(150));
  });

  it('numbers files and avoids collisions the way the desktop app does', () => {
    expect(outputFileNames(['극한', '미분'], true)).toEqual(['001_극한.pdf', '002_미분.pdf']);
    expect(outputFileNames(['foo/bar', 'foo\\bar'], false)).toEqual(['foo_bar.pdf', 'foo_bar_2.pdf']);
    expect(outputFileNames(['A', 'A', 'A'], false)).toEqual(['A.pdf', 'A_2.pdf', 'A_2_3.pdf']);
  });
});

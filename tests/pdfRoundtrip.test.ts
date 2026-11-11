import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { parsePageRanges, rangesEvery } from '../src/lib/pageRanges';
import { outlineForPart, planBookmarkSplits } from '../src/lib/bookmarks';
import { outputFileNames } from '../src/lib/filenames';
import { readOutline } from '../src/lib/outlineRead';
import { writeOutline } from '../src/lib/outlineWrite';
import { mergePdfs, splitPdf } from '../src/lib/pdfOps';
import type { FlatBookmark, OutlineNode } from '../src/lib/types';

async function buildPdf(pageCount: number, outline: OutlineNode[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.addPage([300, 400]);
    page.drawText(String(index + 1), { x: 40, y: 360, size: 18 });
  }
  await writeOutline(doc, outline);
  return doc.save();
}

const textbook: OutlineNode[] = [
  {
    title: '1장 함수',
    page: 1,
    children: [
      { title: '1.1 정의', page: 1, children: [] },
      { title: '1.2 극한', page: 3, children: [] },
    ],
  },
  {
    title: '2장 미분',
    page: 5,
    children: [{ title: '2.1 도함수', page: 6, children: [] }],
  },
];

describe('parsePageRanges', () => {
  it('parses lines, open ends, titles, and comma-separated ranges', () => {
    const parsed = parsePageRanges('1-2 서론\n3- 본문\n8\n1-2, 3-4', 10);
    expect(parsed).toEqual({
      ok: true,
      parts: [
        { start: 1, end: 2, title: '서론' },
        { start: 3, end: 10, title: '본문' },
        { start: 8, end: 8, title: '' },
        { start: 1, end: 2, title: '' },
        { start: 3, end: 4, title: '' },
      ],
    });
  });

  it('keeps commas that belong to a title', () => {
    expect(parsePageRanges('1-2 제목, 부제', 4)).toEqual({
      ok: true,
      parts: [{ start: 1, end: 2, title: '제목, 부제' }],
    });
  });

  it('rejects empty, malformed, reversed, and out-of-range input', () => {
    expect(parsePageRanges('  \n', 4)).toMatchObject({ ok: false, code: 'empty' });
    expect(parsePageRanges('서론', 4)).toMatchObject({ ok: false, code: 'format' });
    expect(parsePageRanges('4-2', 8)).toMatchObject({ ok: false, code: 'order' });
    expect(parsePageRanges('1-9', 4)).toMatchObject({ ok: false, code: 'bounds' });
    expect(rangesEvery(0, 2)).toMatchObject({ ok: false, code: 'bounds' });
    expect(rangesEvery(5, 2)).toEqual({
      ok: true,
      parts: [
        { start: 1, end: 2, title: '' },
        { start: 3, end: 4, title: '' },
        { start: 5, end: 5, title: '' },
      ],
    });
  });
});

describe('synthetic pdf bookmarks', () => {
  it('reads nested outlines and splits on them, keeping child bookmarks', async () => {
    const bytes = await buildPdf(8, textbook);
    const { pageCount, flat } = await readOutline(bytes);
    expect(pageCount).toBe(8);
    expect(flat).toEqual([
      { level: 1, title: '1장 함수', page: 1 },
      { level: 2, title: '1.1 정의', page: 1 },
      { level: 2, title: '1.2 극한', page: 3 },
      { level: 1, title: '2장 미분', page: 5 },
      { level: 2, title: '2.1 도함수', page: 6 },
    ] satisfies FlatBookmark[]);

    const plan = planBookmarkSplits(flat, 1, pageCount);
    expect(plan.map((part) => [part.title, part.start, part.end])).toEqual([
      ['1장 함수', 1, 4],
      ['2장 미분', 5, 8],
    ]);

    const names = outputFileNames(
      plan.map((part) => part.title),
      true,
    );
    const pieces = plan.map((part, index) => ({
      filename: names[index],
      title: part.title,
      start: part.start,
      end: part.end,
      outline: outlineForPart(flat, part.flatIndex, part.start, part.end),
    }));
    const outputs = await splitPdf(bytes, pieces);
    expect(outputs.map((file) => file.filename)).toEqual(['001_1장 함수.pdf', '002_2장 미분.pdf']);

    const first = await readOutline(outputs[0].bytes);
    expect(first.pageCount).toBe(4);
    expect(first.flat.map((item) => [item.level, item.title, item.page])).toEqual([
      [1, '1장 함수', 1],
      [2, '1.1 정의', 1],
      [2, '1.2 극한', 3],
    ]);

    const second = await readOutline(outputs[1].bytes);
    expect(second.pageCount).toBe(4);
    expect(second.flat.map((item) => [item.title, item.page])).toEqual([
      ['2장 미분', 1],
      ['2.1 도함수', 2],
    ]);
  });

  it('merges documents and shifts bookmarks', async () => {
    const first = await buildPdf(2, [{ title: '앞부분', page: 1, children: [] }]);
    const second = await buildPdf(3, [
      { title: '뒷부분', page: 2, children: [{ title: '세부', page: 3, children: [] }] },
    ]);
    const merged = await mergePdfs([
      { title: '앞부분', bytes: first, outline: [{ title: '앞부분', page: 1, children: [] }] },
      {
        title: '뒷부분',
        bytes: second,
        outline: [{ title: '뒷부분', page: 2, children: [{ title: '세부', page: 3, children: [] }] }],
      },
    ]);
    const outline = await readOutline(merged);
    expect(outline.pageCount).toBe(5);
    expect(outline.flat).toEqual([
      { level: 1, title: '앞부분', page: 1 },
      { level: 1, title: '뒷부분', page: 4 },
      { level: 2, title: '세부', page: 5 },
    ]);
  });
});

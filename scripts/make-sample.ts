import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { writeOutline } from '../src/lib/outlineWrite';
import type { OutlineNode } from '../src/lib/types';

async function makePdf(pages: number, outline: OutlineNode[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(String(index + 1), { x: 72, y: 760, size: 24 });
  }
  await writeOutline(doc, outline);
  return doc.save();
}

const book: OutlineNode[] = [
  {
    title: '1장 함수의 극한',
    page: 1,
    children: [
      { title: '1.1 함수의 정의', page: 1, children: [] },
      { title: '1.2 극한의 뜻', page: 3, children: [] },
    ],
  },
  {
    title: '2장 미분',
    page: 5,
    children: [
      { title: '2.1 미분계수', page: 5, children: [] },
      { title: '2.2 도함수', page: 7, children: [] },
    ],
  },
  {
    title: '3장 적분',
    page: 9,
    children: [
      { title: '3.1 부정적분', page: 9, children: [] },
      { title: '3.2 정적분', page: 11, children: [] },
    ],
  },
];

const dir = process.argv[2] ?? '/tmp/pdf-split-sample';
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/미분적분학.pdf`, await makePdf(12, book));
await writeFile(
  `${dir}/1장 함수.pdf`,
  await makePdf(2, [{ title: '1장 함수', page: 1, children: [{ title: '1.1 정의', page: 2, children: [] }] }]),
);
await writeFile(
  `${dir}/2장 미분.pdf`,
  await makePdf(2, [{ title: '2장 미분', page: 1, children: [] }]),
);
await writeFile(
  `${dir}/3장 적분.pdf`,
  await makePdf(1, [{ title: '3장 적분', page: 1, children: [] }]),
);
console.log(dir);

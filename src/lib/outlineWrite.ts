import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef } from 'pdf-lib';
import type { OutlineNode } from './types';

interface BuiltItem {
  ref: PDFRef;
  dict: PDFDict;
  descendants: number;
}

function linkSiblings(items: BuiltItem[]): void {
  for (let i = 0; i < items.length; i += 1) {
    if (i > 0) items[i].dict.set(PDFName.of('Prev'), items[i - 1].ref);
    if (i < items.length - 1) items[i].dict.set(PDFName.of('Next'), items[i + 1].ref);
  }
}

function buildLevel(doc: PDFDocument, nodes: readonly OutlineNode[], parent: PDFRef): BuiltItem[] {
  const context = doc.context;
  const pageCount = doc.getPageCount();
  const built: BuiltItem[] = [];
  for (const node of nodes) {
    const dict = PDFDict.withContext(context);
    const ref = context.register(dict);
    const kids = buildLevel(doc, node.children, ref);
    const descendants = kids.reduce((sum, kid) => sum + 1 + kid.descendants, 0);
    const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(node.page) - 1));
    const dest = context.obj([doc.getPage(pageIndex).ref, PDFName.of('Fit')]);
    dict.set(PDFName.of('Title'), PDFHexString.fromText(node.title.trim() || 'untitled'));
    dict.set(PDFName.of('Parent'), parent);
    dict.set(PDFName.of('Dest'), dest);
    if (kids.length > 0) {
      dict.set(PDFName.of('First'), kids[0].ref);
      dict.set(PDFName.of('Last'), kids[kids.length - 1].ref);
      dict.set(PDFName.of('Count'), PDFNumber.of(descendants));
    }
    built.push({ ref, dict, descendants });
  }
  linkSiblings(built);
  return built;
}

export async function writeOutline(doc: PDFDocument, nodes: readonly OutlineNode[]): Promise<void> {
  if (nodes.length === 0 || doc.getPageCount() === 0) return;
  const context = doc.context;
  const outlines = PDFDict.withContext(context);
  const outlinesRef = context.register(outlines);
  const built = buildLevel(doc, nodes, outlinesRef);
  if (built.length === 0) return;
  const visible = built.reduce((sum, item) => sum + 1 + item.descendants, 0);
  outlines.set(PDFName.of('Type'), PDFName.of('Outlines'));
  outlines.set(PDFName.of('First'), built[0].ref);
  outlines.set(PDFName.of('Last'), built[built.length - 1].ref);
  outlines.set(PDFName.of('Count'), PDFNumber.of(visible));
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

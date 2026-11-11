import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { FlatBookmark } from './types';

interface PdfjsOutlineItem {
  title?: string;
  dest?: unknown;
  items?: PdfjsOutlineItem[];
}

interface PdfjsDoc {
  numPages: number;
  getOutline(): Promise<PdfjsOutlineItem[] | null>;
  getDestination(dest: string): Promise<unknown>;
  getPageIndex(ref: unknown): Promise<number>;
  destroy(): Promise<void>;
}

const pdfjsApi = pdfjs as unknown as {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfjsDoc> };
  GlobalWorkerOptions: { workerSrc: string };
};

export function setPdfWorkerSrc(url: string): void {
  pdfjsApi.GlobalWorkerOptions.workerSrc = url;
}

async function pageFromDest(doc: PdfjsDoc, dest: unknown): Promise<number> {
  try {
    let explicit = dest;
    if (explicit && typeof (explicit as { then?: unknown }).then === 'function') {
      explicit = await explicit;
    }
    if (typeof explicit === 'string') explicit = await doc.getDestination(explicit);
    if (!Array.isArray(explicit) || explicit.length === 0) return -1;
    const ref = explicit[0] as unknown;
    if (ref && typeof ref === 'object') {
      const index = await doc.getPageIndex(ref);
      return index + 1;
    }
    if (typeof ref === 'number' && ref >= 0) return ref + 1;
    return -1;
  } catch {
    return -1;
  }
}

async function walk(doc: PdfjsDoc, items: PdfjsOutlineItem[], level: number, out: FlatBookmark[]): Promise<void> {
  const rows = await Promise.all(
    items.map(async (item) => {
      const page = await pageFromDest(doc, item.dest);
      const children: FlatBookmark[] = [];
      if (item.items && item.items.length > 0) await walk(doc, item.items, level + 1, children);
      return { page, title: String(item.title ?? ''), children };
    }),
  );
  for (const row of rows) {
    out.push({ level, title: row.title, page: row.page });
    out.push(...row.children);
  }
}

export async function readOutline(data: Uint8Array): Promise<{ pageCount: number; flat: FlatBookmark[] }> {
  const task = pdfjsApi.getDocument({
    data: data.slice(),
    isEvalSupported: false,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    useSystemFonts: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const pageCount = doc.numPages;
    const outline = (await doc.getOutline()) ?? [];
    const flat: FlatBookmark[] = [];
    await walk(doc, outline, 1, flat);
    return { pageCount, flat };
  } finally {
    await doc.destroy();
  }
}

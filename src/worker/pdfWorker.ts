import { zipSync } from 'fflate';
import { errorCodeFrom } from '../lib/errors';
import { mergePdfs, splitPdf } from '../lib/pdfOps';
import type { DistributiveOmit, WorkerIn, WorkerOut } from './protocol';

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.slice().buffer;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerIn>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (event: MessageEvent<WorkerIn>) => {
  const msg = event.data;
  const post = (data: DistributiveOmit<WorkerOut, 'id'>, transfer: Transferable[] = []) => {
    const payload = { id: msg.id, ...data } as WorkerOut;
    scope.postMessage(payload, transfer);
  };

  void (async () => {
    try {
      if (msg.op === 'split') {
        const results = await splitPdf(new Uint8Array(msg.buffer), msg.pieces, (progress) => {
          post({ type: 'progress', progress });
        });
        const files = results.map((result) => ({
          filename: result.filename,
          buffer: asBuffer(result.bytes),
        }));
        post(
          { type: 'done', files },
          files.map((file) => file.buffer),
        );
        return;
      }
      if (msg.op === 'merge') {
        const merged = await mergePdfs(
          msg.files.map((file) => ({
            title: file.title,
            bytes: new Uint8Array(file.buffer),
            outline: file.outline,
          })),
          (progress) => post({ type: 'progress', progress }),
        );
        const buffer = asBuffer(merged);
        post({ type: 'done', buffer }, [buffer]);
        return;
      }
      const packed: Record<string, Uint8Array> = {};
      for (const file of msg.files) packed[file.filename] = new Uint8Array(file.buffer);
      post({ type: 'progress', progress: { phase: 'zip', done: 0, total: 1, title: '' } });
      const zipped = zipSync(packed, { level: 0 });
      const buffer = asBuffer(zipped);
      post({ type: 'done', buffer }, [buffer]);
    } catch (err) {
      post({ type: 'error', code: errorCodeFrom(err) });
    }
  })();
};

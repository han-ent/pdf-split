import { errorCodeFrom, type JobErrorCode } from './errors';
import type { ProgressEvent } from './progress';
import type { DistributiveOmit, WorkerIn, WorkerOut } from '../worker/protocol';

export class JobError extends Error {
  readonly code: JobErrorCode;

  constructor(code: JobErrorCode) {
    super(code);
    this.name = 'JobError';
    this.code = code;
  }
}

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../worker/pdfWorker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

export function runJob(
  message: DistributiveOmit<WorkerIn, 'id'>,
  transfer: Transferable[],
  onProgress: (progress: ProgressEvent) => void,
): Promise<Extract<WorkerOut, { type: 'done' }>> {
  const current = getWorker();
  const id = ++seq;
  const payload = { ...message, id } as WorkerIn;
  return new Promise((resolve, reject) => {
    const fail = (code: JobErrorCode) => {
      cleanup();
      if (code === 'process') worker = null;
      reject(new JobError(code));
    };
    const onMessage = (event: MessageEvent<WorkerOut>) => {
      if (!event.data || event.data.id !== id) return;
      if (event.data.type === 'progress') onProgress(event.data.progress);
      else if (event.data.type === 'done') {
        cleanup();
        resolve(event.data);
      } else fail(event.data.code);
    };
    const onError = () => fail('process');
    const cleanup = () => {
      current.removeEventListener('message', onMessage);
      current.removeEventListener('error', onError);
    };
    current.addEventListener('message', onMessage);
    current.addEventListener('error', onError);
    try {
      current.postMessage(payload, transfer);
    } catch (err) {
      cleanup();
      reject(new JobError(errorCodeFrom(err)));
    }
  });
}

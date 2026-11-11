import type { JobErrorCode } from '../lib/errors';
import type { ProgressEvent } from '../lib/progress';
import type { SplitPiece } from '../lib/pdfOps';
import type { OutlineNode } from '../lib/types';

export interface MergeFileMsg {
  title: string;
  buffer: ArrayBuffer;
  outline: OutlineNode[];
}

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type WorkerIn =
  | { id: number; op: 'split'; buffer: ArrayBuffer; pieces: SplitPiece[] }
  | { id: number; op: 'merge'; files: MergeFileMsg[] }
  | { id: number; op: 'zip'; files: { filename: string; buffer: ArrayBuffer }[] };

export type WorkerOut =
  | { id: number; type: 'progress'; progress: ProgressEvent }
  | { id: number; type: 'done'; files?: { filename: string; buffer: ArrayBuffer }[]; buffer?: ArrayBuffer }
  | { id: number; type: 'error'; code: JobErrorCode };

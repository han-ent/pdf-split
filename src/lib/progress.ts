export interface ProgressEvent {
  phase: 'load' | 'copy' | 'zip' | 'file';
  done: number;
  total: number;
  title: string;
}

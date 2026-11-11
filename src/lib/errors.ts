export type JobErrorCode = 'encrypted' | 'read' | 'process';

export function errorCodeFrom(err: unknown): JobErrorCode {
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/password|encrypt/i.test(message)) return 'encrypted';
  if (/invalid pdf|invalidpdf|format|header|parse/i.test(message)) return 'read';
  return 'process';
}

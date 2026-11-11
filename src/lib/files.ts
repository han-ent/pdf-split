export async function readFile(file: File, onProgress: (ratio: number) => void): Promise<Uint8Array> {
  if (typeof file.stream !== 'function') {
    onProgress(1);
    return new Uint8Array(await file.arrayBuffer());
  }
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const total = file.size;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress(total > 0 ? Math.min(1, received / total) : 0);
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress(1);
  return data;
}

const heldUrls: string[] = [];

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  heldUrls.push(url);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

export function releaseDownloads(): void {
  for (const url of heldUrls) URL.revokeObjectURL(url);
  heldUrls.length = 0;
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

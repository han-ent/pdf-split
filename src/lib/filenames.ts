const ILLEGAL = '<>:"/\\|?*';

/**
 * Match pdf_tools.sanitize_filename: illegal and control characters become "_",
 * leading/trailing spaces and dots are removed, and the stem is capped at 150 characters.
 */
export function sanitizeFilename(name: string, fallback = 'untitled'): string {
  let cleaned = '';
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    if (ILLEGAL.includes(char) || code < 32) cleaned += '_';
    else cleaned += char;
  }
  cleaned = cleaned.trim().replace(/^\.+|\.+$/g, '').trim();
  if (!cleaned) return fallback;
  const chars = [...cleaned];
  if (chars.length > 150) cleaned = chars.slice(0, 150).join('').trimEnd();
  return cleaned || fallback;
}

/**
 * Match the desktop collision loop: A.pdf, A_2.pdf, then A_2_3.pdf.
 * `used` is updated with the returned name.
 */
export function uniquePdfName(filename: string, used: Set<string>): string {
  let current = filename;
  let counter = 2;
  while (used.has(current)) {
    const stem = current.toLowerCase().endsWith('.pdf') ? current.slice(0, -4) : current;
    current = `${stem}_${counter}.pdf`;
    counter += 1;
  }
  used.add(current);
  return current;
}

export function outputFileNames(titles: string[], prefix: boolean, fallback = 'untitled'): string[] {
  const used = new Set<string>();
  return titles.map((title, index) => {
    const safe = sanitizeFilename(title, fallback);
    const filename = prefix ? `${String(index + 1).padStart(3, '0')}_${safe}.pdf` : `${safe}.pdf`;
    return uniquePdfName(filename, used);
  });
}

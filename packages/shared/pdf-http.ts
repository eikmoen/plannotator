export interface PdfByteRange {
  start: number;
  end: number;
}

/** Parse one RFC 7233 byte range. Multiple ranges are intentionally rejected. */
export function parsePdfByteRange(header: string | null | undefined, size: number): PdfByteRange | null {
  if (!header || !Number.isSafeInteger(size) || size <= 0) return null;
  const match = header.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(startRaw);
  const requestedEnd = endRaw ? Number(endRaw) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || requestedEnd < start || start >= size) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

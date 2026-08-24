export interface PdfSearchPage {
  pageNumber: number;
  text: string;
}

export interface PdfSearchResult {
  pageNumber: number;
  snippet: string;
}

export interface PdfOutlineEntry {
  title: string;
  pageNumber?: number;
  depth: number;
}

export interface PdfReaderMemory {
  pageNumber: number;
  pageOffset: number;
  scaleValue: string;
}

type PdfTextItem = { str?: unknown };
type PdfTextPage = { getTextContent: () => Promise<{ items?: unknown[] }> };
type PdfTextDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfTextPage>;
};

type PdfOutlineNode = {
  title?: unknown;
  dest?: unknown;
  items?: unknown;
};

type PdfOutlineDocument = {
  getDestination: (name: string) => Promise<unknown>;
  getPageIndex: (reference: unknown) => Promise<number>;
};

const SEARCH_SNIPPET_RADIUS = 72;

export async function buildPdfSearchIndex(
  document: PdfTextDocument,
  maximumPages = 1_000,
  concurrency = 4,
): Promise<PdfSearchPage[]> {
  const pageCount = Math.min(document.numPages, Math.max(0, maximumPages));
  const results = new Array<PdfSearchPage>(pageCount);
  let nextPage = 1;

  async function worker() {
    while (nextPage <= pageCount) {
      const pageNumber = nextPage;
      nextPage += 1;
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = (Array.isArray(content.items) ? content.items : [])
        .map((item) => typeof (item as PdfTextItem)?.str === 'string' ? String((item as PdfTextItem).str) : '')
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      results[pageNumber - 1] = { pageNumber, text };
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), pageCount || 1) }, () => worker()));
  return results;
}

export function searchPdfIndex(
  index: readonly PdfSearchPage[],
  rawQuery: string,
  maximumResults = 200,
): PdfSearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query || maximumResults <= 0) return [];
  const results: PdfSearchResult[] = [];
  for (const page of index) {
    const lower = page.text.toLocaleLowerCase();
    let cursor = 0;
    while (results.length < maximumResults) {
      const match = lower.indexOf(query, cursor);
      if (match < 0) break;
      const start = Math.max(0, match - SEARCH_SNIPPET_RADIUS);
      const end = Math.min(page.text.length, match + query.length + SEARCH_SNIPPET_RADIUS);
      results.push({
        pageNumber: page.pageNumber,
        snippet: `${start > 0 ? '…' : ''}${page.text.slice(start, end).trim()}${end < page.text.length ? '…' : ''}`,
      });
      cursor = match + Math.max(1, query.length);
    }
    if (results.length >= maximumResults) break;
  }
  return results;
}

async function outlineDestinationPage(document: PdfOutlineDocument, destination: unknown): Promise<number | undefined> {
  try {
    const resolved = typeof destination === 'string' ? await document.getDestination(destination) : destination;
    if (!Array.isArray(resolved) || resolved.length === 0) return undefined;
    const reference = resolved[0];
    if (typeof reference === 'number' && Number.isInteger(reference) && reference >= 0) return reference + 1;
    return (await document.getPageIndex(reference)) + 1;
  } catch {
    return undefined;
  }
}

export async function flattenPdfOutline(
  document: PdfOutlineDocument,
  values: unknown,
  maximumEntries = 500,
): Promise<PdfOutlineEntry[]> {
  const flattened: PdfOutlineEntry[] = [];

  async function visit(nodes: unknown, depth: number): Promise<void> {
    if (!Array.isArray(nodes)) return;
    for (const raw of nodes) {
      if (flattened.length >= maximumEntries) return;
      if (!raw || typeof raw !== 'object') continue;
      const node = raw as PdfOutlineNode;
      const title = typeof node.title === 'string' && node.title.trim() ? node.title.trim() : 'Untitled section';
      flattened.push({
        title,
        pageNumber: await outlineDestinationPage(document, node.dest),
        depth,
      });
      await visit(node.items, depth + 1);
    }
  }

  await visit(values, 0);
  return flattened;
}

export function parsePdfReaderMemory(raw: string | null, pageCount: number): PdfReaderMemory | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PdfReaderMemory>;
    if (!Number.isInteger(parsed.pageNumber) || parsed.pageNumber! < 1 || parsed.pageNumber! > pageCount) return null;
    if (typeof parsed.pageOffset !== 'number' || !Number.isFinite(parsed.pageOffset) || parsed.pageOffset < 0) return null;
    if (typeof parsed.scaleValue !== 'string' || !parsed.scaleValue.trim()) return null;
    return {
      pageNumber: parsed.pageNumber!,
      pageOffset: parsed.pageOffset,
      scaleValue: parsed.scaleValue,
    };
  } catch {
    return null;
  }
}

export class PdfSelectionFinalizer {
  private pointerDown = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly finalize: () => void,
    private readonly delayMs = 80,
  ) {}

  beginPointerSelection(): void {
    this.pointerDown = true;
    this.clearTimer();
  }

  selectionChanged(): void {
    if (!this.pointerDown) this.schedule();
  }

  finishPointerSelection(): void {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    this.schedule();
  }

  dispose(): void {
    this.pointerDown = false;
    this.clearTimer();
  }

  private schedule(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.finalize();
    }, this.delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

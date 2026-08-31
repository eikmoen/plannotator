import { describe, expect, test } from 'bun:test';
import {
  PdfSelectionFinalizer,
  buildPdfSearchIndex,
  flattenPdfOutline,
  parsePdfReaderMemory,
  searchPdfIndex,
} from './pdfReader';

describe('PDF reader helpers', () => {
  test('indexes page text and returns bounded snippets in page order', async () => {
    const document = {
      numPages: 2,
      async getPage(pageNumber: number) {
        return {
          async getTextContent() {
            return { items: [{ str: pageNumber === 1 ? 'Digital transformation changes work' : 'Work practices shape transformation' }] };
          },
        };
      },
    };
    const index = await buildPdfSearchIndex(document, 100, 2);
    expect(index.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(searchPdfIndex(index, 'transformation')).toEqual([
      { pageNumber: 1, snippet: 'Digital transformation changes work' },
      { pageNumber: 2, snippet: 'Work practices shape transformation' },
    ]);
  });

  test('flattens nested outlines and resolves explicit and named destinations', async () => {
    const document = {
      async getDestination(name: string) { return name === 'methods' ? [{ ref: 'p3' }] : null; },
      async getPageIndex(reference: unknown) { return (reference as { ref: string }).ref === 'p3' ? 2 : 0; },
    };
    const outline = await flattenPdfOutline(document, [
      { title: 'Introduction', dest: [0], items: [] },
      { title: 'Analysis', items: [{ title: 'Methods', dest: 'methods', items: [] }] },
    ]);
    expect(outline).toEqual([
      { title: 'Introduction', pageNumber: 1, depth: 0 },
      { title: 'Analysis', pageNumber: undefined, depth: 0 },
      { title: 'Methods', pageNumber: 3, depth: 1 },
    ]);
  });

  test('validates remembered position against the active document', () => {
    expect(parsePdfReaderMemory('{"pageNumber":3,"pageOffset":24,"scaleValue":"page-width"}', 4)).toEqual({
      pageNumber: 3,
      pageOffset: 24,
      scaleValue: 'page-width',
    });
    expect(parsePdfReaderMemory('{"pageNumber":5,"pageOffset":0,"scaleValue":"1"}', 4)).toBeNull();
    expect(parsePdfReaderMemory('invalid', 4)).toBeNull();
  });

  test('does not finalize an intermediate range during a long pointer hold', async () => {
    let finalizations = 0;
    const finalizer = new PdfSelectionFinalizer(() => { finalizations += 1; }, 10);
    finalizer.beginPointerSelection();
    finalizer.selectionChanged();
    await Bun.sleep(20);
    expect(finalizations).toBe(0);

    finalizer.selectionChanged();
    finalizer.finishPointerSelection();
    await Bun.sleep(20);
    expect(finalizations).toBe(1);
    finalizer.dispose();
  });

  test('debounces keyboard-driven selection changes', async () => {
    let finalizations = 0;
    const finalizer = new PdfSelectionFinalizer(() => { finalizations += 1; }, 10);
    finalizer.selectionChanged();
    finalizer.selectionChanged();
    await Bun.sleep(20);
    expect(finalizations).toBe(1);
    finalizer.dispose();
  });
});

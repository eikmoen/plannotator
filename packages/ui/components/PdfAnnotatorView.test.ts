import { describe, expect, test } from 'bun:test';
import { pdfQuickLabels } from './PdfAnnotatorView';

describe('PdfAnnotatorView native label adapter', () => {
  test('projects document-owned labels into Plannotator quick labels', () => {
    expect(pdfQuickLabels({
      red: 'Anchor',
      blue: 'Definition',
      yellow: 'Example',
      green: 'Thesis',
    })).toEqual([
      { id: 'pdf-red', emoji: '●', text: 'Anchor', color: 'red' },
      { id: 'pdf-blue', emoji: '●', text: 'Definition', color: 'blue' },
      { id: 'pdf-yellow', emoji: '●', text: 'Example', color: 'yellow' },
      { id: 'pdf-green', emoji: '●', text: 'Thesis', color: 'green' },
    ]);
  });
});

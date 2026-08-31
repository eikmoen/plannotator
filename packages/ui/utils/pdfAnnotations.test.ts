import { describe, expect, test } from 'bun:test';
import type { PdfAnnotation, PdfGlobalComment } from '@plannotator/core/pdf-annotations';
import { AnnotationType } from '../types';
import {
  applyAnnotationUpdatesToPdf,
  applyAnnotationUpdatesToPdfGlobalComment,
  pdfAnnotationToAnnotation,
  pdfGlobalCommentToAnnotation,
} from './pdfAnnotations';

const source: PdfAnnotation = {
  id: 'pdf-1',
  color: 'blue',
  imported: true,
  author: 'Eik',
  note: 'Original note',
  highlighted_text: 'Selected text',
  page: 4,
  pdf_page: 4,
  page_label: '2',
  created_at: '2026-08-24T06:00:00.000Z',
  content: { text: 'Selected text' },
  position: { boundingRect: {}, rects: [], pageNumber: 4 },
  comment: { text: 'Original note', color: 'blue', author: 'Eik' },
};

const labels = {
  red: 'Anchor',
  blue: 'Definition',
  yellow: 'Example',
  green: 'Thesis',
};

describe('PDF native annotation projection', () => {
  test('projects page, label, quote, note, and imported state', () => {
    const annotation = pdfAnnotationToAnnotation(source, labels);
    expect(annotation.originalText).toBe('Selected text');
    expect(annotation.text).toBe('Original note');
    expect(annotation.author).toBe('Eik');
    expect(annotation.pdfAnchor).toEqual(expect.objectContaining({
      color: 'blue',
      label: 'Definition',
      page: 4,
      pageLabel: '2',
      imported: true,
    }));
  });

  test('projects and edits document-level comments as native global comments', () => {
    const sourceComment: PdfGlobalComment = {
      id: 'pdf-global-1',
      text: 'Comment on the whole paper.',
      author: 'Eik',
      created_at: '2026-08-24T18:00:00.000Z',
    };
    const projected = pdfGlobalCommentToAnnotation(sourceComment);
    expect(projected.type).toBe(AnnotationType.GLOBAL_COMMENT);
    expect(projected.text).toBe('Comment on the whole paper.');
    expect(projected.pdfAnchor).toBeUndefined();
    expect(applyAnnotationUpdatesToPdfGlobalComment(sourceComment, { text: 'Revised overview.' })).toEqual({
      ...sourceComment,
      text: 'Revised overview.',
    });
  });

  test('round-trips native panel edits without losing the PDF anchor', () => {
    const projected = pdfAnnotationToAnnotation(source, labels);
    const updated = applyAnnotationUpdatesToPdf(source, {
      text: 'Revised note',
      author: 'Em',
      pdfAnchor: { ...projected.pdfAnchor!, color: 'green', label: 'Thesis' },
    });
    expect(updated.position).toEqual(source.position);
    expect(updated.content).toEqual(source.content);
    expect(updated.note).toBe('Revised note');
    expect(updated.comment.text).toBe('Revised note');
    expect(updated.author).toBe('Em');
    expect(updated.color).toBe('green');
    expect(updated.label).toBe('Thesis');
    expect(updated.comment.color).toBe('green');
    expect(updated.imported).toBeFalse();
    expect(updated.embedded).toBeFalse();
  });
});

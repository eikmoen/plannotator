import type {
  PdfAnnotation,
  PdfAnnotationColor,
  PdfAnnotationDocument,
  PdfGlobalComment,
} from '@plannotator/core/pdf-annotations';
import { AnnotationType, type Annotation } from '../types';

function pdfColor(annotation: PdfAnnotation): PdfAnnotationColor {
  return annotation.color || annotation.comment?.color || 'yellow';
}

function pdfPage(annotation: PdfAnnotation): number {
  return annotation.pdf_page || annotation.page || annotation.position.pageNumber;
}

function pdfCreatedAt(annotation: PdfAnnotation): number {
  const parsed = annotation.created_at ? Date.parse(annotation.created_at) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function pdfAnnotationLabel(
  annotation: PdfAnnotation,
  labels: PdfAnnotationDocument['labels'],
): string {
  return annotation.label || labels[pdfColor(annotation)] || 'Comment';
}

/** Project the canonical PDF sidecar shape into Plannotator's presentation model. */
export function pdfAnnotationToAnnotation(
  annotation: PdfAnnotation,
  labels: PdfAnnotationDocument['labels'],
): Annotation {
  const color = pdfColor(annotation);
  const page = pdfPage(annotation);
  return {
    id: annotation.id,
    blockId: '',
    startOffset: 0,
    endOffset: 0,
    type: AnnotationType.COMMENT,
    text: annotation.note || annotation.comment?.text || '',
    originalText: annotation.highlighted_text || annotation.content?.text || '[area highlight]',
    createdA: pdfCreatedAt(annotation),
    author: annotation.author || annotation.comment?.author,
    pdfAnchor: {
      position: annotation.position,
      content: annotation.content,
      color,
      label: pdfAnnotationLabel(annotation, labels),
      page,
      pageLabel: annotation.page_label || String(page),
      imported: annotation.imported,
      embedded: annotation.embedded,
    },
  };
}

export function pdfGlobalCommentToAnnotation(comment: PdfGlobalComment): Annotation {
  const parsedCreatedAt = comment.created_at ? Date.parse(comment.created_at) : Number.NaN;
  return {
    id: comment.id,
    blockId: '',
    startOffset: 0,
    endOffset: 0,
    type: AnnotationType.GLOBAL_COMMENT,
    text: comment.text,
    originalText: '',
    createdA: Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : Date.now(),
    author: comment.author,
  };
}

export function applyAnnotationUpdatesToPdfGlobalComment(
  comment: PdfGlobalComment,
  updates: Partial<Annotation>,
): PdfGlobalComment {
  return {
    ...comment,
    text: updates.text ?? comment.text,
    author: updates.author ?? comment.author,
  };
}

/** Apply edits made by the native annotation panel back to the sidecar shape. */
export function applyAnnotationUpdatesToPdf(
  annotation: PdfAnnotation,
  updates: Partial<Annotation>,
): PdfAnnotation {
  const note = updates.text ?? annotation.note ?? annotation.comment?.text ?? '';
  const author = updates.author ?? annotation.author ?? annotation.comment?.author;
  const color = updates.pdfAnchor?.color ?? annotation.color ?? annotation.comment?.color ?? 'yellow';
  const label = updates.pdfAnchor?.label ?? annotation.label;
  return {
    ...annotation,
    imported: false,
    embedded: false,
    note,
    author,
    color,
    label,
    comment: {
      ...annotation.comment,
      text: note,
      author,
      color,
      emoji: '',
    },
  };
}

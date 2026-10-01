/** Browser-safe PDF annotation contract shared by the viewer and servers. */

export const PDF_ANNOTATION_COLORS = ["red", "blue", "yellow", "green"] as const;
export type PdfAnnotationColor = (typeof PDF_ANNOTATION_COLORS)[number];

export const DEFAULT_PDF_ANNOTATION_LABELS = {
  red: "Anchor",
  blue: "Definition",
  yellow: "Example",
  green: "Thesis",
} as const satisfies Record<PdfAnnotationColor, string>;

export interface PdfAnnotationRect {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  pageNumber?: number;
  [key: string]: number | undefined;
}

export interface PdfAnnotationPosition {
  boundingRect: PdfAnnotationRect;
  rects: PdfAnnotationRect[];
  pageNumber: number;
  usePdfCoordinates?: boolean;
}

export interface PdfAnnotationComment {
  text: string;
  emoji?: string;
  color?: PdfAnnotationColor;
  author?: string;
  type?: string;
}

/**
 * Compatible with the sidecars written by the existing Pi Annotate viewer and
 * with react-pdf-highlighter's serializable highlight shape.
 */
export interface PdfAnnotation {
  id: string;
  color?: PdfAnnotationColor;
  /** Optional per-annotation display label. Older sidecars derive it from color. */
  label?: string;
  embedded?: boolean;
  imported?: boolean;
  imported_from?: string;
  type?: string;
  author?: string;
  note?: string;
  highlighted_text?: string;
  page?: number;
  pdf_page?: number;
  page_label?: string;
  created_at?: string;
  content: { text?: string; image?: string };
  position: PdfAnnotationPosition;
  comment: PdfAnnotationComment;
}

export interface PdfGlobalComment {
  id: string;
  text: string;
  author?: string;
  created_at?: string;
}

export interface PdfPageMapping {
  mode?: "offset" | "labels";
  pdf_page_1_is?: number | string;
  pdf_page?: number;
  label?: number | string;
  offset?: number;
  labels?: Record<string, string | number>;
}

export interface PdfSourceDescriptor {
  /** Absolute source PDF path, server-authored and never trusted from clients. */
  pdfPath: string;
  /** Directory containing source.pdf, annotations.md, and metadata/. */
  sourceDirectory: string;
  pdfName: string;
}

export interface PdfAnnotationDocument {
  /** Revision of the canonical sidecars, for compare-and-swap writes. */
  revision?: string;
  source: {
    fileName: string;
    /** Human-readable document title, preferably from a sibling metadata.json. */
    displayName?: string;
    /** Ordered author names from the same document metadata. */
    authors?: string[];
  };
  annotations: PdfAnnotation[];
  /** Document-level notes with no page or text-selection anchor. */
  globalComments: PdfGlobalComment[];
  pageMapping?: PdfPageMapping;
  labels: Record<PdfAnnotationColor, string>;
}

export function isPdfAnnotationColor(value: unknown): value is PdfAnnotationColor {
  return typeof value === "string" && (PDF_ANNOTATION_COLORS as readonly string[]).includes(value);
}

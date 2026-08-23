import {
  DEFAULT_PDF_ANNOTATION_LABELS,
  PDF_ANNOTATION_COLORS,
  type PdfAnnotation,
  type PdfAnnotationColor,
  type PdfAnnotationDocument,
  type PdfAnnotationRect,
  type PdfPageMapping,
  type PdfSourceDescriptor,
} from "@plannotator/core/pdf-annotations";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const PDF_ANNOTATION_MAX_COUNT = 10_000;

export interface PdfAnnotationSidecarPaths {
  pdf: string;
  markdown: string;
  normalized: string;
  raw: string;
  hidden: string;
  metadata: string;
  migrationReport: string;
}

export function describePdfSource(pdfPath: string): PdfSourceDescriptor {
  const fileStat = statSync(pdfPath);
  if (!fileStat.isFile()) throw new Error(`PDF source is not a file: ${pdfPath}`);
  if (!/\.pdf$/i.test(pdfPath)) throw new Error(`PDF source must use the .pdf extension: ${pdfPath}`);
  return {
    pdfPath,
    sourceDirectory: dirname(pdfPath),
    pdfName: basename(pdfPath),
  };
}

export function pdfAnnotationSidecarPaths(source: PdfSourceDescriptor): PdfAnnotationSidecarPaths {
  const metadataDirectory = join(source.sourceDirectory, "metadata");
  return {
    pdf: source.pdfPath,
    markdown: join(source.sourceDirectory, "annotations.md"),
    normalized: join(metadataDirectory, "annotations.json"),
    raw: join(metadataDirectory, "annotations-raw.json"),
    hidden: join(metadataDirectory, "annotations-hidden.json"),
    metadata: join(metadataDirectory, "metadata.json"),
    migrationReport: join(metadataDirectory, "migration-report.json"),
  };
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function colorFromRaw(row: Record<string, unknown>): PdfAnnotationColor {
  const explicit = String(row.color || row.colour || "").toLowerCase();
  if ((PDF_ANNOTATION_COLORS as readonly string[]).includes(explicit)) {
    return explicit as PdfAnnotationColor;
  }
  const stroke = row.stroke || row.color_rgb || (row.colors as Record<string, unknown> | undefined)?.stroke;
  if (Array.isArray(stroke) && stroke.length >= 3) {
    const [red, green, blue] = stroke.map(Number);
    if (blue > red && blue > green) return "blue";
    if (green > red && green > blue) return "green";
    if (red > 0.8 && green < 0.5) return "red";
    if (red > 0.7 && green > 0.5) return "yellow";
  }
  const text = `${row.note || ""} ${row.subject || ""}`.toLowerCase();
  if (/definition|setup|signpost|context|framing|distinction|glossary/.test(text)) return "blue";
  if (/main|anchor|claim|concept|mechanism|argument|takeaway/.test(text)) return "red";
  return "yellow";
}

function metadataPageSize(source: PdfSourceDescriptor): { width: number; height: number } | undefined {
  const metadata = readJson<Record<string, unknown> | undefined>(pdfAnnotationSidecarPaths(source).metadata, undefined);
  const pageSize = (metadata?.pdfinfo as Record<string, unknown> | undefined)?.["Page size"];
  if (typeof pageSize !== "string") return undefined;
  const match = pageSize.match(/([0-9.]+)\s+x\s+([0-9.]+)/);
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function loadRawPdfAnnotations(source: PdfSourceDescriptor): PdfAnnotation[] {
  const rows = readJson<unknown[]>(pdfAnnotationSidecarPaths(source).raw, []);
  if (!Array.isArray(rows)) return [];
  const fallbackPageSize = metadataPageSize(source) ?? { width: 595, height: 842 };
  return rows
    .map((value, index): PdfAnnotation | undefined => {
      if (!value || typeof value !== "object") return undefined;
      const row = value as Record<string, unknown>;
      const rawRects = Array.isArray(row.rects) && row.rects.length > 0 ? row.rects : [row.rect];
      const rects = rawRects
        .filter((rect): rect is unknown[] => Array.isArray(rect) && rect.length >= 4)
        .map((rect) => rect.map(Number))
        .filter((rect) => rect.every(Number.isFinite));
      const page = asFiniteNumber(row.page, 1);
      if (rects.length === 0 || page < 1) return undefined;
      const pageSize = Array.isArray(row.page_size) && row.page_size.length >= 2
        ? { width: asFiniteNumber(row.page_size[0], fallbackPageSize.width), height: asFiniteNumber(row.page_size[1], fallbackPageSize.height) }
        : fallbackPageSize;
      const [x1, y1, x2, y2] = [
        Math.min(...rects.map((rect) => rect[0])),
        Math.min(...rects.map((rect) => rect[1])),
        Math.max(...rects.map((rect) => rect[2])),
        Math.max(...rects.map((rect) => rect[3])),
      ];
      const color = colorFromRaw(row);
      const note = String(row.note || "");
      const author = String(row.author || "Eik");
      const highlightedText = String(row.highlighted_text || "");
      const toRect = ([rx1, ry1, rx2, ry2]: number[]): PdfAnnotationRect => ({
        x1: rx1,
        y1: ry1,
        x2: rx2,
        y2: ry2,
        width: pageSize.width,
        height: pageSize.height,
        pageNumber: page,
      });
      return {
        id: String(row.id || `legacy-${page}-${index}`),
        embedded: true,
        imported: true,
        imported_from: "annotations-raw.json",
        color,
        author,
        note,
        highlighted_text: highlightedText,
        page,
        pdf_page: page,
        page_label: String(row.page_label || page),
        content: { text: highlightedText },
        position: {
          boundingRect: { x1, y1, x2, y2, width: pageSize.width, height: pageSize.height, pageNumber: page },
          rects: rects.map(toRect),
          pageNumber: page,
        },
        comment: { text: note, emoji: "", color, author },
      };
    })
    .filter((annotation): annotation is PdfAnnotation => annotation !== undefined);
}

function loadPageMapping(source: PdfSourceDescriptor): PdfPageMapping | undefined {
  const metadata = readJson<Record<string, unknown> | undefined>(pdfAnnotationSidecarPaths(source).metadata, undefined);
  const mapping = metadata?.page_mapping ?? metadata?.pageMapping;
  return mapping && typeof mapping === "object" ? mapping as PdfPageMapping : undefined;
}

function pdfPage(annotation: PdfAnnotation): number {
  return annotation.position?.pageNumber || annotation.pdf_page || annotation.page || 1;
}

function rectNumber(annotation: PdfAnnotation, key: "x1" | "y1" | "left" | "top" | "width"): number {
  const rect = annotation.position?.boundingRect || annotation.position?.rects?.[0] || {};
  return typeof rect[key] === "number" ? rect[key] : 0;
}

function columnIndex(annotation: PdfAnnotation): number {
  const rect = annotation.position?.boundingRect || annotation.position?.rects?.[0] || {};
  const width = typeof rect.width === "number" ? rect.width : 0;
  const left = rectNumber(annotation, "x1") || rectNumber(annotation, "left");
  const directWidth = rectNumber(annotation, "width");
  const highlightWidth = typeof rect.x2 === "number" ? Math.max(0, rect.x2 - left) : directWidth;
  return width && left > width * 0.45 && highlightWidth < width * 0.5 ? 1 : 0;
}

export function sortPdfAnnotations(annotations: readonly PdfAnnotation[]): PdfAnnotation[] {
  return [...annotations].sort((left, right) =>
    (pdfPage(left) - pdfPage(right))
    || (columnIndex(left) - columnIndex(right))
    || ((rectNumber(left, "y1") || rectNumber(left, "top")) - (rectNumber(right, "y1") || rectNumber(right, "top")))
    || ((rectNumber(left, "x1") || rectNumber(left, "left")) - (rectNumber(right, "x1") || rectNumber(right, "left")))
    || left.id.localeCompare(right.id));
}

export function pageLabelForPdfPage(page: number, mapping?: PdfPageMapping, existing?: string | number): string {
  if (mapping?.labels?.[String(page)] !== undefined) return String(mapping.labels[String(page)]);
  if (mapping?.offset !== undefined) return String(page + mapping.offset);
  if (mapping?.pdf_page !== undefined && mapping.label !== undefined) {
    const label = Number(mapping.label);
    if (Number.isFinite(label)) return String(page + (label - mapping.pdf_page));
  }
  if (mapping?.pdf_page_1_is !== undefined) {
    const label = Number(mapping.pdf_page_1_is);
    if (Number.isFinite(label)) return String(page + label - 1);
  }
  return existing !== undefined && String(existing).length > 0 ? String(existing) : String(page);
}

function annotationColor(annotation: PdfAnnotation): PdfAnnotationColor {
  const color = annotation.color ?? annotation.comment?.color;
  if (color && (PDF_ANNOTATION_COLORS as readonly string[]).includes(color)) return color;
  const legacy = String(annotation.type || annotation.comment?.type || "").toLowerCase();
  if (["claim", "concept", "method", "relevance"].includes(legacy)) return "red";
  if (["question", "todo", "note"].includes(legacy)) return "blue";
  return "yellow";
}

function annotationAuthor(annotation: PdfAnnotation): string {
  return annotation.author || annotation.comment?.author || "Eik";
}

function annotationNote(annotation: PdfAnnotation): string {
  return annotation.note || annotation.comment?.text || "";
}

function annotationQuote(annotation: PdfAnnotation): string {
  return annotation.highlighted_text || annotation.content?.text || "";
}

function normalizePdfAnnotations(
  annotations: readonly PdfAnnotation[],
  mapping?: PdfPageMapping,
): PdfAnnotation[] {
  if (annotations.length > PDF_ANNOTATION_MAX_COUNT) {
    throw new Error(`Too many PDF annotations (max ${PDF_ANNOTATION_MAX_COUNT})`);
  }
  return sortPdfAnnotations(annotations.filter((annotation) => !annotation.imported)).map((annotation) => {
    if (!annotation.id || !annotation.position || !annotation.content || !annotation.comment) {
      throw new Error("Invalid PDF annotation payload");
    }
    const color = annotationColor(annotation);
    const page = pdfPage(annotation);
    const author = annotationAuthor(annotation);
    const note = annotationNote(annotation);
    return {
      ...annotation,
      color,
      type: undefined,
      author,
      note,
      highlighted_text: annotationQuote(annotation),
      page,
      pdf_page: page,
      page_label: pageLabelForPdfPage(page, mapping, annotation.page_label),
      comment: { ...annotation.comment, emoji: "", color, type: undefined, author, text: note },
    };
  });
}

function markdownLabel(color: PdfAnnotationColor): string {
  return ({ red: "anchor", blue: "definition", yellow: "example", green: "thesis" } as const)[color];
}

export function renderPdfAnnotationsMarkdown(
  pdfName: string,
  annotations: readonly PdfAnnotation[],
  mapping?: PdfPageMapping,
): string {
  const lines = ["## Browser annotations", "", "<!-- pi-annotate:start -->", ""];
  const sorted = sortPdfAnnotations(annotations);
  if (sorted.length === 0) lines.push("No browser annotations yet.", "");
  let currentPage: number | undefined;
  for (const annotation of sorted) {
    const page = pdfPage(annotation);
    const label = pageLabelForPdfPage(page, mapping, annotation.page_label);
    if (page !== currentPage) {
      currentPage = page;
      lines.push(`### Page ${label}`, "");
    }
    const color = annotationColor(annotation);
    const note = annotationNote(annotation);
    const author = annotationAuthor(annotation);
    const quote = annotationQuote(annotation).replace(/\s+/g, " ").trim();
    let heading = `- **${markdownLabel(color)}** — [[${pdfName}#page=${page}|${pdfName}, p. ${label}]]`;
    if (note) heading += ` — ${note}`;
    if (author) heading += ` _(by ${author})_`;
    lines.push(heading);
    if (quote) lines.push(`  > ${quote}`);
    lines.push("");
  }
  lines.push("<!-- pi-annotate:end -->", "");
  return lines.join("\n");
}

function mergePdfAnnotationsMarkdown(
  existing: string,
  pdfName: string,
  annotations: readonly PdfAnnotation[],
  mapping?: PdfPageMapping,
): string {
  const section = renderPdfAnnotationsMarkdown(pdfName, annotations, mapping).trimEnd();
  const marker = /\n?## Browser annotations\n\n<!-- pi-annotate:start -->[\s\S]*?<!-- pi-annotate:end -->\n?/;
  if (marker.test(existing)) return existing.replace(marker, `\n${section}\n`);
  return `${existing.trimEnd()}\n\n${section}\n`;
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, content, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* renamed or never created */ }
  }
}

export function loadPdfAnnotationDocument(source: PdfSourceDescriptor): PdfAnnotationDocument {
  const paths = pdfAnnotationSidecarPaths(source);
  const browser = readJson<unknown[]>(paths.normalized, [])
    .filter((value): value is PdfAnnotation => Boolean(
      value && typeof value === "object"
      && "id" in value && "position" in value && "content" in value && "comment" in value,
    ));
  const hiddenValues = readJson<unknown[]>(paths.hidden, []);
  const hidden = new Set(hiddenValues.filter((value): value is string => typeof value === "string"));
  const raw = loadRawPdfAnnotations(source).filter((annotation) => !hidden.has(annotation.id));
  const seen = new Set(browser.map((annotation) => annotation.id));
  return {
    source: { fileName: source.pdfName },
    annotations: sortPdfAnnotations([...browser, ...raw.filter((annotation) => !seen.has(annotation.id))]),
    pageMapping: loadPageMapping(source),
    labels: { ...DEFAULT_PDF_ANNOTATION_LABELS },
  };
}

export function savePdfAnnotationDocument(
  source: PdfSourceDescriptor,
  annotations: readonly PdfAnnotation[],
): PdfAnnotationDocument {
  const paths = pdfAnnotationSidecarPaths(source);
  const mapping = loadPageMapping(source);
  const currentIds = new Set(annotations.map((annotation) => annotation.id));
  const hiddenIds = loadRawPdfAnnotations(source)
    .map((annotation) => annotation.id)
    .filter((id) => !currentIds.has(id))
    .sort();
  const normalized = normalizePdfAnnotations(annotations, mapping);
  const existingMarkdown = existsSync(paths.markdown)
    ? readFileSync(paths.markdown, "utf8")
    : `# Annotations — ${basename(source.sourceDirectory)}\n\n## Notes\n\n## Quotes\n\n## Relevance\n`;

  atomicWrite(paths.hidden, `${JSON.stringify([...new Set(hiddenIds)], null, 2)}\n`);
  atomicWrite(paths.normalized, `${JSON.stringify(normalized, null, 2)}\n`);
  atomicWrite(paths.markdown, mergePdfAnnotationsMarkdown(existingMarkdown, source.pdfName, normalized, mapping));
  return loadPdfAnnotationDocument(source);
}

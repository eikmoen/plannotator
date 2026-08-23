import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PdfAnnotation } from "@plannotator/core/pdf-annotations";
import {
  describePdfSource,
  loadPdfAnnotationDocument,
  pdfAnnotationSidecarPaths,
  savePdfAnnotationDocument,
} from "./pdf-annotation-store";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function annotation(id: string, page: number, color: PdfAnnotation["color"] = "red"): PdfAnnotation {
  return {
    id,
    color,
    author: "Eik",
    note: `${id} note`,
    highlighted_text: `${id} quote`,
    content: { text: `${id} quote` },
    position: {
      boundingRect: { x1: 10, y1: page * 20, x2: 110, y2: page * 20 + 10, width: 595, height: 842, pageNumber: page },
      rects: [{ x1: 10, y1: page * 20, x2: 110, y2: page * 20 + 10, width: 595, height: 842, pageNumber: page }],
      pageNumber: page,
    },
    comment: { text: `${id} note`, color, author: "Eik" },
  };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "plannotator-pdf-store-"));
  temporaryDirectories.push(directory);
  const pdfPath = join(directory, "source.pdf");
  const pdfBytes = Buffer.from("%PDF-1.4\nfixture\n%%EOF\n");
  writeFileSync(pdfPath, pdfBytes);
  mkdirSync(join(directory, "metadata"));
  writeFileSync(join(directory, "metadata", "metadata.json"), JSON.stringify({ page_mapping: { mode: "offset", pdf_page_1_is: 35 } }));
  writeFileSync(join(directory, "metadata", "annotations.json"), JSON.stringify([annotation("browser", 2, "green")]));
  writeFileSync(join(directory, "metadata", "annotations-raw.json"), JSON.stringify([
    { id: "embedded", page: 1, rect: [20, 30, 120, 40], page_size: [595, 842], color: "blue", note: "raw note", author: "Eik", highlighted_text: "raw quote" },
  ]));
  writeFileSync(join(directory, "annotations.md"), "# Existing\n\n## Notes\n\nHand-written note.\n");
  return { directory, pdfPath, pdfBytes, source: describePdfSource(pdfPath) };
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("PDF annotation sidecar store", () => {
  test("loads normalized and raw embedded annotations with page mapping", () => {
    const { source } = fixture();
    const document = loadPdfAnnotationDocument(source);
    expect(document.annotations.map(({ id }) => id)).toEqual(["embedded", "browser"]);
    expect(document.annotations[0].imported).toBe(true);
    expect(document.pageMapping?.pdf_page_1_is).toBe(35);
    expect(document.labels.green).toBe("Thesis");
  });

  test("saves browser annotations atomically without changing PDF bytes or hand-written Markdown", () => {
    const { pdfPath, pdfBytes, source } = fixture();
    const loaded = loadPdfAnnotationDocument(source);
    const added = annotation("added", 3, "yellow");
    const saved = savePdfAnnotationDocument(source, [...loaded.annotations, added]);
    const paths = pdfAnnotationSidecarPaths(source);

    expect(hash(readFileSync(pdfPath))).toBe(hash(pdfBytes));
    expect(saved.annotations.map(({ id }) => id)).toEqual(["embedded", "browser", "added"]);
    const normalized = JSON.parse(readFileSync(paths.normalized, "utf8"));
    expect(normalized.map(({ id }: { id: string }) => id)).toEqual(["browser", "added"]);
    expect(normalized[0].page_label).toBe("36");
    expect(normalized[1].page_label).toBe("37");
    const markdown = readFileSync(paths.markdown, "utf8");
    expect(markdown).toContain("Hand-written note.");
    expect(markdown).toContain("<!-- pi-annotate:start -->");
    expect(markdown).toContain("[[source.pdf#page=3|source.pdf, p. 37]]");
    expect(JSON.parse(readFileSync(paths.hidden, "utf8"))).toEqual([]);
  });

  test("records a removed imported annotation as hidden without normalizing it", () => {
    const { source } = fixture();
    const loaded = loadPdfAnnotationDocument(source);
    savePdfAnnotationDocument(source, loaded.annotations.filter(({ id }) => id !== "embedded"));
    const paths = pdfAnnotationSidecarPaths(source);
    expect(JSON.parse(readFileSync(paths.hidden, "utf8"))).toEqual(["embedded"]);
    expect(JSON.parse(readFileSync(paths.normalized, "utf8")).map(({ id }: { id: string }) => id)).toEqual(["browser"]);
    expect(loadPdfAnnotationDocument(source).annotations.map(({ id }) => id)).toEqual(["browser"]);
  });
});

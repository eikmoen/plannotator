import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PdfAnnotation } from "@plannotator/shared/pdf-annotations";
import { startAnnotateServer, type AnnotateServerResult } from "./annotate";

const directories: string[] = [];
const servers: AnnotateServerResult[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pdfFixture() {
  const directory = mkdtempSync(join(tmpdir(), "plannotator-bun-pdf-"));
  directories.push(directory);
  mkdirSync(join(directory, "metadata"));
  const bytes = Buffer.from("%PDF-1.4\n0123456789\n%%EOF\n");
  const pdfPath = join(directory, "source.pdf");
  const markdownPath = join(directory, "notes.md");
  writeFileSync(pdfPath, bytes);
  writeFileSync(markdownPath, "# Notes\n");
  return { directory, bytes, pdfPath, markdownPath };
}

function annotation(): PdfAnnotation {
  return {
    id: "one",
    color: "red",
    author: "Eik",
    note: "note",
    highlighted_text: "quote",
    content: { text: "quote" },
    position: {
      boundingRect: { x1: 1, y1: 2, x2: 3, y2: 4, width: 595, height: 842, pageNumber: 1 },
      rects: [{ x1: 1, y1: 2, x2: 3, y2: 4, width: 595, height: 842, pageNumber: 1 }],
      pageNumber: 1,
    },
    comment: { text: "note", color: "red", author: "Eik" },
  };
}

describe.skipIf(Boolean(process.env.PLANNOTATOR_PORT))("Bun PDF annotate server", () => {
  test("advertises the PDF surface, streams ranges, and saves sidecars without rewriting the PDF", async () => {
    const fixture = pdfFixture();
    const server = await startAnnotateServer({
      markdown: "",
      filePath: fixture.pdfPath,
      htmlContent: "<!doctype html><div id=\"root\"></div>",
      mode: "annotate",
      renderPdf: true,
      sharingEnabled: false,
    });
    servers.push(server);

    const plan = await fetch(`${server.url}/api/plan`).then((response) => response.json());
    expect(plan).toMatchObject({ renderAs: "pdf", pdf: { url: "/api/pdf", annotationsUrl: "/api/pdf/annotations" } });
    expect(plan.sourceSave).toEqual({ enabled: false, reason: "pdf-render" });

    const range = await fetch(`${server.url}/api/pdf`, { headers: { Range: "bytes=5-9" } });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toBe(`bytes 5-9/${fixture.bytes.length}`);
    expect(Buffer.from(await range.arrayBuffer())).toEqual(fixture.bytes.subarray(5, 10));

    const before = sha256(readFileSync(fixture.pdfPath));
    const save = await fetch(`${server.url}/api/pdf/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        annotations: [annotation()],
        globalComments: [{ id: "global-one", text: "Whole-document note", author: "Eik" }],
      }),
    });
    expect(save.status).toBe(200);
    expect(await save.json()).toMatchObject({ ok: true, count: 1, globalCommentCount: 1 });
    expect(sha256(readFileSync(fixture.pdfPath))).toBe(before);

    const loaded = await fetch(`${server.url}/api/pdf/annotations`).then((response) => response.json());
    expect(loaded.annotations.map(({ id }: { id: string }) => id)).toEqual(["one"]);
    expect(loaded.globalComments).toEqual([{ id: "global-one", text: "Whole-document note", author: "Eik" }]);
    const annotationsMarkdown = readFileSync(join(fixture.directory, "annotations.md"), "utf8");
    expect(annotationsMarkdown).toContain("**global comment** — Whole-document note");
    expect(annotationsMarkdown).toContain("[[source.pdf#page=1");

    const tree = await fetch(`${server.url}/api/reference/files?dirPath=${encodeURIComponent(fixture.directory)}`).then((response) => response.json());
    expect(JSON.stringify(tree.tree)).toContain("source.pdf");
    const doc = await fetch(`${server.url}/api/doc?path=${encodeURIComponent(fixture.pdfPath)}&base=${encodeURIComponent(fixture.directory)}&doc=1`).then((response) => response.json());
    expect(doc).toMatchObject({ renderAs: "pdf", filepath: fixture.pdfPath });
    const dynamicRange = await fetch(`${server.url}${doc.pdf.url}`, { headers: { Range: "bytes=0-3" } });
    expect(dynamicRange.status).toBe(206);
    expect(Buffer.from(await dynamicRange.arrayBuffer()).toString()).toBe("%PDF");

    const markdownDoc = await fetch(`${server.url}/api/doc?path=${encodeURIComponent(fixture.markdownPath)}&base=${encodeURIComponent(fixture.directory)}&doc=1`).then((response) => response.json());
    expect(markdownDoc.sourceSave).toMatchObject({ enabled: true, kind: "local-text-file", scope: "folder-file" });
    const sourceSave = await fetch(`${server.url}/api/source/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: markdownDoc.sourceSave.path,
        text: "# Revised notes\n",
        baseHash: markdownDoc.sourceSave.hash,
        baseEol: markdownDoc.sourceSave.eol,
      }),
    });
    expect(sourceSave.status).toBe(200);
    expect(readFileSync(fixture.markdownPath, "utf8")).toBe("# Revised notes\n");
  });
});

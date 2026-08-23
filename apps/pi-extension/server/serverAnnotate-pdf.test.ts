import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PdfAnnotation } from "../generated/pdf-annotations.ts";
import { startAnnotateServer, type AnnotateServerResult } from "./serverAnnotate.ts";

const directories: string[] = [];
const servers: AnnotateServerResult[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function annotation(): PdfAnnotation {
  return {
    id: "pi-one",
    color: "green",
    author: "Eik",
    note: "note",
    highlighted_text: "quote",
    content: { text: "quote" },
    position: {
      boundingRect: { x1: 1, y1: 2, x2: 3, y2: 4, width: 595, height: 842, pageNumber: 1 },
      rects: [{ x1: 1, y1: 2, x2: 3, y2: 4, width: 595, height: 842, pageNumber: 1 }],
      pageNumber: 1,
    },
    comment: { text: "note", color: "green", author: "Eik" },
  };
}

describe.skipIf(Boolean(process.env.PLANNOTATOR_PORT))("Pi PDF annotate server", () => {
  test("mirrors Bun PDF payload, range streaming, and sidecar saving", async () => {
    const directory = mkdtempSync(join(tmpdir(), "plannotator-pi-pdf-"));
    directories.push(directory);
    mkdirSync(join(directory, "metadata"));
    const bytes = Buffer.from("%PDF-1.4\nabcdefghij\n%%EOF\n");
    const pdfPath = join(directory, "source.pdf");
    writeFileSync(pdfPath, bytes);

    const server = await startAnnotateServer({
      markdown: "",
      filePath: pdfPath,
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
    expect(range.headers.get("content-range")).toBe(`bytes 5-9/${bytes.length}`);
    expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(5, 10));

    const before = sha256(readFileSync(pdfPath));
    const save = await fetch(`${server.url}/api/pdf/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annotations: [annotation()] }),
    });
    expect(save.status).toBe(200);
    expect(await save.json()).toMatchObject({ ok: true, count: 1 });
    expect(sha256(readFileSync(pdfPath))).toBe(before);

    const loaded = await fetch(`${server.url}/api/pdf/annotations`).then((response) => response.json());
    expect(loaded.annotations.map(({ id }: { id: string }) => id)).toEqual(["pi-one"]);

    const tree = await fetch(`${server.url}/api/reference/files?dirPath=${encodeURIComponent(directory)}`).then((response) => response.json());
    expect(JSON.stringify(tree.tree)).toContain("source.pdf");
    const doc = await fetch(`${server.url}/api/doc?path=${encodeURIComponent(pdfPath)}&base=${encodeURIComponent(directory)}&doc=1`).then((response) => response.json());
    expect(doc).toMatchObject({ renderAs: "pdf", filepath: pdfPath });
    const dynamicRange = await fetch(`${server.url}${doc.pdf.url}`, { headers: { Range: "bytes=0-3" } });
    expect(dynamicRange.status).toBe(206);
    expect(Buffer.from(await dynamicRange.arrayBuffer()).toString()).toBe("%PDF");
  });
});

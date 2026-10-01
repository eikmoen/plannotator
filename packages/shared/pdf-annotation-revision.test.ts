import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendPdfGlobalComment, describePdfSource, loadPdfAnnotationDocument, savePdfAnnotationDocument } from './pdf-annotation-store';
import { withPdfAnnotationLock } from './pdf-annotation-revision';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'pdf-revision-test-')); directories.push(directory);
  const pdf = join(directory, 'source.pdf'); writeFileSync(pdf, '%PDF-source-is-immutable');
  const source = describePdfSource(pdf);
  writeFileSync(join(directory, 'annotations.md'), '# Handwritten notes\nKeep these words.\n');
  savePdfAnnotationDocument(source, [], [{ id: 'old', text: 'Earlier note', author: 'Eik' }]);
  return source;
}
const comment = { id: 'audio-00000000-0000-4000-8000-000000000001', text: 'Audio passage', author: 'Eik', created_at: '2026-09-06T17:00:00Z' };

test('append preserves PDF and all existing highlight sidecar bytes; stale/legacy clients cannot erase it', () => {
  const source = fixture();
  const paths = ['source.pdf', 'metadata/annotations.json', 'metadata/annotations-hidden.json'];
  const before = paths.map(p => readFileSync(join(source.sourceDirectory, p)));
  const old = loadPdfAnnotationDocument(source);
  const saved = appendPdfGlobalComment(source, comment, old.revision!);
  expect(saved.globalComments.map(c => c.id)).toEqual(['old', comment.id]);
  paths.forEach((p, i) => expect(readFileSync(join(source.sourceDirectory, p))).toEqual(before[i]));
  expect(readFileSync(join(source.sourceDirectory, 'annotations.md'), 'utf8')).toContain('Keep these words.');
  expect(() => savePdfAnnotationDocument(source, old.annotations, old.globalComments, old.revision)).toThrow('changed');
  expect(() => savePdfAnnotationDocument(source, old.annotations, old.globalComments)).toThrow('revision-aware');
  expect(loadPdfAnnotationDocument(source).globalComments).toHaveLength(2);
  expect(savePdfAnnotationDocument(source, saved.annotations, saved.globalComments, saved.revision).globalComments).toHaveLength(2);
});

test('identical replay repairs interrupted Markdown publication without duplicating a comment', () => {
  const source = fixture();
  appendPdfGlobalComment(source, comment, loadPdfAnnotationDocument(source).revision!);
  writeFileSync(join(source.sourceDirectory, 'annotations.md'), '# Original handwritten notes only\n');
  const current = loadPdfAnnotationDocument(source);
  appendPdfGlobalComment(source, { created_at: comment.created_at, author: comment.author, text: comment.text, id: comment.id }, current.revision!);
  const md = readFileSync(join(source.sourceDirectory, 'annotations.md'), 'utf8');
  expect(md).toContain('Original handwritten notes');
  expect(md.match(/Audio passage/g)).toHaveLength(1);
  expect(() => appendPdfGlobalComment(source, { ...comment, text: 'Different' }, loadPdfAnnotationDocument(source).revision!)).toThrow('changed');
});

test('second writer fails closed while another process owns the source lock', () => {
  const source = fixture();
  withPdfAnnotationLock(source.sourceDirectory, () => {
    const script = `import { loadPdfAnnotationDocument } from ${JSON.stringify(join(import.meta.dir, 'pdf-annotation-store.ts'))};
      try { loadPdfAnnotationDocument(${JSON.stringify(source)}); process.exit(2); }
      catch(e) { if(e.name !== 'PdfAnnotationConflictError') throw e; }`;
    const result = Bun.spawnSync([process.execPath, '-e', script]);
    expect(result.exitCode).toBe(0);
  });
  expect(loadPdfAnnotationDocument(source).globalComments).toHaveLength(1);
});

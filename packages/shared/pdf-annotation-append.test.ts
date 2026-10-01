import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as store from './pdf-annotation-store';

test('source-bound append preserves other notes, detects stale revisions, and acknowledges identical retries', () => {
  const root=mkdtempSync(join(tmpdir(),'pdf-append-'));
  try {
    const pdf=join(root,'source.pdf');writeFileSync(pdf,'%PDF synthetic identity');
    const hash=createHash('sha256').update(readFileSync(pdf)).digest('hex');
    const source=store.describePdfSource(pdf);
    writeFileSync(join(root,'annotations.md'),'# Private handwritten notes\n\nKeep this paragraph.\n');
    const rect={x1:10,y1:10,x2:100,y2:30,width:600,height:800,pageNumber:1};
    const note={id:'pdf-123',position:{pageNumber:1,boundingRect:rect,rects:[rect]},content:{text:'Actual selected words'},comment:{text:'My note',color:'yellow' as const}};
    const first=store.loadPdfAnnotationDocument(source);
    const saved=store.appendPdfAnnotation(source,note,first.revision!,hash);
    expect(saved.annotations).toHaveLength(1);
    expect(readFileSync(join(root,'annotations.md'),'utf8')).toContain('Keep this paragraph.');
    expect(store.appendPdfAnnotation(source,note,first.revision!,hash).annotations).toHaveLength(1);
    expect(()=>store.appendPdfAnnotation(source,{...note,comment:{text:'Different'}},saved.revision!,hash)).toThrow();
    expect(()=>store.appendPdfAnnotation(source,{...note,id:'pdf-other'},first.revision!,hash)).toThrow();
    store.appendPdfGlobalComment(source,{id:'audio-123',text:'Existing passage comment'},saved.revision!);
    const latest=store.loadPdfAnnotationDocument(source);
    const second=store.appendPdfAnnotation(source,{...note,id:'pdf-other'},latest.revision!,hash);
    expect(second.annotations).toHaveLength(2);expect(second.globalComments[0].text).toBe('Existing passage comment');
    expect(()=>store.savePdfAnnotationDocument(source,[])).toThrow();
    writeFileSync(pdf,'%PDF changed');
    expect(()=>store.appendPdfAnnotation(source,note,second.revision!,hash)).toThrow();
    expect(store.loadPdfAnnotationDocument(source).annotations).toHaveLength(2);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

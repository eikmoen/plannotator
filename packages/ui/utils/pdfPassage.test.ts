import { test, expect } from 'bun:test';
import { findPdfPassage } from './pdfPassage';
const phrase='The actual source passage has enough distinctive words to be located without guessing its position.';
test('matches real source text across rendered spans, not speech normalization',()=>{
 const hit=findPdfPassage(['Header',phrase.slice(0,40),phrase.slice(40),'Footer'],phrase)!;
 expect(hit.kind).toBe('passage');expect(hit.start).toEqual({item:1,start:0,end:1});
 expect(hit.end.item).toBe(2);
 expect(findPdfPassage([phrase],phrase.replace('distinctive','invented'))).toBeNull();
});
test('ambiguous and short text never invent a PDF location',()=>{
 expect(findPdfPassage([phrase,phrase],phrase)).toBeNull();
 expect(findPdfPassage(['Figure 1'],'Figure 1')).toBeNull();
});
test('a unique lead-in is labelled start, never sentence alignment',()=>{
 const text=phrase+' Additional source wording continues on the next page after this selected passage.';
 const prefix=text.split(/\s+/).slice(0,16).join(' ');
 expect(findPdfPassage([prefix],text)?.kind).toBe('start');
});

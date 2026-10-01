import { test, expect } from 'bun:test';
import { findPdfPassage, isMarginPageNumber, pdfPassageParts, pdfTextForPassage } from './pdfPassage';
test('only standalone numeric margin candidates are excluded, never body numbers or heading text',()=>{
 expect(isMarginPageNumber('8',730,800)).toBe(true);
 expect(isMarginPageNumber('8',400,800)).toBe(false);
 expect(isMarginPageNumber('Section 8',730,800)).toBe(false);
});
test('empty EOL items still delimit number-only margin lines; inline/body numbers stay',()=>{
 const item=(str:string,baseline:number,hasEOL=false)=>({str,baseline,hasEOL});
 expect(pdfTextForPassage([item('8',730),item('',730,true),item('in ',730),item('2014',730,true),item('9',400,true)],800)).toEqual(['in ','2014','9']);
});
test('a complete match is split at physical page boundaries, preserving every source character',()=>{
 const text='A long opening sentence supplies enough unique source wording across a page boundary. The remaining words continue on the next page.';
 const split=86;
 const match=pdfPassageParts([text.slice(0,split),text.slice(split)],[9,10],text)!;
 expect(match.kind).toBe('passage');
 expect(match.parts).toEqual([{page:9,text:text.slice(0,split)},{page:10,text:text.slice(split)}]);
 const tail=match.parts[1].text;
 expect(findPdfPassage([tail],tail,1)?.kind).toBe('passage');
 expect(findPdfPassage([tail,tail],tail,1)).toBeNull();
});
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

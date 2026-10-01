// Conservative text identity only. No timestamps → guessed rectangles.
export function findPdfPassage(texts: readonly string[], source: string, minimum = 48) {
  const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[\s\u00ad]/g,'');
  const characters: {item:number;start:number;end:number}[]=[];
  let haystack='';
  texts.forEach((text,item)=>{
    for(let i=0;i<text.length;) {
      const char=String.fromCodePoint(text.codePointAt(i)!);const value=fold(char);
      haystack+=value;for(let j=0;j<value.length;j++)characters.push({item,start:i,end:i+char.length});
      i+=char.length;
    }
  });
  const complete=fold(source);
  const prefix=fold(source.trim().split(/\s+/).slice(0,16).join(' '));
  for(const [needle,kind] of [[complete,'passage'],[prefix,'start']] as const) {
    if(needle.length<minimum)continue;
    const start=haystack.indexOf(needle);
    if(start<0 || haystack.indexOf(needle,start+1)>=0)continue;
    return {start:characters[start],end:characters[start+needle.length-1],kind};
  }
  return null;
}

/** Only call for an entire numeric line, not individual numeric text runs. */
export function isMarginPageNumber(text: string, baseline: number, height: number) {
  return /^\d{1,4}$/.test(text.trim()) && Number.isFinite(baseline) && Number.isFinite(height) && height > 0
    && (baseline < height * .1 || baseline > height * .9);
}

/** PDF.js may attach hasEOL to an empty item after the visible number. */
export function pdfTextForPassage(items: readonly { str: string; hasEOL: boolean; baseline: number }[], height: number) {
  const texts: string[] = [];
  let line: typeof items[number][] = [];
  const flush = () => {
    const visible = line.find(item => item.str.trim());
    if (!visible || !isMarginPageNumber(line.map(item => item.str).join(''), visible.baseline, height)) {
      texts.push(...line.map(item => item.str));
    }
    line = [];
  };
  for (const item of items) { line.push(item); if (item.hasEOL) flush(); }
  flush();
  return texts;
}

/** Split an already unambiguous source match so unmounted pages and margin
 * decorations cannot shorten the visible cue or be shaded by a cross-page Range.
 */
export function pdfPassageParts(texts: readonly string[], pages: readonly number[], source: string) {
  const match = findPdfPassage(texts, source);
  if (!match) return null;
  const parts: { page: number; text: string }[] = [];
  for (let i = match.start.item; i <= match.end.item; i++) {
    const text = texts[i].slice(i === match.start.item ? match.start.start : 0,
      i === match.end.item ? match.end.end : texts[i].length);
    const last = parts[parts.length - 1];
    if (last?.page === pages[i]) last.text += text;
    else parts.push({ page: pages[i], text });
  }
  return { kind: match.kind, parts };
}

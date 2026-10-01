// Conservative text identity only. No timestamps → guessed rectangles.
export function findPdfPassage(texts: readonly string[], source: string) {
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
    if(needle.length<48)continue;
    const start=haystack.indexOf(needle);
    if(start<0 || haystack.indexOf(needle,start+1)>=0)continue;
    return {start:characters[start],end:characters[start+needle.length-1],kind};
  }
  return null;
}

// Page references locate figures without importing unrelated later prose.
export function figureReferences(text) {
  const found=new Set();
  for(const m of String(text).matchAll(/\b(?:(Extended\s+Data|Supplementary)\s+)?Fig(?:ure)?s?\.?\s*(S)?(\d{1,2})(?:\s*[–-]\s*S?(\d{1,2}))?/gi)) {
    const first=Number(m[3]),last=Number(m[4]||m[3]);
    if(last<first||last-first>20)continue;
    const kind=m[2]||/^Supplementary$/i.test(m[1]||'')?'supplement:':m[1]?'extended:':'figure:';
    for(let n=first;n<=last;n++)found.add(kind+n);
  }
  return found;
}
export function referencedFigures(pages,text,excludedPages=[]) {
  const refs=figureReferences(text),excluded=new Set(excludedPages),result=[];
  for(const page of pages) {
    if(excluded.has(page.page))continue;
    const known=new Set();if(Array.isArray(page.figures)){for(const figure of page.figures)if(refs.has(figure.label)){result.push({page:page.page,label:figure.label,caption:figure.caption});known.add(figure.label);}}
    for(const m of page.text.matchAll(/\b(Extended\s+Data\s+)?Fig\.?\s*(\d{1,2})\s*[|｜:]/gi)) {
      const label=(m[1]?'extended:':'figure:')+Number(m[2]);
      if(refs.has(label)&&!known.has(label))result.push({page:page.page,label,caption:page.text.slice(m.index).split(/\n\s*\n/)[0].split(/\n/)[0],imageOnly:true});
    }
    // Supplement captions often use "Fig. S3." rather than the Nature
    // "Fig. 3 |" typography. Supply only their heading line plus the page
    // image; prose elsewhere on that page must not become assigned body text.
    for(const m of page.text.matchAll(/^\s*(?:Supplementary\s+Fig(?:ure)?\.?\s*S?|Fig(?:ure)?\.?\s*S)(\d{1,2})\s*[.|｜:]\s*([^\n]*)/gim)) {
      const label='supplement:'+Number(m[1]);
      if(refs.has(label)&&!known.has(label))result.push({page:page.page,label,caption:m[0].trim(),imageOnly:true});
    }
  }
  return result;
}
export function uniquePages(inputs) {
  const seen=new Set();return inputs.filter(p=>{const key=p.sourceId+':'+p.page;if(seen.has(key))return false;seen.add(key);return true;});
}
export function pageRanges(values){const pages=[...new Set(values.filter(p=>Number.isInteger(p)&&p>0))].sort((a,b)=>a-b),ranges=[];for(let i=0;i<pages.length;){const first=pages[i];let last=first;while(pages[i+1]===last+1)last=pages[++i];ranges.push(first===last?String(first):first+'–'+last);i++;}return ranges.join('、');}
export function applyReviewPatches(draft,patches){
  if(!Array.isArray(patches)||!patches.length||patches.length>24)throw Error('修订需返回1–24处明确替换');
  const edits=patches.map(p=>{if(typeof p?.from!=='string'||p.from.length<12||p.from.length>12000||typeof p.to!=='string'||p.to.length>24000)throw Error('修订片段范围无效');const start=draft.indexOf(p.from);if(start<0||start!==draft.lastIndexOf(p.from))throw Error('修订原句不存在或不唯一');return {start,end:start+p.from.length,to:p.to};}).sort((a,b)=>a.start-b.start);
  if(edits.some((e,i)=>i&&e.start<edits[i-1].end))throw Error('修订片段不能重叠');
  let result=draft;for(const e of edits.reverse())result=result.slice(0,e.start)+e.to+result.slice(e.end);
  if(!result.trim()||result.length>200000)throw Error('修订报告为空或过长');return result;
}

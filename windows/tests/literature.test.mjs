import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ZoteroClient,localBase,zoteroKey} from '../../extensions/literature/zotero.mjs';
import {LiteratureWorkspace,validatePlan} from '../../extensions/literature/core.mjs';
test('Zotero only accepts loopback HTTP, valid keys and readonly routes',async()=>{
  for(const u of ['https://example.com','http://127.0.0.1:23119@evil.test','file:///C:/secret','http://localhost/path'])assert.throws(()=>localBase(u));
  assert.equal(localBase('http://127.0.0.1:23119'),'http://127.0.0.1:23119');assert.throws(()=>zoteroKey('../secret'));
  let calls=0;const c=new ZoteroClient(undefined,{fetcher:async(u,o)=>{calls++;assert.equal(o.redirect,'error');assert.equal(o.method,undefined);return new Response(JSON.stringify([]),{headers:{'Total-Results':'0'}});}});
  assert.equal((await c.search({query:'FeSe'})).total,0);await assert.rejects(c.get('/users/0/items/ABCDEFGH/delete'));assert.equal(calls,1);
});
test('Zotero collections preserve parent hierarchy and pagination',async()=>{
  let n=0;const c=new ZoteroClient(undefined,{fetcher:async u=>{const start=Number(new URL(u).searchParams.get('start'));n++;return new Response(JSON.stringify(start===0?Array.from({length:100},(_,i)=>({key:String(i),data:{name:'c'+i,parentCollection:i?'parent':false}})):[{key:'last',data:{name:'last'}}]));}});
  const result=await c.collections();assert.equal(result.length,101);assert.equal(result[1].parent,'parent');assert.equal(n,2);
});

test('standalone PDF papers remain searchable while child attachments and unrelated files are excluded',async()=>{
  const rows=[{key:'ABCDEFGH',data:{itemType:'journalArticle',title:'Parent'}},{key:'BCDEFGHI',data:{itemType:'attachment',title:'Standalone PDF',contentType:'application/pdf'}},{key:'CDEFGHIJ',data:{itemType:'attachment',title:'Child PDF',parentItem:'ABCDEFGH',contentType:'application/pdf'}},{key:'DEFGHIJK',data:{itemType:'attachment',title:'Snapshot',contentType:'text/html'}},{key:'EFGHIJKL',data:{itemType:'note',title:'Private note'}}],c=new ZoteroClient(undefined,{fetcher:async()=>new Response(JSON.stringify(rows),{headers:{'Total-Results':'5'}})});
  const result=await c.search();assert.deepEqual(result.items.map(i=>i.key),['ABCDEFGH','BCDEFGHI']);assert.equal(result.total,5);assert.equal(result.nextOffset,null);
});
test('reading plan rejects skipped, overlapping or reordered pages',()=>{
  assert.equal(validatePlan([{label:'begin',start:1,end:2},{label:'end',start:3,end:4}],4).length,2);
  for(const plan of [[{label:'skip',start:2,end:4}],[{label:'miss',start:1,end:3}],[{label:'a',start:1,end:3},{label:'b',start:3,end:4}]])assert.throws(()=>validatePlan(plan,4));
});
test('sources are admitted PDF capabilities; resume and next-part export preserve originals',async()=>{
  const root=path.resolve('.build/literature-tests');await fs.mkdir(root,{recursive:true});const home=await fs.mkdtemp(path.join(root,'papers-'));const original=path.join(home,'original.pdf');await fs.writeFile(original,'%PDF-1.4\nfixture');
  const config={zoteroUrl:'http://127.0.0.1:23119',paperRulesPath:''};
  const worker=async(_python,a)=>{if(a.action==='extract'){await fs.writeFile(path.join(a.out,'pages.json'),JSON.stringify({sha256:'sha',warnings:[],pages:[{page:1,text:'first'},{page:2,text:'second'}]}));return {pageCount:2};}await fs.writeFile(a.target,'PDF derived only');return {bytes:16};};
  const ws=new LiteratureWorkspace({home:path.join(home,'derived'),config,runWorker:worker});await ws.initialize();await assert.rejects(ws.prepare('../original.pdf'));
  const s=await ws.admit(original);await ws.prepare(s.sourceId);await assert.rejects(ws.pages(s.sourceId,0,1));
  const job=await ws.createJob([s.sourceId],[{label:'first',start:1,end:1},{label:'second',start:2,end:2}]);await assert.rejects(ws.export(job.id,1,'skip'));
  const r=await ws.export(job.id,0,'observed evidence');assert.equal(r.part,1);assert.equal(r.files.length,2);assert.equal(await fs.readFile(original,'utf8'),'%PDF-1.4\nfixture');
  const resumed=new LiteratureWorkspace({home:ws.home,config,runWorker:worker});await resumed.initialize();assert.equal(resumed.recent.next,1);assert.equal((await resumed.job(job.id)).next,1);await assert.rejects(resumed.export(job.id,0,'overwrite'));
  const rules=path.join(home,'rules.md');await fs.writeFile(rules,'changed');config.paperRulesPath=rules;await assert.rejects(resumed.export(job.id,1,'changed rules'),/规则已改变/);
});

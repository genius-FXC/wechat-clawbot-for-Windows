import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {LiteratureWorkspace,workerCall} from '../../extensions/literature/core.mjs';
import {figureReferences,referencedFigures,uniquePages,pageRanges,applyReviewPatches} from '../../extensions/literature/reading.mjs';

test('review patches preserve unaffected paragraphs and reject ambiguous or overlapping replacements',()=>{
  const first='原文的三点二阶导数拟合顶点才定义能隙。',last='引用论文公式时保留作者原来的等号符号。',draft=first+'\n\n不能改动的完整实验对照。\n\n'+last;
  const result=applyReviewPatches(draft,[{from:last,to:'保留作者原式的等号，另行解释近似条件。'},{from:first,to:'三点拟合二阶导数顶点，得到局域能隙。'}]);
  assert.ok(result.includes('不能改动的完整实验对照。'));assert.ok(result.indexOf('局域能隙')<result.indexOf('作者原式'));
  assert.throws(()=>applyReviewPatches(first+first,[{from:first,to:'修订'}]),/不唯一/);assert.throws(()=>applyReviewPatches(draft,[{from:first,to:'修订'},{from:first.slice(2),to:'重复改动'}]),/重叠/);assert.throws(()=>applyReviewPatches(draft,[{from:'不存在且足够长的原文修订片段',to:'新稿'}]),/不存在/);assert.throws(()=>applyReviewPatches(draft,[{from:'等号',to:'近似号'}]),/范围/);
});

test('unapproved review drafts persist across restart without becoming completed or downloadable reports',async()=>{
  const worker=async(_p,a)=>{if(a.action==='extract')return extracting(a);await fs.writeFile(a.target,'derived');return {bytes:7};};const {ws,job,file}=await fixture(worker);
  const diagnostic=await ws.saveReviewDraft(job.id,0,'尚未通过科学措辞检查的诊断稿',{passed:false,issues:['需保留原式等号']});assert.equal(ws.recent.next,0);assert.match(ws.recent.error,/进度未推进/);
  const restored=new LiteratureWorkspace({home:ws.home,config:{},runWorker:worker});await restored.initialize();const saved=await restored.job(job.id);assert.equal(saved.next,0);assert.equal(saved.reports.length,0);assert.equal(await fs.readFile(saved.review.file,'utf8'),'尚未通过科学措辞检查的诊断稿');
  await assert.rejects(restored.reportFile(job.id,path.basename(diagnostic.file)),/已生成/);await assert.rejects(restored.retryExport(job.id),/没有可恢复/);
  await restored.export(job.id,0,'经检查的正式报告');assert.equal((await restored.job(job.id)).next,1);assert.equal(await fs.readFile(file,'utf8'),'%PDF-1.4\nfixture');assert.equal(await fs.readFile(diagnostic.file,'utf8'),'尚未通过科学措辞检查的诊断稿');
});

test('cross-page figure references add captions without unrelated later paragraphs',()=>{
  const pages=[{page:3,text:'Fig. 2 | Measured LDOS\nAxes and units.\n\nLater discussion must not be read yet.'},{page:18,text:'Extended Data Fig. 1 | Control experiment\nnegative findings.'}];
  assert.deepEqual([...figureReferences('Figs. 1–2 and Extended Data Fig. 1e')],['figure:1','figure:2','extended:1']);
  const refs=referencedFigures(pages,'Fig. 2c and Extended Data Fig. 1e');assert.equal(refs.length,2);assert.ok(!refs[0].caption.includes('Later discussion'));
  assert.equal(referencedFigures(pages,'Fig. 2',[3]).length,0);assert.equal(uniquePages([{sourceId:'a',page:1},{sourceId:'a',page:1},{sourceId:'b',page:1}]).length,2);
  assert.equal(pageRanges([7,2,3,4,5,9,8,20,7]),'2–5、7–9、20');
});

test('explicit supplementary citations locate omitted figure pages without importing later prose',()=>{
  const pages=[{page:5,text:'Discussion cites Fig. S19 and Fig. S20 in running prose.'},{page:26,text:'Fig. S19. Absence of Q and 2Q in topography\nAxes and setup controls.\n\nUnrelated later discussion.'},{page:27,text:'Fig. S20. Conductance-ratio control\nAxes and units.'}];
  assert.deepEqual([...figureReferences('Fig. S3, Supplementary Figs. 19–20, Extended Data Fig. 1 and Fig. 3')],['supplement:3','supplement:19','supplement:20','extended:1','figure:3']);
  const refs=referencedFigures(pages,'See Figs. S19–S20.');assert.deepEqual(refs.map(f=>f.page),[26,27]);assert.equal(refs[0].caption,'Fig. S19. Absence of Q and 2Q in topography');assert.equal(refs[0].imageOnly,true);assert.ok(!refs[0].caption.includes('Unrelated'));
  assert.deepEqual(referencedFigures(pages,'Fig. S19 and Fig. S20',[26]).map(f=>f.page),[27]);assert.equal(referencedFigures(pages,'Fig. 19').length,0);
});

async function fixture(worker){const root=path.resolve('.build/literature-boundaries');await fs.mkdir(root,{recursive:true});const home=await fs.mkdtemp(path.join(root,'run-')),file=path.join(home,'微信收到的论文.pdf');await fs.writeFile(file,'%PDF-1.4\nfixture');const ws=new LiteratureWorkspace({home:path.join(home,'derived'),config:{},runWorker:worker});await ws.initialize();const s=await ws.admit(file);await ws.prepare(s.sourceId);const job=await ws.createJob([s.sourceId],[{label:'正文',start:1,end:1}]);return {ws,s,job,file};}
function extracting(a){return fs.writeFile(path.join(a.out,'pages.json'),JSON.stringify({pages:[{page:1,text:'body'}],warnings:[]})).then(()=>({pageCount:1}));}
test('failed PDF export retains Markdown and cannot advance or falsely mark a task complete',async()=>{
  const {ws,job,file}=await fixture(async(_p,a)=>{if(a.action==='extract')return extracting(a);throw Error('renderer failed');});
  await assert.rejects(ws.export(job.id,0,'未完成'),/Markdown 已保留/);assert.equal((await ws.job(job.id)).next,0);
  assert.ok((await fs.readdir(path.join(ws.home,'jobs',job.id))).some(p=>p.endsWith('.md')));assert.equal(await fs.readFile(file,'utf8'),'%PDF-1.4\nfixture');
});
test('concurrent exports serialize the task and a changed original rejects stale cached content',async()=>{
  let release;const gate=new Promise(r=>{release=r;});const {ws,job,s,file}=await fixture(async(_p,a)=>{if(a.action==='extract')return extracting(a);await gate;await fs.writeFile(a.target,'derived');return {bytes:7};});
  const first=ws.export(job.id,0,'报告');await assert.rejects(ws.export(job.id,0,'重复报告'),/正在导出/);release();await first;assert.equal((await ws.job(job.id)).reports.length,1);
  await fs.appendFile(file,'updated by another program');await assert.rejects(ws.pages(s.sourceId,1,1),/原 PDF 已被其他程序更新/);
});
test('worker cancellation already signaled launches no Python subprocess',async()=>{const c=new AbortController();c.abort(Error('fixture cancelled'));await assert.rejects(workerCall('does-not-exist',{action:'extract'},c.signal),/fixture cancelled/);});
test('failed export resumes the exact persisted draft after restart without making a model call',async()=>{
  let fail=true;const worker=async(_p,a)=>{if(a.action==='extract')return extracting(a);if(fail)throw Error('temporary PDF failure');await fs.writeFile(a.target,'derived');return {bytes:7};};const {ws,job}=await fixture(worker);
  await assert.rejects(ws.export(job.id,0,'唯一的模型草稿'));assert.equal(ws.recent.failedExport,true);const pending=(await ws.job(job.id)).pendingExport;assert.equal(await fs.readFile(pending.bodyFile,'utf8'),'唯一的模型草稿');
  const restored=new LiteratureWorkspace({home:ws.home,config:{},runWorker:worker});await restored.initialize();fail=false;const r=await restored.retryExport(job.id);assert.equal(r.part,1);const completed=await restored.job(job.id);assert.equal(completed.pendingExport,undefined);assert.equal(completed.reports.length,1);assert.equal((await fs.readFile(r.files[0].path,'utf8')).split('唯一的模型草稿').length-1,1);
  const report=await restored.reportFile(job.id,path.basename(r.files[0].path));assert.match(report.type,/markdown/);assert.ok(report.bytes>0);await assert.rejects(restored.reportFile(job.id,'job.json'),/已生成/);await assert.rejects(restored.reportFile(job.id,'..\\sources.json'),/无效/);
});
test('settings grouping preserves each original field exactly once and switches searchable groups',async()=>{
  const source=await fs.readFile(new URL('../.build/work/lib/client.js',import.meta.url),'utf8');let plugin,states=[],cursor=0;
  const react={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const index=cursor++;if(!(index in states))states[index]=v;return [states[index],x=>states[index]=x];},useEffect(){}};
  vm.runInNewContext(source.replace('    exports.apply = apply;','    exports.__groups=SettingsGroups; exports.apply=apply;'),{window:{__ModuleLoader__:{load:({factory})=>{plugin=factory(id=>id==='react'?react:{createSnapshotStore:()=>({set(){}})});}}}});
  const fields=Array.from({length:21},(_,i)=>({type:'fixture',props:{index:i},children:[]}));
  const render=()=>{cursor=0;return plugin.__groups({fields});};const walk=(n,out=[])=>{if(Array.isArray(n))n.forEach(c=>walk(c,out));else if(n&&typeof n==='object'&&!n.props?.hidden){out.push(n);walk(n.children,out);}return out;};
  let tree=render();const tabs=walk(tree).filter(n=>n.props.role==='tab');assert.equal(tabs.length,5);const seen=[];
  const all=(n,out=[])=>{if(Array.isArray(n))n.forEach(c=>all(c,out));else if(n&&typeof n==='object'){out.push(n);all(n.children,out);}return out;};assert.equal(all(tree).filter(n=>n.type==='fixture').length,21);assert.equal(all(tree).filter(n=>n.props.role==='tabpanel'&&n.props.hidden).length,4);
  for(const tab of tabs){tab.props.onClick();tree=render();seen.push(...walk(tree).filter(n=>n.type==='fixture').map(n=>n.props.index));}
  assert.deepEqual(seen.sort((a,b)=>a-b),Array.from({length:21},(_,i)=>i));
  walk(tree).find(n=>n.type==='input').props.onInput({target:{value:'emoji'}});tree=render();assert.ok(walk(tree).some(n=>n.type==='fixture'&&n.props.index===10));
  assert.match(source,/h\(SettingsGroups,\{fields\}\)/);
});

test('web reading cancel aborts its actual request and retains an honest resumable message',async()=>{
  const source=await fs.readFile(new URL('../.build/work/lib/client.js',import.meta.url),'utf8');let plugin,states=[],cursor=0,signal;
  const react={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return [states[i],x=>states[i]=x];},useEffect(){}};
  const fetch=async(_url,options={})=>{if(options.method!=='POST')return new Response(JSON.stringify({ok:true,zotero:{ok:true},reports:[{jobId:'fixture-job',part:1,title:'Persisted report',files:[{path:'C:/owned/part1.pdf'}]}]}));signal=options.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));};
  vm.runInNewContext(source.replace('    exports.apply = apply;','    exports.__literature=LiteratureFields; exports.apply=apply;'),{fetch,AbortController,window:{__ModuleLoader__:{load:({factory})=>{plugin=factory(id=>id==='react'?react:{createSnapshotStore:()=>({set(){}})});}}}});
  const props={value:{papersEnabled:true},user:{},disabled:false,set:async()=>{},clear:async()=>{}},render=()=>{cursor=0;return plugin.__literature(props);};const walk=(n,out=[])=>{if(Array.isArray(n))n.forEach(c=>walk(c,out));else if(n&&typeof n==='object'){out.push(n);walk(n.children,out);}return out;};
  render();states[3]={items:[{key:'ABCDEFGH',title:'fixture'}]};walk(render()).find(n=>n.type==='button'&&n.children.includes('按规则开始研读')).props.onClick();assert.equal(signal.aborted,false);
  walk(render()).find(n=>n.type==='button'&&n.children.includes('取消本次研读')).props.onClick();await new Promise(r=>setTimeout(r,10));assert.equal(signal.aborted,true);assert.equal(states[4],false);assert.match(states[1],/已取消/);
  const link=walk(render()).find(n=>n.type==='a'&&n.props.download==='part1.pdf');assert.ok(link);assert.match(link.props.href,/jobId=fixture-job&name=part1.pdf/);assert.equal(states[5],null);
});

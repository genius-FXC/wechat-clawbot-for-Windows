import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createCipheriv} from 'node:crypto';
import {InboundRouter} from '../.build/work/lib/inbound.js';
import {LiteratureWorkspace} from '../../extensions/literature/core.mjs';
import {registerLiterature,registerPaperAttachment} from '../.build/work/lib/clawbot-literature.js';
import {normalizeConfig} from '../.build/work/lib/config.js';
test('paper tools and incoming-PDF hooks stay on the owner main session; host auth is enforced before requests',async()=>{
  const root=path.resolve('.build/literature-runtime');await fs.mkdir(root,{recursive:true});const home=await fs.mkdtemp(path.join(root,'run-')),file=path.join(home,'received-paper.pdf');await fs.writeFile(file,'%PDF-1.4\nreadonly fixture');
  const sections=[],listeners=new Map(),disposers=[],routes=[];let sender='fixture-owner',denial=401;
  const makeAgent=id=>({session:{id},ctx:{tools:{definitions:[],register(d){this.definitions.push(d);return()=>{};}}}}),bot=makeAgent('fixture-main'),other=makeAgent('ordinary'),child=makeAgent('child');
  const effect=f=>{const cleanup=f();if(typeof cleanup==='function')disposers.push(cleanup);};const ctx={provide(){return()=>{};},agents:{list:()=>[bot,other,child]},systemPrompt:{section:s=>sections.push(s)},on:(name,f)=>listeners.set(name,f),effect,inject:(names,f)=>{if(names.includes('webServer'))f({effect,connection:{requestRejection:()=>denial},webServer:{register(r){routes.push(r);return()=>{};}}});}};
  const config=normalizeConfig({sessionId:'fixture-main',papersEnabled:true,paperWorkspace:path.join(home,'derived')});registerLiterature(ctx,config,{getOwner:()=> 'fixture-owner',getBridge:()=>({get activeSender(){return sender;}})});
  try{assert.equal(other.ctx.tools.definitions.length,0);assert.equal(child.ctx.tools.definitions.length,0);assert.equal(bot.ctx.tools.definitions.length,11);assert.equal(sections[0].text({agent:other}),'');assert.match(sections[0].text({agent:bot}),/微信文献/);
    const status=bot.ctx.tools.definitions.find(d=>d.name==='paper_status'),env={agent:bot,signal:new AbortController().signal};assert.equal(JSON.parse((await status.execute({},env)).text).status,'none');
    for(const agent of [other,child])await assert.rejects(status.execute({}, {...env,agent}),/微信主会话/);sender='another-allowed-contact';await assert.rejects(status.execute({},env),/绑定的微信本人/);assert.equal(sections[0].text({agent:bot}),'');assert.equal(await registerPaperAttachment('fixture-main',file),'');assert.equal(await registerPaperAttachment('fixture-main',file,'another-allowed-contact'),'');
    const note=await registerPaperAttachment('fixture-main',file,'fixture-owner');assert.match(note,/sourceId=[a-f0-9-]{36}/);sender='fixture-owner';assert.equal(await registerPaperAttachment('ordinary',file,'fixture-owner'),'');assert.equal(await fs.readFile(file,'utf8'),'%PDF-1.4\nreadonly fixture');
    const route=routes.find(r=>r.path==='/plugins/clawbot/papers'),download=routes.find(r=>r.path.endsWith('/report'));
    const result={headers:null,body:null,writeHead(code){this.code=code;},end(body){this.body=body?JSON.parse(body):null;}};await route.handler({method:'GET',url:'/plugins/clawbot/papers',headers:{}},result);assert.equal(result.code,401);await download.handler({method:'GET',url:'/plugins/clawbot/papers/report',headers:{}},result);assert.equal(result.code,401);
    denial=undefined;await route.handler({method:'POST',url:'/plugins/clawbot/papers',headers:{}},result);assert.equal(result.code,403);await download.handler({method:'GET',url:'/plugins/clawbot/papers/report?jobId=bad&name=job.json',headers:{}},result);assert.equal(result.code,404);
    const id=randomUUID(),dir=path.join(config.paperWorkspace,'jobs',id);await fs.mkdir(dir,{recursive:true});const md=path.join(dir,'part-1-fixture.md'),pdf=path.join(dir,'part-1-fixture.pdf');await fs.writeFile(md,'generated fixture');await fs.writeFile(pdf,'%PDF-fixture');await fs.writeFile(path.join(dir,'job.json'),JSON.stringify({reports:[{markdown:md,pdf}]}));
    const delivered={writeHead(code,headers){this.code=code;this.headers=headers;},end(body){this.body=body;}};await download.handler({method:'GET',url:'/plugins/clawbot/papers/report?jobId='+id+'&name=part-1-fixture.md',headers:{}},delivered);assert.equal(delivered.code,200);assert.equal(delivered.body.toString(),'generated fixture');assert.equal(delivered.headers['x-content-type-options'],'nosniff');
    config.papersEnabled=false;await assert.rejects(status.execute({},env),/微信主会话/);
  }finally{for(const f of disposers.reverse())await f();}
});

test('actual encrypted incoming and quoted PDF paths register the wire sender, independently of a stale active turn',async()=>{
  const base=path.resolve('.build/paper-incoming');await fs.mkdir(base,{recursive:true});const home=await fs.mkdtemp(path.join(base,'run-')),stateBefore=process.env.CLAWBOT_STATE_DIR,fetchBefore=globalThis.fetch,timeBefore=Date.now;process.env.CLAWBOT_STATE_DIR=home;
  const disposers=[],effect=f=>{const cleanup=f();if(typeof cleanup==='function')disposers.push(cleanup);},ctx={provide(){},agents:{list:()=>[]},systemPrompt:{section(){}},on(){},effect,inject(){}};
  const config=normalizeConfig({sessionId:'incoming-fixture',papersEnabled:true,paperWorkspace:path.join(home,'derived'),allowFrom:['owner','other-contact']}),messages=[],bridge={noteIncoming(){},activeSender:'other-contact',lookupQuoteByTime(){},async enqueueMessage(sender,text){messages.push({sender,text});}};
  registerLiterature(ctx,config,{getOwner:()=> 'owner',getBridge:()=>bridge});const key=Buffer.alloc(16,93),plains=['primary','quoted','other'].map(label=>Buffer.from('%PDF-1.4\nreadonly '+label+' fixture')),encrypted=plains.map(plain=>{const cipher=createCipheriv('aes-128-ecb',key,null);return Buffer.concat([cipher.update(plain),cipher.final()]);});let downloads=0;
  globalThis.fetch=async url=>{assert.equal(new URL(url).hostname,'fixture.invalid');return new Response(encrypted[downloads++]);};
  const file=name=>({type:4,file_item:{file_name:name,media:{encrypt_query_param:'fixture',aes_key:key.toString('base64'),full_url:'https://fixture.invalid/download'}}});
  const router=new InboundRouter({config,account:{accountId:'fixture',userId:'owner',cdnBaseUrl:'https://fixture.invalid'},bridge,pending:{popFor(){}},sendText:async()=>{throw Error('no real send');}});
  try{
    Date.now=()=>1234567890;
    await router.handle({from_user_id:'owner',item_list:[file('paper.pdf')]});assert.match(messages[0].text,/已登记论文 PDF，sourceId=/);
    await router.handle({from_user_id:'owner',item_list:[{type:1,text_item:{text:'按我的规则读引用的论文'},ref_msg:{message_item:file('paper.pdf')}}]});assert.match(messages[1].text,/已登记论文 PDF，sourceId=/);
    bridge.activeSender='owner';await router.handle({from_user_id:'other-contact',item_list:[file('other.pdf')]});assert.ok(!messages[2].text.includes('sourceId='));
    const sources=JSON.parse(await fs.readFile(path.join(config.paperWorkspace,'sources.json'),'utf8'));assert.equal(sources.length,2);assert.equal(new Set(sources.map(s=>s.file)).size,2);for(let i=0;i<sources.length;i++){assert.equal(sources[i].title,'paper.pdf');assert.deepEqual(await fs.readFile(sources[i].file),plains[i]);}
  }finally{Date.now=timeBefore;for(const f of disposers.reverse())await f();globalThis.fetch=fetchBefore;if(stateBefore===undefined)delete process.env.CLAWBOT_STATE_DIR;else process.env.CLAWBOT_STATE_DIR=stateBefore;}
});

test('a misconfigured paper workspace reports a local error without an unhandled rejection or blocking incoming files',async()=>{
  const base=path.resolve('.build/paper-bad-config');await fs.mkdir(base,{recursive:true});const home=await fs.mkdtemp(path.join(base,'run-')),notDirectory=path.join(home,'ordinary.txt');await fs.writeFile(notDirectory,'preserve this original fixture');
  const disposers=[],routes=[],effect=f=>{const cleanup=f();if(typeof cleanup==='function')disposers.push(cleanup);},ctx={provide(){},agents:{list:()=>[]},systemPrompt:{section(){}},on(){},effect,inject:(names,f)=>{if(names.includes('webServer'))f({effect,connection:{requestRejection(){}},webServer:{register(r){routes.push(r);return()=>{};}}});}};
  registerLiterature(ctx,normalizeConfig({sessionId:'bad-config-fixture',papersEnabled:true,paperWorkspace:notDirectory}),{getOwner:()=> 'owner',getBridge:()=>null});
  try{await new Promise(r=>setTimeout(r,30));assert.equal(await registerPaperAttachment('bad-config-fixture','unused.pdf','owner'),'');const response={writeHead(code){this.code=code;},end(body){this.body=JSON.parse(body);}};await routes.find(r=>r.path==='/plugins/clawbot/papers').handler({method:'GET',url:'/plugins/clawbot/papers'},response);assert.equal(response.code,503);assert.equal(response.body.ok,false);assert.equal(await fs.readFile(notDirectory,'utf8'),'preserve this original fixture');}finally{for(const f of disposers.reverse())await f();}
});

test('saved report download entries reload from disk in a fresh authenticated paper UI scope',async()=>{
  const base=path.resolve('.build/paper-report-history');await fs.mkdir(base,{recursive:true});const home=await fs.mkdtemp(path.join(base,'run-')),original=path.join(home,'original.pdf');await fs.writeFile(original,'%PDF-fixture');const config=normalizeConfig({sessionId:'history-fixture',papersEnabled:true,paperWorkspace:path.join(home,'derived')});
  const ws=new LiteratureWorkspace({home:config.paperWorkspace,config,runWorker:async(_p,a)=>{if(a.action==='extract'){await fs.writeFile(path.join(a.out,'pages.json'),JSON.stringify({extractorVersion:2,pages:[{page:1,text:'fixture'}],warnings:[]}));return {pageCount:1};}await fs.writeFile(a.target,'derived PDF fixture');return {bytes:19};}});await ws.initialize();const source=await ws.admit(original,{title:'Saved fixture paper'});await ws.prepare(source.sourceId);const job=await ws.createJob([source.sourceId],[{label:'body',start:1,end:1}]);const completed=await ws.export(job.id,0,'saved report');
  const disposers=[],routes=[],effect=f=>{const cleanup=f();if(typeof cleanup==='function')disposers.push(cleanup);},ctx={provide(){},agents:{list:()=>[]},systemPrompt:{section(){}},on(){},effect,inject:(names,f)=>{if(names.includes('webServer'))f({effect,connection:{requestRejection(){}},webServer:{register(r){routes.push(r);return()=>{};}}});}},before=globalThis.fetch;globalThis.fetch=async()=>new Response('[]',{headers:{'Total-Results':'1'}});
  try{registerLiterature(ctx,config,{getOwner:()=> 'owner',getBridge:()=>null});const response={writeHead(code){this.code=code;},end(body){this.body=JSON.parse(body);}};await routes.find(r=>r.path==='/plugins/clawbot/papers').handler({method:'GET',url:'/plugins/clawbot/papers'},response);assert.equal(response.code,200);assert.equal(response.body.reports.length,1);const saved=response.body.reports[0];assert.equal(saved.jobId,job.id);assert.equal(saved.part,1);assert.equal(saved.title,'Saved fixture paper');assert.deepEqual(saved.files.map(f=>f.path),completed.files.map(f=>f.path));}finally{for(const f of disposers.reverse())await f();globalThis.fetch=before;}
});

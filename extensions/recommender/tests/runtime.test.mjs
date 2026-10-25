import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';

test('independent recommendation tools require the bound WeChat owner, stay off other sessions, and authenticate feedback',async()=>{
  // Resolve host peer packages from the existing Windows build fixture. The engine
  // remains the separately built package, including its own Undici dependency.
  const base=fileURLToPath(new URL('../../../windows/.build/recommender-runtime/',import.meta.url));await fs.mkdir(base,{recursive:true});
  const home=await fs.mkdtemp(path.join(base,'run-')),entry=path.join(home,'index.mjs');
  const engine=pathToFileURL(fileURLToPath(new URL('../lib/engine.mjs',import.meta.url))).href;
  const source=await fs.readFile(new URL('../lib/index.mjs',import.meta.url),'utf8');await fs.writeFile(entry,source.replace("from './engine.mjs'",`from '${engine}'`));
  const {apply}=await import(pathToFileURL(entry));const disposers=[],routes=[],listeners=new Map();let owner=true,service=true,denial=401;
  const agent=id=>({session:{id},ctx:{tools:{definitions:[],register(d){this.definitions.push(d);return()=>{};}}}}),bot=agent('fixture-main'),other=agent('other'),child=agent('child');
  const effect=f=>{const cleanup=f();if(typeof cleanup==='function')disposers.push(cleanup);};
  const ctx={agents:{list:()=>[bot,other,child]},systemPrompt:{section(){}},effect,on:(name,f)=>listeners.set(name,f),get:()=>service?{assertOwner(id){assert.equal(id,'fixture-main');if(!owner)throw Error('owner required');}}:undefined,
    inject:(names,f)=>{if(names.includes('webServer'))f({effect,connection:{requestRejection:()=>denial},webServer:{register(r){routes.push(r);return()=>{};}}});else if(names.includes('settings'))f({effect,settings:{configure:()=>()=>{}}});}};
  const fetchBefore=globalThis.fetch;globalThis.fetch=async url=>{assert.equal(new URL(url).hostname,'127.0.0.1');return new Response('[]',{headers:{'content-type':'application/json'}});};
  const config={enabled:true,sessionId:'fixture-main',zoteroUrl:'http://127.0.0.1:23119',home,proxyUrl:'http://127.0.0.1:1'};
  try{apply(ctx,config);assert.equal(bot.ctx.tools.definitions.length,3);assert.equal(other.ctx.tools.definitions.length,0);assert.equal(child.ctx.tools.definitions.length,0);
    const tool=bot.ctx.tools.definitions.find(d=>d.name==='papers_interest_profile'),env={agent:bot,signal:new AbortController().signal};
    for(const a of [other,child])await assert.rejects(tool.execute({}, {...env,agent:a}),/微信主会话/);service=false;await assert.rejects(tool.execute({},env),/身份服务/);service=true;owner=false;await assert.rejects(tool.execute({},env),/owner required/);owner=true;
    assert.equal(JSON.parse((await tool.execute({},env)).text).items,0);
    const response={writeHead(code){this.code=code;},end(body){this.body=JSON.parse(body);}};
    const request=()=>Object.assign(Readable.from([JSON.stringify({id:'2501.12345',feedback:'interested'})]),{method:'POST',url:'/plugins/paper-recommender/status',headers:{'x-paper-recommender-action':'feedback'}});
    await routes[0].handler(request(),response);assert.equal(response.code,401);assert.equal(await fs.access(path.join(home,'feedback.json')).then(()=>true,()=>false),false);
    denial=undefined;const missing=request();missing.headers={};await routes[0].handler(missing,response);assert.equal(response.code,403);
    await routes[0].handler(request(),response);assert.equal(response.code,200);assert.equal(response.body.feedback,'interested');assert.equal(JSON.parse(await fs.readFile(path.join(home,'feedback.json'),'utf8'))['2501.12345'].value,'interested');
    config.enabled=false;await routes[0].handler(request(),response);assert.equal(response.code,409);await assert.rejects(tool.execute({},env),/微信主会话/);
  }finally{for(const cleanup of disposers.reverse())await cleanup();globalThis.fetch=fetchBefore;}
});

test('invalid proxy configuration stays a recoverable plugin error rather than an unhandled host failure',async()=>{
  const base=fileURLToPath(new URL('../../../windows/.build/recommender-runtime/',import.meta.url));await fs.mkdir(base,{recursive:true});const home=await fs.mkdtemp(path.join(base,'bad-')),entry=path.join(home,'index.mjs'),engine=pathToFileURL(fileURLToPath(new URL('../lib/engine.mjs',import.meta.url))).href;
  await fs.writeFile(entry,(await fs.readFile(new URL('../lib/index.mjs',import.meta.url),'utf8')).replace("from './engine.mjs'",`from '${engine}'`));const {apply}=await import(pathToFileURL(entry));const disposers=[],routes=[],effect=f=>{const cleanup=f();if(typeof cleanup==='function')disposers.push(cleanup);},ctx={agents:{list:()=>[]},systemPrompt:{section(){}},effect,on(){},inject:(names,f)=>{if(names.includes('webServer'))f({effect,connection:{requestRejection(){}},webServer:{register(r){routes.push(r);return()=>{};}}});}};
  apply(ctx,{enabled:true,sessionId:'fixture',zoteroUrl:'http://127.0.0.1:23119',home,proxyUrl:'http://not-local.example.invalid'});
  try{await new Promise(r=>setTimeout(r,30));const response={writeHead(code){this.code=code;},end(body){this.body=JSON.parse(body);}};await routes[0].handler({method:'GET',url:'/plugins/paper-recommender/status'},response);assert.equal(response.code,503);assert.match(response.body.error,/本机/);}finally{for(const f of disposers.reverse())await f();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {registerProactive} from '../.build/work/lib/clawbot-proactive.js';
import {WechatBridge} from '../.build/work/lib/bridge.js';
import {normalizeConfig,Config,HOT_FIELDS} from '../.build/work/lib/config.js';
import {PROACTIVE_FIELDS} from '../.build/work/lib/clawbot-proactive-policy.js';

test('all fourteen options are live settings; the original browser card saves them in place',async()=>{
  for(const key of PROACTIVE_FIELDS){assert.ok(HOT_FIELDS.has(key));assert.equal(Config.dict[key].meta.volatile,true);}
  const code=await fs.readFile(new URL('../.build/work/lib/client.js',import.meta.url),'utf8');
  let plugin;const effects=[],calls=[];
  const modules={react:{createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>[v,()=>{}],useEffect:f=>effects.push(f)},
    '@deepseek-ai/dsh-client-store':{createSnapshotStore:()=>({set(){}})}};
  vm.runInNewContext(code.replace('    exports.apply = apply;','    exports.__fields=ProactiveFields; exports.apply = apply;'),{
    fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({ok:true,rules:'fixture rules',opportunity:'fixture prompt'})};},
    window:{__ModuleLoader__:{load:({factory})=>{plugin=factory(id=>modules[id]);}}},
  });
  const saved=[],tree=plugin.__fields({value:normalizeConfig({}),user:{},disabled:false,set:async(...args)=>saved.push(args),clear:async()=>{}});
  const nodes=[];function walk(n){if(!n||typeof n!=='object')return;nodes.push(n);for(const c of n.children||[])Array.isArray(c)?c.forEach(walk):walk(c);}walk(tree);
  assert.equal(tree.props['aria-label'],'主动互动与真实分享');
  assert.match(code,/h\(ProactiveFields, \{ key: "proactive"/);
  const enable=nodes.find(n=>n.props.label==='开启主动互动'&&n.props.onChange);
  enable.props.onChange(true);await Promise.resolve();assert.deepEqual(saved[0],['proactiveEnabled',true]);
  const topics=nodes.find(n=>n.props.field==='proactiveTopics');assert.match(topics.props.placeholder,/关心的主题/);
  await nodes.find(n=>n.children?.includes('查看分享规则（不发送）')).props.onClick();await Promise.resolve();
  assert.equal(calls.length,1);assert.equal(calls[0].opts.headers['x-clawbot-proactive-action'],'preview');
});

test('proactive bridge refuses busy turns, uses its own producer source and never steers',async()=>{
  const sent=[],b=Object.create(WechatBridge.prototype),live={status:'running',steer(){throw Error('must not steer');}};
  Object.assign(b,{disposed:false,worker:null,queue:[],deps:{pending:new Map()},config:{proactiveEnabled:true},ctx:{agents:{get:()=>live}},sessionId:'wechat-main'});
  b.runWorker=()=>{sent.push(b.queue.shift());b.worker=Promise.resolve();};
  assert.equal(await b.enqueueProactive('fixture-owner','[主动分享机会] fixture'),false);assert.equal(sent.length,0);
  live.status='idle';assert.equal(await b.enqueueProactive('fixture-owner','[主动分享机会] fixture'),true);
  assert.equal(sent[0].message.source.kind,'plugin:clawbot-proactive');assert.equal(sent[0].proactive,true);
  assert.doesNotMatch(sent[0].message.content[0].text,/微信消息/);
});

test('runtime is scoped, previews never dispatch and skip keeps the guard until the background turn ends',async t=>{
  const effects=[];
  const root=await fs.mkdtemp(path.join(fileURLToPath(new URL('../.build/',import.meta.url)),'proactive-test-'));
  const oldHome=process.env.DSH_HOME;process.env.DSH_HOME=root;
  t.after(async()=>{for(const cleanup of effects.reverse())await cleanup?.();if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome;await fs.rm(root,{recursive:true,force:true});});
  const noon=Date.parse('2026-10-08T12:00:00+08:00');t.mock.method(Date,'now',()=>noon);
  let timer; t.mock.method(globalThis,'setTimeout',callback=>{timer=callback;return {unref(){}};});t.mock.method(globalThis,'clearTimeout',()=>{});
  const tools=[],guards=[],events=new Map(),sections=[],routes=[];
  const main={session:{id:'wechat-main',snapshotEvents:()=>[{type:'user/message',time:noon-3600000,data:{source:{kind:'plugin:wechat-clawbot'}}}]},ctx:{tools:{register:d=>{tools.push(d);return()=>{};},guard:f=>{guards.push(f);return()=>{};}}}};
  const childAgent={session:{id:'child',header:{parent:'wechat-main'}}};
  const ctx={agents:{list:()=>[main,childAgent],get:()=>main},logger:{warn(){}},effect(f){effects.push(f());},on:(name,f)=>{events.set(name,f);return()=>{};},systemPrompt:{section:s=>sections.push(s)},
    inject(names,fn){assert.deepEqual(names,['webServer','connection']);fn({effect:f=>effects.push(f()),webServer:{register:r=>{routes.push(r);return()=>{};}},connection:{requestRejection:req=>req.headers.cookie!=='valid-fixture'?401:req.headers.origin==='https://foreign.example'?403:undefined}});}};
  let dispatched=0,finish;const complete=new Promise(resolve=>{finish=resolve;});
  const execution={agent:main,signal:new AbortController().signal};
  const bridge={contextTokenFor:()=> 'fixture-context',canStartProactive:()=>true,activeSender:undefined,
    enqueueProactive:async()=>{dispatched++;
      assert.equal(guards[0]({...execution,name:'web_search'}),undefined);
      assert.match(guards[0]({...execution,name:'send_wechat_text'}),/clawbot_share/);
      await tools.find(d=>d.name==='clawbot_skip_share').execute({reason:'fixture quiet skip'},execution);
      assert.match(guards[0]({...execution,name:'send_wechat_text'}),/clawbot_share/);
      finish();return true;
    }};
  const config=normalizeConfig({sessionId:'wechat-main',proactiveEnabled:true});
  registerProactive(ctx,config,{getBridge:()=>bridge,getAccount:()=>({configured:true,userId:'fixture-owner'})});
  const call=async(method,headers={})=>{let status,body;await routes[0].handler({method,headers},{writeHead:s=>{status=s;},end:b=>{body=JSON.parse(b);}});return {status,body};};
  assert.equal((await call('GET')).status,401);assert.equal((await call('POST')).status,401);
  const before=await call('GET',{cookie:'valid-fixture'});assert.equal(before.status,200);assert.equal(before.body.history.length,0);
  assert.notEqual(before.body.reason,'主动互动初始化失败');assert.equal(before.body.enabled,true);
  assert.equal(tools.length,3);assert.equal(guards.length,1);assert.equal(sections[0].text({agent:childAgent}),'');
  assert.match(sections[0].text({agent:main}),/第一人称/);
  const args={clawbot_skip_share:{reason:'fixture'},clawbot_share:{title:'fixture',text:'fixture comment'},clawbot_prepare_share_image:{pageUrl:'https://example.com'}};
  for(const d of tools)await assert.rejects(d.execute(args[d.name], {...execution,agent:childAgent}),/requires the current WeChat/);
  assert.equal((await call('POST',{cookie:'valid-fixture'})).status,403);
  assert.equal((await call('POST',{cookie:'valid-fixture',origin:'https://foreign.example','x-clawbot-proactive-action':'preview'})).status,403);
  const preview=await call('POST',{cookie:'valid-fixture','x-clawbot-proactive-action':'preview'});
  assert.equal(preview.status,200);assert.match(preview.body.rules,/第一人称/);assert.equal(dispatched,0);
  assert.equal((await call('GET',{cookie:'valid-fixture'})).body.nextAt,before.body.nextAt);
  timer();await complete;await new Promise(setImmediate);
  const after=await call('GET',{cookie:'valid-fixture'});assert.equal(dispatched,1);assert.equal(after.body.history[0].status,'skipped');
  assert.equal(guards[0]({...execution,name:'send_wechat_text'}),undefined);
  config.proactiveEnabled=false;events.get('loader/volatile-update')();await new Promise(setImmediate);
  assert.equal(sections[0].text({agent:main}),'');
});

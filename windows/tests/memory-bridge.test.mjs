import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeepSeekHarnessBridge} from '../.build/work/lib/memos/adapters/deepseek-harness/bridge.js';
import {registerDeepSeekHarnessTools} from '../.build/work/lib/memos/adapters/deepseek-harness/tools.js';
import {normalizeConfig,HOT_FIELDS,Config} from '../.build/work/lib/config.js';
const allowed=session=>session?.id==='wechat-main';
const message=(text,kind='plugin:wechat-clawbot')=>({id:'message-'+text,role:'user',source:{kind},content:[{type:'text',text}]});
function fixture(overrides={}){
  const calls=[];
  const core={
    init:async()=>{},shutdown:async()=>{},closeSession:async()=>{},
    searchMemory:async input=>{calls.push(['recall',input]);return {query:{sessionId:'wechat-main',episodeId:'episode'},hits:[],injectedContext:'synthetic remembered preference',tierLatencyMs:{}};},
    prepareTurn:async input=>{calls.push(['prepare',input]);return {sessionId:'wechat-main',episodeId:'episode'};},
    onTurnEnd:async input=>{calls.push(['capture',input]);return {traceId:'fixture-trace',episodeId:'episode'};},
    recordToolOutcome:async()=>{},...overrides,
  };
  const bridge=createDeepSeekHarnessBridge({core,profileId:'isolated-wechat',recallEnabled:true,captureEnabled:true,
    recallTimeoutMs:100,contextMaxChars:1000,allowSession:allowed,userSourceKinds:['user','plugin:wechat-clawbot'],
    createRecallMessage:text=>message(text,'plugin:clawbot-memory')});
  const payload=(id='wechat-main',text='synthetic coffee preference')=>({agent:{id,session:{id,header:{agentPreset:'unrelated-preset'}},options:{provider:'fixture',model:'fixture-model'}},
    messages:[message(text)],turn:1,step:1,signal:new AbortController().signal});
  return {calls,core,bridge,payload};
}

test('ordinary and child sessions neither recall nor persist events',async()=>{
  const f=fixture();
  for(const id of ['ordinary','child','wechat-main-copy']){
    const p=f.payload(id),decision={kind:'enter',messages:p.messages};
    assert.equal(await f.bridge.beforeStep(p,async()=>decision),decision);
    f.bridge.onSessionEvent(p.agent.session,{type:'turn/start',time:100,seq:1,data:{turn:1}});
    f.bridge.onSessionEvent(p.agent.session,{type:'user/message',time:101,seq:2,data:p.messages[0]});
    f.bridge.onSessionEvent(p.agent.session,{type:'turn/end',time:102,seq:3,data:{turn:1}});
    await f.bridge.closeSession(p.agent.session);
  }
  await f.bridge.flush();assert.equal(f.calls.length,0);await f.bridge.dispose();
});
test('WeChat plugin input is recalled, captured and namespace stays pinned',async()=>{
  const f=fixture(),p=f.payload(),session=p.agent.session;
  f.bridge.onSessionEvent(session,{type:'turn/start',time:100,seq:1,data:{turn:1}});
  const result=await f.bridge.beforeStep(p,async()=>({kind:'enter',messages:p.messages}));
  assert.equal(result.messages.length,2);
  assert.equal(result.messages[1].source.kind,'plugin:clawbot-memory');
  assert.equal(f.calls[0][1].namespace.profileId,'isolated-wechat');
  f.bridge.onSessionEvent(session,{type:'user/message',time:101,seq:2,data:p.messages[0]});
  f.bridge.onSessionEvent(session,{type:'turn/end',time:102,seq:3,data:{turn:1,reason:{kind:'completed'}}});
  await f.bridge.flush();assert.equal(f.calls.filter(([name])=>name==='capture').length,1);await f.bridge.dispose();
});
test('only accepted, post-policy input is used; notifications cannot recursively recall',async()=>{
  const f=fixture(),p=f.payload();
  await f.bridge.beforeStep(p,async()=>({kind:'enter',messages:[message('redacted accepted input')]}));
  assert.equal(f.calls[0][1].query,'redacted accepted input');
  const g=fixture(),q=g.payload();q.messages=[message('notification','plugin:another')];
  await g.bridge.beforeStep(q,async()=>({kind:'enter',messages:q.messages}));
  assert.equal(g.calls.length,0);await f.bridge.dispose();await g.bridge.dispose();
});
test('all six tools reject ordinary sessions, inherited child access and missing identity',async()=>{
  const definitions=[];
  registerDeepSeekHarnessTools({tools:{register:d=>{definitions.push(d);return()=>{};}}},{core:{},profileId:'isolated-wechat',maxBodyChars:1000,
    allowSession:allowed,currentEpisode:()=>undefined,runWithLlmRoute:(_,run)=>run()});
  assert.equal(definitions.length,6);
  for(const tool of definitions){
    for(const agent of [undefined,{id:'ordinary',session:{id:'ordinary'}},{id:'child',session:{id:'child',header:{parent:'wechat-main'}}}]){
      await assert.rejects(tool.execute({query:'fixture query',id:'fixture-id',episodeId:'fixture-episode'},
        {agent,signal:new AbortController().signal}),/limited to the configured WeChat/);
    }
  }
});
test('memory switches are volatile and preserve existing persona/model options',()=>{
  for(const key of ['memosEnabled','memosRecall','memosCapture']){
    assert.ok(HOT_FIELDS.has(key));assert.equal(Config.dict[key].meta.volatile,true);
  }
  const c=normalizeConfig({memosEnabled:true,memosCapture:false,personaEnabled:true,provider:'openai-codex'});
  assert.equal(c.memosEnabled,true);assert.equal(c.memosCapture,false);assert.equal(c.personaEnabled,true);assert.equal(c.provider,'openai-codex');
});

test('proactive instructions and robot commentary are never captured as user experiences',async()=>{
  const f=fixture(),p=f.payload(),session=p.agent.session;
  p.messages=[message('synthetic backend opportunity','plugin:clawbot-proactive')];
  f.bridge.onSessionEvent(session,{type:'turn/start',time:100,seq:1,data:{turn:1}});
  await f.bridge.beforeStep(p,async()=>({kind:'enter',messages:p.messages}));
  f.bridge.onSessionEvent(session,{type:'user/message',time:101,seq:2,data:p.messages[0]});
  f.bridge.onSessionEvent(session,{type:'assistant/message',time:102,seq:3,data:{turn:1,message:{content:[{type:'text',text:'synthetic robot opinion'}]}}});
  f.bridge.onSessionEvent(session,{type:'turn/end',time:103,seq:4,data:{turn:1}});
  await f.bridge.flush();assert.equal(f.calls.length,0);
  p.turn=2;p.messages=[message('synthetic explicit user interest')];
  f.bridge.onSessionEvent(session,{type:'turn/start',time:104,seq:5,data:{turn:2}});
  await f.bridge.beforeStep(p,async()=>({kind:'enter',messages:p.messages}));
  f.bridge.onSessionEvent(session,{type:'user/message',time:105,seq:6,data:p.messages[0]});
  f.bridge.onSessionEvent(session,{type:'turn/end',time:106,seq:7,data:{turn:2}});
  await f.bridge.flush();assert.equal(f.calls.filter(([name])=>name==='capture').length,1);
  assert.equal(f.calls.find(([name])=>name==='prepare')[1].userText,'synthetic explicit user interest');
  await f.bridge.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {WechatBridge} from '../.build/work/lib/bridge.js';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {Backlog,formatDigest,isSendWindowClosed} from '../.build/work/lib/backlog.js';
import {mayRestartTurn,shouldHoldReply,MAX_HOLDS} from '../.build/work/lib/coalesce.js';
import {handleCardRoute} from '../.build/work/lib/mac-alarms.js';
import {normalizeConfig} from '../.build/work/lib/config.js';

test('Windows leaves macOS secretary off and refuses authorization or test alarms before touching native helpers',{skip:process.platform!=='win32'},async()=>{
  assert.equal(normalizeConfig({}).macCalendar,false);assert.equal(normalizeConfig({}).secretary,false);
  for(const kind of ['authorize','test']){let status,body;await handleCardRoute(kind,{method:'POST',headers:{host:'127.0.0.1:3080','content-type':'application/json',origin:'http://127.0.0.1:3080'},socket:{remoteAddress:'127.0.0.1'}},{writeHead:n=>status=n,end:s=>body=JSON.parse(s)},{enabled:()=>true,helper:{authorizePlan(){throw Error('must not run Mac helper');}},alarms:{}});assert.equal(status,400);assert.equal(body.ok,false);assert.match(body.message,/macOS/);}
});

test('upstream coalescing restarts only the recorded first thought and bounds held replies',()=>{
  const state={wechatTurn:true,turnSender:'owner',sender:'owner',recorded:true,toolCalls:0,restarts:0};
  assert.equal(mayRestartTurn(state),true);
  for(const change of [{recorded:false},{sender:'other'},{toolCalls:1},{wechatTurn:false}])assert.equal(mayRestartTurn({...state,...change}),false);
  assert.equal(shouldHoldReply({unread:true,holds:0}),true);assert.equal(shouldHoldReply({unread:true,holds:MAX_HOLDS}),false);
});

test('upstream batching never merges a proactive producer with a real message or records it as user memory',async()=>{
  const b=Object.create(WechatBridge.prototype),seen=[],tracked=[],typing=[];
  const make=(text,kind,proactive)=>({sender:'owner',text,parts:[{type:'text',text}],message:createUserMessage({content:[{type:'text',text}],source:{kind}}),proactive});
  const agent={status:'idle',followup:m=>seen.push(m),whenIdle:async()=>{}};
  Object.assign(b,{disposed:false,queue:[make('background','plugin:clawbot-proactive',true),make('human','plugin:wechat-clawbot',false)],config:{autoMemory:false,proactiveEnabled:true},typing:{start:s=>typing.push(s),stop(){}},idleCompact:{noteIdle(){}},ensureAgent:async()=>agent,trackInbox:t=>tracked.push(t),requeueUnread(){},deliverBacklog(){}});
  await b.drainQueue();assert.equal(seen.length,2);assert.equal(seen[0].source.kind,'plugin:clawbot-proactive');assert.equal(seen[1].source.kind,'plugin:wechat-clawbot');assert.equal(tracked.length,1);assert.equal(tracked[0].text,'human');assert.equal(typing.length,1);assert.equal(b.proactiveTurn,false);
});

test('human input cancels a proactive turn and queues independently without steering or merging it',async()=>{
  const b=Object.create(WechatBridge.prototype);let cancelled=0;
  Object.assign(b,{disposed:false,proactiveTurn:true,queue:[],lastInbound:new Map(),idleCompact:{noteActivity(){}},ctx:{agents:{get:()=>({status:'running',cancel:()=>cancelled++,steer(){throw Error('must not steer');}})}}});
  await b.enqueueMessage('owner','real message');assert.equal(cancelled,1);assert.equal(b.queue.length,1);assert.equal(b.queue[0].proactive,undefined);assert.equal(b.queue[0].message.source.kind,'plugin:wechat-clawbot');
});

test('deferred upstream notices persist by recipient and preserve delivery ordering across restart',async()=>{
  const root=path.resolve('.build/upstream-backlog-tests');await fs.mkdir(root,{recursive:true});const dir=await fs.mkdtemp(path.join(root,'run-'));try{
    const file=path.join(dir,'backlog.json'),backlog=new Backlog(file);
    backlog.add('owner',{kind:'text',at:'2026-01-02T01:00:00Z',text:'second synthetic notice'});
    backlog.add('owner',{kind:'text',at:'2026-01-01T01:00:00Z',text:'first synthetic notice'});
    assert.equal(new Backlog(file).peek('other').length,0);const restored=new Backlog(file).peek('owner');assert.equal(restored.length,2);
    const digest=formatDigest(restored,{fileExists:()=>false}).join('\n');assert.ok(digest.indexOf('first synthetic')<digest.indexOf('second synthetic'));
    assert.equal(isSendWindowClosed(Error('request failed: ret=-2 context token is expired')),true);
    assert.equal(isSendWindowClosed(Error('request failed: HTTP 500')),false);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

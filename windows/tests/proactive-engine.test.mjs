import test from 'node:test';
import assert from 'node:assert/strict';
import {ProactiveEngine} from '../.build/work/lib/clawbot-proactive-engine.js';
import {normalizeProactive} from '../.build/work/lib/clawbot-proactive-policy.js';
import {publicAddress,pageImage,readPublic,readViaProxy,publicDnsAnswer,localProxyAddress} from '../.build/work/lib/clawbot-proactive-media.js';
const noon=Date.parse('2026-10-08T12:00:00+08:00');
function fixture(overrides={}){
  const config=normalizeProactive({proactiveEnabled:true,proactiveTopics:'AI',proactiveChat:false,...overrides});
  let now=noon,ready=true,fail=false;const sent=[],prompts=[],saves=[];
  const engine=new ProactiveEngine(config,{now:()=>now,random:()=>0,save:async s=>saves.push(s),available:()=>({ready,reason:'busy'}),dispatch:async p=>{prompts.push(p);return true;},deliver:async d=>{sent.push(d);if(fail)throw Error('private diagnostic must not leak');}});
  return {config,engine,sent,prompts,saves,clock:v=>{now=v;},ready:v=>{ready=v;},fail:v=>{fail=v;}};
}
const draft={title:'测试资讯',text:'我觉得这张图有意思的是它展示了一个不同的解法。',sourceUrl:'https://example.com/news'};
test('no model work before real interaction, while busy, during quiet time, or immediately after chatting',async()=>{
  const f=fixture();await f.engine.restore(undefined);await f.engine.tick();assert.equal(f.prompts.length,0);
  await f.engine.human(noon);await f.engine.tick();assert.equal(f.prompts.length,0);
  f.clock(noon+3600000);f.ready(false);await f.engine.tick();assert.equal(f.prompts.length,0);
  f.ready(true);f.clock(Date.parse('2026-10-08T23:00:00+08:00'));await f.engine.tick();assert.equal(f.prompts.length,0);
});
test('one share per opportunity, no repeated article or bare link, unanswered sharing reduces interruptions',async()=>{
  const f=fixture();await f.engine.restore(undefined);await f.engine.human(noon-3600000);await f.engine.tick();
  await assert.rejects(f.engine.share({...draft,text:draft.sourceUrl}),/bare link/);
  await f.engine.share(draft);assert.equal(f.sent.length,1);
  await assert.rejects(f.engine.share(draft),/No active/);
  f.clock(noon+2*3600000);await f.engine.tick();assert.equal(f.prompts.length,1);
  await f.engine.human(noon+3600000);await f.engine.tick();
  await assert.rejects(f.engine.share({...draft,sourceUrl:draft.sourceUrl+'?utm_source=a'}),/already shared/);
});
test('uncertain network delivery is recorded before I/O and is never retried after restart',async()=>{
  const f=fixture();await f.engine.restore(undefined);await f.engine.human(noon-3600000);await f.engine.tick();f.fail(true);
  await assert.rejects(f.engine.share(draft),/不会自动重发/);assert.equal(f.sent.length,1);
  assert.equal(f.engine.state.history.at(-1).status,'failed');assert.doesNotMatch(f.engine.state.history.at(-1).reason,/private diagnostic/);
  const g=fixture();await g.engine.restore(f.saves.at(-1));g.clock(noon+2*3600000);await g.engine.tick();
  await assert.rejects(g.engine.share(draft),/already shared/);assert.equal(g.sent.length,0);
});
test('daily cap survives restart, pending evaluations are abandoned without catch-up bursts',async()=>{
  const f=fixture({proactiveDailyLimit:1});await f.engine.restore(undefined);await f.engine.human(noon-3600000);await f.engine.tick();
  const pending=structuredClone(f.engine.state),g=fixture();await g.engine.restore(pending);assert.equal(g.engine.state.history.at(-1).status,'abandoned');assert.equal(g.engine.active(),false);assert.equal(g.prompts.length,0);
  await f.engine.share(draft);const h=fixture({proactiveDailyLimit:1});await h.engine.restore(f.engine.state);await h.engine.tick();assert.equal(h.prompts.length,0);
});
test('fresh user input or disabled config cancels autonomous delivery',async()=>{
  const f=fixture();await f.engine.restore(undefined);await f.engine.human(noon-3600000);await f.engine.tick();
  await f.engine.human(noon+1);await assert.rejects(f.engine.share(draft),/No active/);assert.equal(f.sent.length,0);
  const g=fixture();await g.engine.restore(undefined);await g.engine.human(noon-3600000);await g.engine.tick();g.config.proactiveEnabled=false;
  await assert.rejects(g.engine.share(draft),/paused/);assert.equal(g.sent.length,0);
});
test('public picture helper refuses private destinations and unreferenced images',async()=>{
  for(const ip of ['127.0.0.1','10.2.3.4','192.168.1.1','169.254.169.254','172.16.0.2','100.64.1.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip);
  assert.ok(publicAddress('1.1.1.1'));assert.ok(publicAddress('2606:4700:4700::1111'));
  await assert.rejects(readPublic('http://127.0.0.1/private',1000),/refused/);
  const html='<meta content="/chart.png?x=1&amp;y=2" property="og:image"><img src="/photo.jpg">';
  assert.equal(pageImage(html,'https://example.com/article'),'https://example.com/chart.png?x=1&y=2');
  assert.throws(()=>pageImage(html,'https://example.com/article','https://example.com/private.png'),/not referenced/);
});

test('bounded early exploration stays quiet without a response, persists its start and expires automatically',async()=>{
  const f=fixture({proactiveExploreDays:7});await f.engine.restore(undefined);
  assert.equal(f.engine.state.startedAt,noon);assert.equal(f.engine.state.nextAt,noon+45*60000);
  assert.equal(f.engine.effective().proactiveDailyLimit,4);
  await f.engine.human(noon-3600000);await f.engine.tick();await f.engine.share(draft);
  f.clock(noon+3600000);await f.engine.tick();assert.equal(f.prompts.length,1);
  for(let i=1;i<4;i++){
    const at=noon+i*3600000;await f.engine.human(at-1800000);f.clock(at);await f.engine.tick();
    await f.engine.share({...draft,sourceUrl:`https://example.com/news/${i}`});
  }
  await f.engine.human(noon+4*3600000-1800000);f.clock(noon+4*3600000);await f.engine.tick();
  assert.equal(f.sent.length,4);assert.equal(f.prompts.length,4);assert.match(f.engine.lastReason,/已达上限/);
  const g=fixture({proactiveExploreDays:7});g.clock(noon+8*86400000);await g.engine.restore(f.engine.state);
  assert.equal(g.engine.state.startedAt,noon);assert.equal(g.engine.effective().proactiveDailyLimit,2);
  assert.equal(g.engine.effective().proactiveMinMinutes,90);assert.equal(g.engine.state.nextAt,noon+8*86400000+90*60000);
});

test('real incoming chat restores a bounded evaluation budget after six quiet skips, without erasing history',async()=>{
  const f=fixture({proactiveExploreDays:7});await f.engine.restore(undefined);await f.engine.human(noon-3600000);
  for(let i=0;i<6;i++){f.clock(noon+i*45*60000);await f.engine.tick();await f.engine.skip('old morning brief has no response');}
  f.clock(noon+6*45*60000);await f.engine.tick();assert.equal(f.prompts.length,6);assert.equal(f.engine.status().blockCode,'reply-evaluation-limit');
  await f.engine.human(noon+6*45*60000);f.clock(noon+7*45*60000);await f.engine.tick();
  assert.equal(f.prompts.length,7);assert.match(f.prompts.at(-1),/最近真实用户来信/);assert.match(f.prompts.at(-1),/实际发送 0 份/);
  await f.engine.skip('no trustworthy new content');assert.equal(f.engine.state.history.length,7);
  // Further incoming messages never bypass the absolute model-work ceiling.
  for(let i=7;i<12;i++){f.clock(noon+i*45*60000);await f.engine.human(noon+i*45*60000-30*60000);await f.engine.tick();await f.engine.skip('no trustworthy new content');}
  f.clock(noon+12*45*60000);await f.engine.human(noon+12*45*60000-30*60000);await f.engine.tick();
  assert.equal(f.prompts.length,12);assert.equal(f.engine.status().blockCode,'evaluation-limit');assert.equal(f.sent.length,0);
  const g=fixture({proactiveExploreDays:7});g.clock(noon+12*45*60000);await g.engine.restore(f.engine.state);
  assert.equal(g.engine.status().todayEvaluations,12);assert.equal(g.engine.status().blockCode,'evaluation-limit');
});

test('live status clears stale recent-chat reasons after the actual idle period while preserving unanswered delivery protection',async()=>{
  const f=fixture();await f.engine.restore(undefined);await f.engine.human(noon);await f.engine.tick();
  assert.equal(f.engine.status().blockCode,'recent-chat');f.clock(noon+31*60000);
  assert.equal(f.engine.status().ready,true);assert.equal(f.engine.status().todaySent,0);
  await f.engine.tick();await f.engine.share(draft);assert.equal(f.engine.status().blockCode,'unanswered');
  f.clock(noon+60*60000);assert.equal(f.engine.status().blockCode,'unanswered');assert.equal(f.engine.status().todaySent,1);
  await f.engine.human(noon+60*60000);f.clock(noon+91*60000);assert.equal(f.engine.status().ready,true);
});

test('local proxy resolves public hosts independently of fake IPs and keeps original HTTPS identity',async()=>{
  assert.equal(localProxyAddress('http://127.0.0.1:7897'),'http://127.0.0.1:7897');
  for(const uri of ['http://remote.example:7897','http://user:password@localhost:7897','http://127.0.0.1:7897/private'])assert.throws(()=>localProxyAddress(uri));
  for(const ip of ['198.18.0.65','127.0.0.1','10.0.0.1','169.254.169.254','192.0.2.1','203.0.113.2'])assert.throws(()=>publicDnsAnswer({Status:0,Answer:[{type:1,data:ip}]}),/non-public/);
  assert.throws(()=>publicDnsAnswer({Status:0,Answer:[{type:1,data:'1.1.1.1'},{type:1,data:'10.0.0.1'}]}),/non-public/);
  const calls=[],reader=async(url,options)=>{calls.push({url:String(url),options});return String(url).startsWith('https://dns.google/')?new Response(JSON.stringify({Status:0,Answer:[{type:1,data:'1.1.1.1'}]})):new Response('real public article',{headers:{'content-type':'text/html'}});};
  const result=await readViaProxy(new URL('https://example.com/news?topic=AI'),1000,'http://127.0.0.1:7897',reader);
  assert.equal(result.data.toString(),'real public article');assert.equal(calls.length,2);assert.equal(calls[1].url,'https://example.com/news?topic=AI');assert.equal(calls[1].options.redirect,'manual');
  assert.equal(new URL(calls[0].url).searchParams.get('name'),'example.com');
});

test('proxy source reads stay size bounded, refuse private resolution and do not follow redirects implicitly',async()=>{
  let sources=0;const privateDns=async()=>new Response(JSON.stringify({Status:0,Answer:[{type:1,data:'127.0.0.1'}]}));
  await assert.rejects(readViaProxy(new URL('https://example.com'),1000,'http://127.0.0.1:7897',privateDns),/non-public/);
  const reader=async(url)=>{if(String(url).startsWith('https://dns.google/'))return new Response(JSON.stringify({Status:0,Answer:[{type:1,data:'1.1.1.1'}]}));sources++;return new Response('123456789');};
  await assert.rejects(readViaProxy(new URL('https://example.com'),5,'http://127.0.0.1:7897',reader),/size limit/);assert.equal(sources,1);
  const redirect=async(url)=>String(url).startsWith('https://dns.google/')?new Response(JSON.stringify({Status:0,Answer:[{type:1,data:'1.1.1.1'}]})):new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
  const r=await readViaProxy(new URL('https://example.com'),1000,'http://127.0.0.1:7897',redirect);assert.equal(r.status,302);assert.equal(r.location,'http://127.0.0.1/private');
  await assert.rejects(readPublic(r.location,1000),/non-public/);
});

test('explicit ten-content experience uses model opportunities, real share validation and separate daily counters',async()=>{
  const f=fixture({proactiveDailyLimit:1});await f.engine.restore(undefined);const id='12345678-1234-1234-1234-123456789abc';let index=0;
  f.engine.deps.dispatch=async prompt=>{f.prompts.push(prompt);index++;assert.match(prompt,/用户已授权短时真实内容体验/);assert.match(prompt,/web_search/);await f.engine.share({...draft,sourceUrl:'https://example.com/real-content/'+index});return true;};
  for(let i=1;i<=10;i++)assert.equal(await f.engine.contentExperience(id,i,noon+3600000),'sent');
  assert.equal(f.sent.length,10);assert.equal(f.prompts.length,10);assert.equal(f.engine.status().todaySent,0);assert.ok(f.engine.state.history.every(r=>r.testRunId===id));
  await assert.rejects(f.engine.contentExperience(id,11,noon+3600000),/Invalid/);await assert.rejects(f.engine.contentExperience(id,1,noon),/Invalid/);
});

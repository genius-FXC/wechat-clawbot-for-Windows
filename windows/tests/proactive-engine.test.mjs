import test from 'node:test';
import assert from 'node:assert/strict';
import {ProactiveEngine} from '../.build/work/lib/clawbot-proactive-engine.js';
import {normalizeProactive} from '../.build/work/lib/clawbot-proactive-policy.js';
import {publicAddress,pageImage,readPublic} from '../.build/work/lib/clawbot-proactive-media.js';
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProactive,nextOpportunity,inWindow,localDay,canonicalSource,buildOpportunityPrompt,buildProactiveGuidance} from '../.build/work/lib/clawbot-proactive-policy.js';
const at=s=>Date.parse(s+'+08:00');
test('opportunities vary randomly within bounds, honor quiet time and overnight windows',()=>{
  const c=normalizeProactive({proactiveEnabled:true,proactiveMinMinutes:60,proactiveMaxMinutes:180});
  const now=at('2026-10-08T12:00:00');
  assert.equal(nextOpportunity(now,c,()=>0),now+60*60000);
  assert.equal(nextOpportunity(now,c,()=>1),now+180*60000);
  for(const rng of [()=>0,()=>0.25,()=>0.75,()=>1]){
    const value=nextOpportunity(at('2026-10-08T21:25:00'),c,rng);
    assert.ok(inWindow(value,c));assert.equal(localDay(value),'2026-10-09');
  }
  const night=normalizeProactive({proactiveStart:'22:00',proactiveEnd:'02:00'});
  assert.ok(inWindow(at('2026-10-08T23:00:00'),night));assert.ok(inWindow(at('2026-10-09T01:00:00'),night));
  assert.equal(inWindow(at('2026-10-09T03:00:00'),night),false);
});
test('config bounds are normalized and source tracking removes campaigns and fragments',()=>{
  const c=normalizeProactive({proactiveEnabled:'yes',proactiveDailyLimit:999,proactiveMinMinutes:120,proactiveMaxMinutes:30,proactiveStart:'wrong'});
  assert.equal(c.proactiveEnabled,false);assert.equal(c.proactiveDailyLimit,5);assert.equal(c.proactiveMaxMinutes,120);assert.equal(c.proactiveStart,'10:00');
  assert.equal(canonicalSource('https://example.com/a?utm_source=x&item=2#photo'),'https://example.com/a?item=2');
});
test('sharing instructions are personal, support real pictures, allow silence and isolate robot triggers',()=>{
  const c=normalizeProactive({proactiveEnabled:true,proactiveTopics:'AI 与科研',proactivePlace:'某商圈'});
  const text=buildOpportunityPrompt('industry',c,at('2026-10-08T12:00:00'),[]);
  assert.match(text,/第一人称/);assert.match(text,/clawbot_prepare_share_image/);assert.match(text,/clawbot_skip_share/);assert.match(text,/clawbot_share/);
  assert.doesNotMatch(text,/\[微信消息/);
  const guidance=buildProactiveGuidance(c);assert.match(guidance,/不虚构/);assert.match(guidance,/来源/);assert.match(guidance,/图片/);
  assert.equal(buildProactiveGuidance({...c,proactiveEnabled:false}),'');
});

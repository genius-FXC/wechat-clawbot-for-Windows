import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {RandomSendTest} from '../.build/work/lib/clawbot-proactive-send-test.js';
const noon=Date.parse('2026-10-09T12:00:00+08:00'),owner=createHash('sha256').update('fixture-owner').digest('hex');
function fixture(t){let now=noon,fail=false;const saves=[],sent=[];const runner=new RandomSendTest({now:()=>now,random:()=>0.5,save:async s=>saves.push(s),send:async(text,hash)=>{assert.equal(hash,owner);sent.push(text);if(fail)throw Error('uncertain transport');},changed(){}});t.after(()=>runner.dispose());return {runner,saves,sent,clock:n=>{now=n;},fail:()=>{fail=true;}};}
test('finite random plan has exactly ten ordered slots inside one hour and idempotent start',async t=>{
  const f=fixture(t),id=randomUUID(),s=await f.runner.start(id,noon+3600000,owner);assert.equal(s.attempts.length,10);assert.equal(s.ownerHash,undefined);
  for(const [i,a]of s.attempts.entries()){assert.ok(a.dueAt>noon&&a.dueAt<noon+3600000);if(i)assert.ok(a.dueAt>s.attempts[i-1].dueAt+1000);}
  assert.deepEqual(await f.runner.start(id,noon+3600000,owner),s);await assert.rejects(f.runner.start(randomUUID(),noon+3600000,owner),/already running/);
  const g=fixture(t);await assert.rejects(g.runner.start(randomUUID(),noon+3600001,owner),/one hour/);assert.equal(g.sent.length,0);
});
test('ten real delivery callbacks are reserved durably before I/O and never exceed ten',async t=>{
  const f=fixture(t);await f.runner.start(randomUUID(),noon+3600000,owner,'transport');
  for(const a of f.runner.state.attempts){f.clock(a.dueAt);await f.runner.tick();assert.equal(f.saves.at(-2).attempts[a.index-1].status,'sending');}
  assert.equal(f.sent.length,10);assert.equal(f.runner.view().sent,10);assert.equal(f.runner.view().status,'complete');assert.match(f.sent[9],/10\/10/);
  f.clock(noon+3600000);await f.runner.tick();assert.equal(f.sent.length,10);
});
test('content experience passes no placeholder text and records skipped selection without inventing delivery',async t=>{
  const f=fixture(t);let input;f.runner.deps.send=async text=>{input=text;return 'skipped';};await f.runner.start(randomUUID(),noon+3600000,owner);
  f.clock(f.runner.state.attempts[0].dueAt);await f.runner.tick();assert.equal(input,'');assert.equal(f.runner.view().sent,0);assert.equal(f.runner.state.attempts[0].status,'skipped');
});
test('restart abandons overdue slots and uncertain delivery without a catch-up burst or replay',async t=>{
  const f=fixture(t);await f.runner.start(randomUUID(),noon+3600000,owner);const saved=structuredClone(f.runner.state);saved.attempts[0].status='sending';
  const g=fixture(t);g.clock(saved.attempts[2].dueAt+1);await g.runner.restore(saved);assert.equal(g.runner.state.attempts[0].status,'uncertain');assert.equal(g.runner.state.attempts[1].status,'missed');
  await g.runner.tick();assert.equal(g.sent.length,0);g.clock(g.runner.state.attempts[3].dueAt);await g.runner.tick();assert.equal(g.sent.length,1);
});
test('cancellation, expiration and ambiguous network errors never create extra messages',async t=>{
  const f=fixture(t);await f.runner.start(randomUUID(),noon+3600000,owner);await f.runner.cancel();f.clock(noon+3600000);await f.runner.tick();assert.equal(f.sent.length,0);assert.equal(f.runner.view().status,'cancelled');
  const g=fixture(t);await g.runner.start(randomUUID(),noon+3600000,owner);g.clock(noon+3600001);await g.runner.tick();assert.equal(g.sent.length,0);assert.equal(g.runner.view().status,'complete');
  const h=fixture(t);await h.runner.start(randomUUID(),noon+3600000,owner);h.fail();h.clock(h.runner.state.attempts[0].dueAt);await h.runner.tick();await h.runner.tick();assert.equal(h.sent.length,1);assert.equal(h.runner.view().uncertain,1);
});

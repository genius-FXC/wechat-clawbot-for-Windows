import test from 'node:test';
import assert from 'node:assert/strict';
const {isClawbotMemorySession,normalizeMemory}=await import(new URL('../.build/work/lib/clawbot-memory-scope.js',import.meta.url));

test('only the explicit chatbot session is admitted',()=>{
  assert.equal(isClawbotMemorySession({id:'wechat-main'},'wechat-main'),true);
  for(const session of [undefined,null,{}, {id:'ordinary'}, {id:'child',header:{parent:'wechat-main',agentPreset:'wechat-main'}}, {id:123}, {id:'wechat-main-copy'}]) {
    assert.equal(isClawbotMemorySession(session,'wechat-main'),false);
  }
  assert.equal(isClawbotMemorySession({id:'wechat-main'},''),false);
});
test('memory remains opt-in and capture/recall can be independently disabled',()=>{
  assert.deepEqual(normalizeMemory({}),{memosEnabled:false,memosRecall:true,memosCapture:true});
  assert.deepEqual(normalizeMemory({memosEnabled:'true',memosRecall:false,memosCapture:false}),{memosEnabled:false,memosRecall:false,memosCapture:false});
});

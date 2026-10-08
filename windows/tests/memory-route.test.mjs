import test from 'node:test';
import assert from 'node:assert/strict';
import {registerClawbotMemory} from '../.build/work/lib/clawbot-memory.js';

test('memory management explicitly enforces the host authentication fence before handling requests',async()=>{
  let route;const checked=[];
  const child={
    effect(fn){return fn();},
    webServer:{register(value){route=value;return()=>{};}},
    connection:{requestRejection(req){checked.push(req);return req.headers.cookie==='valid-fixture'?undefined:401;}},
  };
  const ctx={inject(services,fn){if(services.includes('webServer')){assert.ok(services.includes('connection'));fn(child);}}};
  registerClawbotMemory(ctx,{sessionId:'wechat-main',memosEnabled:true,memosRecall:true,memosCapture:true});
  const call=async(method,headers={})=>{
    const req={method,headers,async *[Symbol.asyncIterator](){throw Error('unauthorized body must not be read');}};
    let status,body;
    await route.handler(req,{writeHead(code,h){status=code;assert.equal(h['cache-control'],'no-store');},end(value){body=JSON.parse(value);}});
    assert.equal(checked.at(-1),req);return {status,body};
  };
  for(const method of ['GET','POST']){
    const result=await call(method,{'x-clawbot-memory-action':'delete'});
    assert.equal(result.status,401);assert.equal(result.body.records,undefined);
  }
  const admitted=await call('GET',{cookie:'valid-fixture'});
  assert.equal(admitted.status,200);assert.equal(admitted.body.scope,'当前 clawbot 微信主会话');
  const missingAction=await call('POST',{cookie:'valid-fixture'});
  assert.equal(missingAction.status,403);
  const foreignOrigin=await call('POST',{cookie:'valid-fixture','x-clawbot-memory-action':'delete',host:'127.0.0.1:3080',origin:'https://foreign.example'});
  assert.equal(foreignOrigin.status,403);
});

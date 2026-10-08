import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {apply} from '../.build/work/lib/memos/adapters/deepseek-harness/index.js';

test('actual SQLite adapter mounts tools only on the bot and prompt stays isolated',async()=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'clawbot-memos-runtime-'));
  const listeners=new Map(),sections=[],globalTools=[];
  const makeAgent=id=>({id,session:{id},definitions:[],ctx:{tools:{register(d){this.definitions.push(d);return()=>{};},definitions:[]}}});
  const bot=makeAgent('wechat-main'),normal=makeAgent('ordinary');let core;
  const ctx={logger:{info(){},warn(){}},llm:{},
    on(name,fn){listeners.set(name,fn);return()=>listeners.delete(name);},
    systemPrompt:{section(s){sections.push(s);return()=>{};}},
    tools:{register(d){globalTools.push(d);return()=>{};}},
    agents:{list:()=>[bot,normal]},
  };
  let dispose;
  try{
    dispose=await apply(ctx,{enabled:true,profileId:'fixture-wechat',home,
      recallEnabled:true,captureEnabled:true,toolsEnabled:true,hostLlmEnabled:false,
      viewerEnabled:false,viewerPort:18801,recallTimeoutMs:100,contextMaxChars:1000,toolResultMaxChars:1000,failOnStartupError:true,
      allowSession:session=>session?.id==='wechat-main',onReady:value=>{core=value;}});
    assert.equal(globalTools.length,0);
    assert.equal(normal.ctx.tools.definitions.length,0);
    assert.equal(bot.ctx.tools.definitions.length,6);
    assert.equal(sections[0].text({agent:normal}),'');
    assert.match(sections[0].text({agent:bot}),/historical data/);
    assert.equal(await core.countTraces(),0);
    const fakeEvent={type:'user/message',seq:1,time:Date.now(),data:{id:'fixture',role:'user',source:{kind:'user'},content:[{type:'text',text:'synthetic private data'}]}};
    listeners.get('session/event')(normal.session,fakeEvent);
    await listeners.get('session/disposed')(normal.session);
    assert.equal(await core.countTraces(),0);
    const child=makeAgent('child');listeners.get('agent/created')({agent:child});
    assert.equal(child.ctx.tools.definitions.length,0);
    assert.ok((await fs.stat(path.join(home,'data/memos.db'))).size>0);
  }finally{
    await dispose?.();
    // mkdtemp produced this exact task-owned child, never a computed user data path.
    assert.equal(path.dirname(home),os.tmpdir());assert.ok(path.basename(home).startsWith('clawbot-memos-runtime-'));
    await fs.rm(home,{recursive:true,force:true});
  }
});

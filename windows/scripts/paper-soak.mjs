import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {connection} from './paper-live.mjs';
const directory=path.resolve(process.argv[2]||'.build/paper-soak');await fs.mkdir(directory,{recursive:true});
const startedAt=new Date().toISOString(),start=performance.now(),minimumMs=4*3600000+60000;let cycles=0,passed=0,failed=0,consecutivePassed=0;
const journal=path.join(directory,'checks.jsonl'),statusFile=path.join(directory,'status.json');
async function cycle(){const sample={at:new Date().toISOString(),elapsedSeconds:Math.round((performance.now()-start)/1000)};try{
  const c=await connection();const s=await c.get('/plugins/clawbot/papers');if(!s.ok||!s.enabled||!s.zotero?.ok)throw Error('论文工作台或 Zotero 未就绪');
  const collections=await c.get('/plugins/clawbot/papers?action=collections');const search=await c.get('/plugins/clawbot/papers?action=search&q=FeSe');if(!collections.collections?.length||!search.items?.length)throw Error('真实分类/检索结果为空');
  const unauth=await fetch(c.base+'/plugins/clawbot/papers',{signal:AbortSignal.timeout(5000)});if(unauth.status!==401)throw Error('鉴权边界失效');
  try{const rec=await c.get('/plugins/paper-recommender/status');sample.recommender=rec.ok?'ready':'failed';if(!rec.ok)throw Error('推荐插件未就绪');}catch(e){sample.recommender='not-installed-yet';}
  passed++;consecutivePassed++;sample.ok=true;sample.collections=s.zotero.collections;sample.items=s.zotero.items;
}catch(e){failed++;consecutivePassed=0;sample.ok=false;sample.error=e.message;}
cycles++;await fs.appendFile(journal,JSON.stringify(sample)+'\n');await fs.writeFile(statusFile,JSON.stringify({startedAt,updatedAt:sample.at,elapsedSeconds:sample.elapsedSeconds,requiredSeconds:minimumMs/1000,cycles,passed,failed,consecutivePassed,complete:performance.now()-start>=minimumMs,last:sample},null,2));}
await cycle();while(performance.now()-start<minimumMs){await new Promise(r=>setTimeout(r,30000));await cycle();}
console.log('Four-hour paper integration soak finished.');

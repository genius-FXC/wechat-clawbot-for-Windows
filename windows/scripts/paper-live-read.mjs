import fs from 'node:fs/promises';
import {connection} from './paper-live.mjs';
try{
  const target=process.argv[2];
  if(!target||!(/^[A-Z0-9]{8}$/.test(target)||/^[a-f0-9-]{36}$/.test(target)))throw Error('Provide a Zotero item key or an existing test-only job ID');
  const c=await connection(),selection=/^[a-f0-9-]{36}$/.test(target)?{jobId:target}:{itemKey:target};
  const retryExport=process.argv.includes('--retry-export');console.log(JSON.stringify({stage:retryExport?'saved-draft-export':'real-model-reading',at:new Date().toISOString(),testMode:true}));
  const result=await c.post('/plugins/clawbot/papers',{...selection,mode:'staged',testMode:true,retryExport},{'x-clawbot-paper-action':'analyze'});
  await fs.writeFile('.build/paper-real-result.json',JSON.stringify(result,null,2));await fs.writeFile(`.build/paper-real-result-${result.jobId}-part${result.part}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:result.ok,jobId:result.jobId,part:result.part,total:result.total,files:result.files}));
}catch(e){console.error(JSON.stringify({ok:false,error:e.message,at:new Date().toISOString()}));process.exitCode=1;}

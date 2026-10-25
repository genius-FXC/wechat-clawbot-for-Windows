import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {workerCall} from '../../extensions/literature/core.mjs';
const windows=fileURLToPath(new URL('../',import.meta.url)),home=path.resolve(windows,'../.local/papers/self-tests'),jobId=process.argv[2];
if(!/^[a-f0-9-]{36}$/.test(jobId))throw Error('Select an existing test-only job');
const dir=path.join(windows,'.build/export-soak-'+Date.now()),until=Date.parse(process.argv[3]);if(!Number.isFinite(until)||until<Date.now())throw Error('Future end time required');await fs.mkdir(dir,{recursive:true});const mathRenderer=path.join(dir,'math-render.mjs');await fs.copyFile(path.resolve(windows,'../extensions/literature/math-render.mjs'),mathRenderer);
const dependencies=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies'),python=path.join(dependencies,'python/python.exe'),renderer=path.join(dependencies,'native/poppler/Library/bin/pdftoppm.exe');
const registry=JSON.parse(await fs.readFile(path.join(home,'sources.json'),'utf8')),first=JSON.parse(await fs.readFile(path.join(home,'jobs',jobId,'job.json'),'utf8'));const originals=registry.filter(s=>first.sourceIds.includes(s.id));
const hash=b=>createHash('sha256').update(b).digest('hex'),expected=new Map();for(const s of originals){const cached=JSON.parse(await fs.readFile(path.join(home,'sources',s.id,'pages.json'),'utf8'));expected.set(s.id,cached.sha256);}
let cycles=0,passed=0,failed=0;const startedAt=new Date().toISOString();
async function check(){const at=new Date().toISOString();let ok=true,error,pageCount=0,bytes=0;try{
  for(const s of originals)if(hash(await fs.readFile(s.file))!==expected.get(s.id))throw Error('An original PDF has changed');
  const job=JSON.parse(await fs.readFile(path.join(home,'jobs',jobId,'job.json'),'utf8'));if(job.next!==job.reports.length||job.reports.some((r,i)=>r.part!==i))throw Error('Persisted progress is not contiguous');const report=job.reports.at(-1);if(!report)throw Error('No completed test report');
  const target=path.join(dir,'generated-check.pdf'),result=await workerCall(python,{action:'export',markdown:report.markdown,target,title:'派生报告持续导出检查',node:process.execPath,mathRenderer});bytes=result.bytes;
  const extraction=await workerCall(python,{action:'extract',source:target,out:path.join(dir,'extraction')});pageCount=extraction.pageCount;if(!pageCount)throw Error('Exported PDF has no pages');await workerCall(python,{action:'render',source:target,page:1,out:path.join(dir,'rendered'),renderer});passed++;
}catch(e){ok=false;error=e.message;failed++;}cycles++;const sample={at,ok,error,pageCount,bytes};await fs.appendFile(path.join(dir,'checks.jsonl'),JSON.stringify(sample)+'\n');await fs.writeFile(path.join(dir,'status.json'),JSON.stringify({startedAt,updatedAt:at,cycles,passed,failed,complete:Date.now()>=until,last:sample},null,2));}
await check();while(Date.now()<until){await new Promise(r=>setTimeout(r,Math.min(300000,Math.max(1,until-Date.now()))));await check();}console.log('Derived export/render/original-preservation checks completed.');

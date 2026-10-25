import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {connection} from './paper-live.mjs';
try{
  const c=await connection(),action=process.argv[2]||'status';let result;
  if(action==='start'){
    const deadlineAt=Date.parse(process.argv[3]);if(!Number.isFinite(deadlineAt))throw Error('Provide the approved test deadline as an ISO time');
    const id=process.argv[4]||randomUUID();const request={id,deadlineAt};const dir=new URL('../../.local/proactive-tests/',import.meta.url);await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(new URL(id+'.request.json',dir),JSON.stringify(request,null,2),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    result=await c.post('/plugins/clawbot/proactive',request,{'x-clawbot-proactive-action':'start-test'},15000);
    await fs.writeFile(new URL(id+'.plan.json',dir),JSON.stringify(result.test,null,2));
  }else if(action==='cancel')result=await c.post('/plugins/clawbot/proactive',{}, {'x-clawbot-proactive-action':'cancel-test'},15000);
  else if(action==='status')result=(await c.get('/plugins/clawbot/proactive')).test;
  else throw Error('Supported actions: start, status, cancel');
  console.log(JSON.stringify(result));
}catch(e){console.error(e.message);process.exitCode=1;}

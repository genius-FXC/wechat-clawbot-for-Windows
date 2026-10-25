import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
// Node fetch has a separate five-minute response-header deadline. Long paper
// self-tests use an explicit local HTTP deadline instead; no provider tokens
// are read or sent here, only the existing localhost DSH session cookie.
function localPost(url,args,headers,timeout){return new Promise((resolve,reject)=>{
  const body=JSON.stringify(args);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(Error('本机研读测试请求超时')),timeout);
  const req=http.request(url,{method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),...headers},signal:controller.signal},res=>{
    let text='';res.setEncoding('utf8');res.on('data',s=>{text+=s;if(text.length>4000000)req.destroy(Error('本机研读测试响应过大'));});res.on('error',e=>{clearTimeout(timer);reject(e);});
    res.on('end',()=>{clearTimeout(timer);try{const j=JSON.parse(text);if(res.statusCode<200||res.statusCode>=300||j.ok===false)throw Error(j.error||'HTTP '+res.statusCode);resolve(j);}catch(e){reject(e);}});
  });req.on('error',e=>{clearTimeout(timer);reject(e);});req.end(body);
});}
export async function connection(){
  const base='http://127.0.0.1:3080',log=await fs.readFile(path.join(process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),'logs/dsh-web.out.log'),'utf8');
  const urls=[...log.matchAll(/https?:\/\/[^\s\x1b]+/g)].map(m=>m[0]).filter(s=>{try{const u=new URL(s);return u.hostname==='127.0.0.1'&&u.port==='3080'&&u.searchParams.has('token');}catch{return false;}});
  let cookie;for(const url of urls.reverse()){try{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(5000)});const c=r.headers.get('set-cookie');if(c){cookie=c.split(';')[0];break;}}catch{}}
  if(!cookie)throw Error('本机 DSH 验证失败');
  return {base,async post(route,args,headers={},timeout=660000){return localPost(base+route,args,{cookie,...headers},timeout);},async get(route){const r=await fetch(base+route,{headers:{cookie},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();},async rpc(method,args){const r=await fetch(base+'/api/'+method,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'papers-local-test',method,payload:{args}}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('RPC HTTP '+r.status);const e=await r.json();return e.result?.value?.value??e.result?.value??e.result;}};
}

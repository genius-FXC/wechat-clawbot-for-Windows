import {ProxyAgent,Pool,fetch as undiciFetch} from 'undici';
import {execFile} from 'node:child_process';
export function proxyAddress(value){if(!value||value==='direct')return null;const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('代理必须是本机无凭据的 HTTP 地址');return u.origin;}
export function publicIPv4(value){const a=String(value).split('.').map(Number);return a.length===4&&a.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&!([0,10,127].includes(a[0])||a[0]>=224||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===100&&a[1]>=64&&a[1]<=127)||(a[0]===198&&[18,19].includes(a[1])));}
async function windowsProxy(){if(process.platform!=='win32')return '';return new Promise(resolve=>{execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$u=[System.Net.WebRequest]::GetSystemWebProxy().GetProxy([Uri]'https://export.arxiv.org'); if($u.Host -in @('127.0.0.1','localhost','::1')){$u.GetLeftPart([System.UriPartial]::Authority)}"],{windowsHide:true,timeout:5000,encoding:'utf8'},(err,out)=>resolve(err?'':out.trim()));});}
export async function publicFetch(proxyUrl=''){
  const uri=proxyAddress(proxyUrl||await windowsProxy());const agent=uri?new ProxyAgent(uri):undefined;
  const fallback=new Map();
  const network={mode:uri?'local-proxy':'direct',async fetch(url,options={}){
    const u=new URL(url);if(u.protocol!=='https:'||!['export.arxiv.org','arxiv.org'].includes(u.hostname)||u.port||u.username||u.password)throw Error('拒绝非官方 arXiv 请求');
    const cached=fallback.get(u.hostname);if(cached&&Date.now()<cached.expires)return undiciFetch(u,{...options,dispatcher:cached.agent});
    try{return await undiciFetch(u,{...options,...(agent?{dispatcher:agent}:{})});}catch(error){
      if(!uri||options.signal?.aborted||!['ECONNRESET','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code))throw error;
      // A local academic DIRECT rule can fail even though the proxy works. Resolve
      // ONLY this public official host and tunnel its public IPv4 through the same
      // local proxy. Original HTTPS URL/SNI/certificate verification stay intact.
      const dns=new URL('https://dns.google/resolve');dns.searchParams.set('name',u.hostname);dns.searchParams.set('type','A');dns.searchParams.set('edns_client_subnet','0.0.0.0/0');
      const r=await undiciFetch(dns,{dispatcher:agent,signal:AbortSignal.any([options.signal||new AbortController().signal,AbortSignal.timeout(10000)]),redirect:'error'});
      if(!r.ok)throw error;const j=await r.json();const answer=j.Status===0?j.Answer?.find(a=>a.type===1&&publicIPv4(a.data)):null;const ip=answer?.data;if(!ip)throw Error('官方学术域名未解析到有效的公网 IPv4');
      const routed=new ProxyAgent({uri,clientFactory:(origin,opts)=>{const pool=new Pool(origin,opts),connect=pool.connect.bind(pool);pool.connect=(params,...args)=>connect({...params,path:ip+':443',headers:{...params.headers,host:ip+':443'}},...args);return pool;}});
      try{const result=await undiciFetch(u,{...options,dispatcher:routed});await cached?.agent.close();fallback.set(u.hostname,{expires:Date.now()+Math.max(1,Math.min(300,Number(answer.TTL)||60))*1000,agent:routed});network.mode='local-proxy-academic';return result;}catch(e){await routed.close();throw e;}
    }
  },async close(){await Promise.all([agent?.close(),...[...fallback.values()].map(v=>v.agent.close())]);}};
  return network;
}

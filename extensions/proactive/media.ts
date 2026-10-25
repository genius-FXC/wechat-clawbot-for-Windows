import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import http from "node:http";
import https from "node:https";
import {execFile} from "node:child_process";
import {ProxyAgent,Pool,fetch as undiciFetch} from "undici";
import {canonicalSource} from "./clawbot-proactive-policy.js";
export function publicAddress(address:string):boolean {
  if(isIP(address)===4){
    const [a=0,b=0,c=0]=address.split(".").map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b)||a===192&&b===0&&[0,2].includes(c)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
  }
  if(isIP(address)===6){const a=address.toLowerCase();return /^[23]/.test(a)&&!a.startsWith("2001:db8:")&&!a.startsWith("2002:")&&!/^2001:(0*:|0:)/.test(a);}
  return false;
}
export function localProxyAddress(value:string):string|null {
  if(!value)return null;const u=new URL(value);
  if(!["http:","https:"].includes(u.protocol)||!["127.0.0.1","localhost","[::1]"].includes(u.hostname)||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Only a credential-free local HTTP proxy is supported");
  return u.origin;
}
let proxyDiscovery:Promise<string|null>|undefined;
function windowsProxy():Promise<string|null>{
  if(!proxyDiscovery)proxyDiscovery=process.platform!=="win32"?Promise.resolve(null):new Promise(resolve=>{
    execFile("powershell.exe",["-NoProfile","-NonInteractive","-Command","$u=[System.Net.WebRequest]::GetSystemWebProxy().GetProxy([Uri]'https://arxiv.org'); if($u.Host -in @('127.0.0.1','localhost','::1')){$u.GetLeftPart([System.UriPartial]::Authority)}"],{windowsHide:true,timeout:5000,encoding:"utf8"},(error,out)=>{try{resolve(error?null:localProxyAddress(out.trim()));}catch{resolve(null);}});
  });return proxyDiscovery;
}
export async function boundedResource(response:Response,maxBytes:number):Promise<Buffer>{
  if(Number(response.headers.get("content-length"))>maxBytes){await response.body?.cancel();throw Error("Public resource exceeds size limit");}
  const reader=response.body?.getReader();if(!reader)return Buffer.alloc(0);const chunks:Buffer[]=[];let bytes=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Error("Public resource exceeds size limit");}chunks.push(Buffer.from(chunk.value));}return Buffer.concat(chunks);}finally{reader.releaseLock();}
}
export function publicDnsAnswer(input:unknown):string{
  const answer=input as {Status?:unknown;Answer?:Array<{type?:unknown;data?:unknown}>};
  const addresses=Array.isArray(answer?.Answer)?answer.Answer.filter(a=>a.type===1).map(a=>String(a.data)):[];
  if(answer?.Status!==0||!addresses.length||addresses.some(ip=>isIP(ip)!==4||!publicAddress(ip)))throw Error("Private or non-public network destination refused");
  return addresses[0]!;
}
/** Resolve through the local proxy, but tunnel only to a verified public IP.
 * The original URL, Host, TLS SNI and certificate validation remain intact. */
export async function readViaProxy(url:URL,maxBytes:number,proxy:string,fetcher:typeof undiciFetch=undiciFetch):Promise<{status:number;location?:string;contentType:string;data:Buffer}>{
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.port&&!["80","443"].includes(url.port)||url.href.length>2048)throw Error("Unsupported public URL");
  const uri=localProxyAddress(proxy);if(!uri)throw Error("Local proxy unavailable");
  const resolver=new ProxyAgent(uri);let routed:ProxyAgent|undefined;
  const signal=AbortSignal.timeout(20000);
  try{
    const host=url.hostname.replace(/^\[|\]$/g,"");let ip=host;
    if(!isIP(host)){
      const dns=new URL("https://dns.google/resolve");dns.searchParams.set("name",host);dns.searchParams.set("type","A");dns.searchParams.set("edns_client_subnet","0.0.0.0/0");
      const response=await fetcher(dns,{dispatcher:resolver,signal,redirect:"error"});if(!response.ok)throw Error("Public DNS unavailable");
      ip=publicDnsAnswer(JSON.parse((await boundedResource(response as unknown as Response,65536)).toString("utf8")));
    }else if(!publicAddress(ip))throw Error("Private or non-public network destination refused");
    const port=url.port||(url.protocol==="https:"?"443":"80"),target=(isIP(ip)===6?"["+ip+"]":ip)+":"+port;
    routed=new ProxyAgent({uri,clientFactory:(origin,opts)=>{const pool=new Pool(origin,opts),connect=pool.connect.bind(pool);pool.connect=((params:any,...args:any[])=>(connect as any)({...params,path:target,headers:{...params.headers,host:target}},...args)) as typeof pool.connect;return pool;}});
    const response=await fetcher(url,{dispatcher:routed,signal,redirect:"manual",headers:{"user-agent":"clawbot-sharing/1.1","accept-encoding":"identity"}});
    const status=response.status,location=response.headers.get("location")||undefined,contentType=response.headers.get("content-type")||"";
    if(status!==200){await response.body?.cancel();return {status,location,contentType,data:Buffer.alloc(0)};}
    return {status,location,contentType,data:await boundedResource(response as unknown as Response,maxBytes)};
  }finally{await Promise.all([resolver.destroy(),routed?.destroy()]);}
}
export async function readPublic(urlText:string,maxBytes:number,redirects=0):Promise<{url:string;contentType:string;data:Buffer}> {
  const url=new URL(canonicalSource(urlText));
  if(url.port&&!['80','443'].includes(url.port)||url.href.length>2048)throw Error("Unsupported public URL");
  const host=url.hostname.replace(/^\[|\]$/g,"");
  if(isIP(host)&&!publicAddress(host)||!isIP(host)&&(!host.includes(".")||/\.(?:localhost|local|lan|internal)$/i.test(host)))throw Error("Private or non-public network destination refused");
  const proxy=await windowsProxy();
  if(proxy){
    const result=await readViaProxy(url,maxBytes,proxy);
    if([301,302,303,307,308].includes(result.status)&&result.location){if(redirects>=3)throw Error("Too many redirects");return readPublic(new URL(result.location,url).href,maxBytes,redirects+1);}
    if(result.status!==200)throw Error("Public source unavailable (HTTP "+result.status+")");
    return {url:url.href,contentType:result.contentType,data:result.data};
  }
  const records=await lookup(host,{all:true});
  if(!records.length||records.some(r=>!publicAddress(r.address)))throw Error("Private or non-public network destination refused");
  const result=await new Promise<{status:number;location?:string;contentType:string;data:Buffer}>((resolve,reject)=>{
    const transport=url.protocol==="https:"?https:http;
    const first=records[0]!;
    const request=transport.get(url,{headers:{"user-agent":"clawbot-sharing/1.0","accept-encoding":"identity"},family:first.family,
      lookup:(_host,options,callback)=>{
        const cb=callback as (...args:unknown[])=>void;
        if(options.all)cb(null,records);else cb(null,first.address,first.family);
      }},response=>{
      const chunks:Buffer[]=[];let bytes=0;
      response.on("data",(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>maxBytes){request.destroy(Error("Public resource exceeds size limit"));return;}chunks.push(chunk);});
      response.on("error",reject);
      response.on("end",()=>resolve({status:response.statusCode??0,location:response.headers.location,contentType:String(response.headers["content-type"]??""),data:Buffer.concat(chunks)}));
    });
    request.setTimeout(15000,()=>request.destroy(Error("Public resource request timed out")));
    request.on("error",reject);
  });
  if([301,302,303,307,308].includes(result.status)&&result.location){if(redirects>=3)throw Error("Too many redirects");return readPublic(new URL(result.location,url).href,maxBytes,redirects+1);}
  if(result.status!==200)throw Error("Public source unavailable");
  return {url:url.href,contentType:result.contentType,data:result.data};
}
const decode=(s:string)=>s.replaceAll("&amp;","&").replaceAll("&quot;",'"').replaceAll("&#39;","'").replaceAll("&lt;","<").replaceAll("&gt;",">");
export function pageImage(html:string,pageUrl:string,requested?:string):string|undefined {
  const images:string[]=[];
  for(const match of html.matchAll(/<meta\b[^>]*>/gi)){
    const tag=match[0];if(!/\b(?:property|name)\s*=\s*["'](?:og:image|twitter:image)(?::url)?["']/i.test(tag))continue;
    const content=/\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];if(content)images.push(content);
  }
  for(const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi))images.push(match[1]!);
  const urls=images.flatMap(value=>{try{return [canonicalSource(new URL(decode(value),pageUrl).href)];}catch{return [];}});
  if(requested){const wanted=canonicalSource(new URL(requested,pageUrl).href);if(!urls.includes(wanted))throw Error("Requested image is not referenced by the source page");return wanted;}
  return urls[0];
}
export const pageExcerpt=(html:string)=>decode(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim().slice(0,6000);

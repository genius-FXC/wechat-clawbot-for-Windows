import {lookup} from "node:dns/promises";
import {isIP} from "node:net";
import http from "node:http";
import https from "node:https";
import {canonicalSource} from "./clawbot-proactive-policy.js";
export function publicAddress(address:string):boolean {
  if(isIP(address)===4){
    const [a=0,b=0,c=0]=address.split(".").map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b)||a===192&&b===0&&[0,2].includes(c)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
  }
  if(isIP(address)===6){const a=address.toLowerCase();return /^[23]/.test(a)&&!a.startsWith("2001:db8:")&&!a.startsWith("2002:")&&!/^2001:(0*:|0:)/.test(a);}
  return false;
}
export async function readPublic(urlText:string,maxBytes:number,redirects=0):Promise<{url:string;contentType:string;data:Buffer}> {
  const url=new URL(canonicalSource(urlText));
  if(url.port&&!['80','443'].includes(url.port)||url.href.length>2048)throw Error("Unsupported public URL");
  const host=url.hostname.replace(/^\[|\]$/g,"");
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

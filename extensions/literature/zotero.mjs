import {fileURLToPath} from 'node:url';

export function localBase(value='http://127.0.0.1:23119') {
  const u=new URL(value);
  if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Zotero 地址必须是本机 HTTP 根地址');
  return u.origin;
}
export function zoteroKey(key){if(!/^[A-Z0-9]{8}$/.test(key))throw Error('无效的 Zotero 条目编号');return key;}
export function itemSummary(row){const d=row.data||row;return {key:row.key||d.key,type:d.itemType,title:d.title||d.name||'(无标题)',date:d.date||'',doi:d.DOI||'',url:d.url||'',abstract:d.abstractNote||'',collections:d.collections||[],tags:(d.tags||[]).map(t=>t.tag),authors:(d.creators||[]).map(c=>c.name||[c.firstName,c.lastName].filter(Boolean).join(' ')).slice(0,10)};}
export class ZoteroClient {
  constructor(base,{fetcher=fetch,timeout=10000}={}){this.base=localBase(base);this.fetcher=fetcher;this.timeout=timeout;}
  async get(route,params={}) {
    if(!/^\/(?:users\/0\/(?:items|collections)(?:\/[A-Z0-9]{8})?(?:\/top|\/children|\/items|\/collections|\/fulltext|\/file\/view\/url)?|)$/.test(route))throw Error('拒绝未支持的 Zotero 路由');
    const url=new URL(this.base+'/api'+route);for(const [k,v] of Object.entries(params))if(v!==undefined&&v!=='')url.searchParams.set(k,String(v));
    let r;try{r=await this.fetcher(url,{headers:{'Zotero-API-Version':'3'},signal:AbortSignal.timeout(this.timeout),redirect:'error'});}catch{throw Error('无法连接 Zotero，请保持 Zotero 打开并启用本地 API');}
    if(!r.ok)throw Error(`Zotero 返回 ${r.status}；请检查条目、附件和本地 API`);
    const text=await r.text();if(Buffer.byteLength(text)>16*1024*1024)throw Error('Zotero 响应过大');
    let value;try{value=JSON.parse(text);}catch{value=text.trim();}
    return {value,total:Number(r.headers.get('Total-Results')||0),version:r.headers.get('Last-Modified-Version')};
  }
  async status(){const c=await this.get('/users/0/collections',{limit:1}),i=await this.get('/users/0/items/top',{limit:1});return {ok:true,collections:c.total,items:i.total};}
  async collections(){const rows=[];for(let start=0;start<2000;start+=100){const r=await this.get('/users/0/collections',{start,limit:100});if(!Array.isArray(r.value))throw Error('Zotero 分类响应异常');rows.push(...r.value.map(x=>({key:x.key,name:x.data.name,parent:x.data.parentCollection||null,count:x.meta?.numItems??null})));if(r.value.length<100)break;}return rows;}
  async search({query='',collection,offset=0,limit=20}={}){
    limit=Math.max(1,Math.min(40,Number(limit)||20));offset=Math.max(0,Math.min(50000,Number(offset)||0));query=String(query).trim().slice(0,400);
    const route=collection?'/users/0/collections/'+zoteroKey(collection)+'/items':'/users/0/items/top';
    const r=await this.get(route,{q:query,qmode:'titleCreatorYear',start:offset,limit,sort:'dateModified',direction:'desc'});
    if(!Array.isArray(r.value))throw Error('Zotero 检索响应异常');return {total:r.total,offset,limit,items:r.value.filter(x=>x.data?.itemType!=='note'&&(x.data?.itemType!=='attachment'||(!x.data.parentItem&&(x.data.contentType==='application/pdf'||/\.pdf$/i.test(x.data.filename||''))))).map(itemSummary),nextOffset:r.value.length===limit?offset+limit:null};
  }
  async item(key){return (await this.get('/users/0/items/'+zoteroKey(key))).value;}
  async children(key){const rows=[];for(let start=0;start<2000;start+=100){const r=await this.get('/users/0/items/'+zoteroKey(key)+'/children',{limit:100,start});if(!Array.isArray(r.value))throw Error('Zotero 附件列表无效');rows.push(...r.value);if(r.value.length<100)return rows;}throw Error('此条目附件过多，请选择具体附件');}
  async file(key){const r=await this.get('/users/0/items/'+zoteroKey(key)+'/file/view/url');const value=typeof r.value==='string'?r.value:r.value.url;if(typeof value!=='string'||!value.startsWith('file:'))throw Error('附件没有本地文件；请先在 Zotero 下载 PDF');const url=new URL(value);if(url.hostname&&url.hostname!=='localhost')throw Error('附件指向网络共享；论文工作台只读取本机 PDF');return fileURLToPath(url);}
}

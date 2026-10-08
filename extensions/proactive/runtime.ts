import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import type {Context} from "@deepseek-ai/cordis";
import type {Agent} from "@deepseek-ai/dsh-agent";
import {SessionId} from "@deepseek-ai/dsh-session";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {ClawbotConfig} from "./config.js";
import type {WechatBridge} from "./bridge.js";
import type {ResolvedWeixinAccount} from "./ilink/auth/accounts.js";
import {defineTool} from "@deepseek-ai/dsh-tools";
import {stripEmoji,stripWechatCodes} from "./emoji.js";
import {sendMessageWeixin,sendImageMessageWeixin} from "./ilink/messaging/send.js";
import {uploadFileToWeixin} from "./ilink/cdn/upload.js";
import sharp from "sharp";
import {ProactiveEngine,type ShareDraft} from "./clawbot-proactive-engine.js";
import {buildOpportunityPrompt,buildProactiveGuidance,canonicalSource,type ShareKind} from "./clawbot-proactive-policy.js";
import {readPublic,pageImage,pageExcerpt} from "./clawbot-proactive-media.js";
declare module "@deepseek-ai/dsh-llm" {interface MessageSourceMap {"plugin:clawbot-proactive":{kind:"plugin:clawbot-proactive"};}}
type Dependencies={getBridge:()=>WechatBridge|null;getAccount:()=>ResolvedWeixinAccount|null};
type PreparedImage={path:string;sourceUrl:string;viewable:boolean};
const ALLOWED=new Set(["web_search","web_fetch","memos_search","memos_get","memos_timeline","memos_environment","memos_skill_list","memos_skill_get","look_at_image","clawbot_prepare_share_image","clawbot_share","clawbot_skip_share","run_code"]);
type JsonValue=null|string|boolean|number|JsonValue[]|{[key:string]:JsonValue};
const JSON_OUTPUT={schema:{type:"object" as const,additionalProperties:false,properties:{ok:{type:"boolean" as const,required:true as const},message:{type:"string" as const},sourceUrl:{type:"string" as const}}},render:(_args:unknown,value:Record<string,unknown>)=>[{type:"text" as const,text:JSON.stringify(value)}]};
export function registerProactive(ctx:Context,config:ClawbotConfig,deps:Dependencies):void {
  const key=createHash("sha256").update(config.sessionId).digest("hex").slice(0,16);
  const home=path.join(process.env.DSH_HOME||path.join(os.homedir(),".dsh"),"clawbot","proactive",key);
  const statePath=path.join(home,"state.json"),mediaDir=path.join(home,"media");
  let stopped=false,running=false,timer:ReturnType<typeof setTimeout>|undefined;
  let writeChain=Promise.resolve();const images=new Map<string,PreparedImage>();
  const sessionOf=(agent:unknown)=>(agent as {session?:{id?:unknown}}|undefined)?.session?.id;
  const belongs=(agent:unknown)=>sessionOf(agent)===config.sessionId;
  const requireActive=(agent:unknown)=>{if(!belongs(agent)||!engine.active()||!config.proactiveEnabled)throw Error("This tool requires the current WeChat proactive opportunity");};
  const available=()=>{
    const account=deps.getAccount(),bridge=deps.getBridge();
    if(!account?.configured||!account.userId||!bridge)return {ready:false,reason:"微信连接未就绪"};
    if(config.allowFrom.length&&!config.allowFrom.includes(account.userId))return {ready:false,reason:"绑定用户不在发件人白名单中"};
    if(!bridge.contextTokenFor(account.userId))return {ready:false,reason:"请先给 Bot 发一条微信，建立发送上下文"};
    if(!engine.active()&&!bridge.canStartProactive())return {ready:false,reason:"当前会话忙，暂不打扰"};
    if(engine.active()&&bridge.activeSender&&bridge.activeSender!==account.userId)return {ready:false,reason:"正在处理另一位联系人的消息"};
    return {ready:true,reason:""};
  };
  const assertDelivery=()=>{if(stopped||!engine.active()||!config.proactiveEnabled||!available().ready)throw Error("Proactive delivery paused");};
  const engine=new ProactiveEngine(config,{
    now:Date.now,random:Math.random,available,
    save:state=>{
      const save=writeChain.then(async()=>{await fs.mkdir(home,{recursive:true});const temp=statePath+"."+randomUUID()+".tmp";await fs.writeFile(temp,JSON.stringify(state,null,2));await fs.rename(temp,statePath);});
      writeChain=save.catch(()=>{});return save;
    },
    dispatch:async prompt=>{
      images.clear();const bridge=deps.getBridge(),owner=deps.getAccount()?.userId;
      if(!bridge||!owner)return false;running=true;
      try{const accepted=await bridge.enqueueProactive(owner,prompt);await engine.ended();return accepted;}
      finally{running=false;}
    },
    deliver:async(draft:ShareDraft)=>{
      assertDelivery();const account=deps.getAccount()!,bridge=deps.getBridge()!,owner=account.userId!;
      if(draft.sourceUrl&&!draft.imageId)await readPublic(draft.sourceUrl,1500000);
      assertDelivery();
      const raw=draft.text+(draft.includeLink&&draft.sourceUrl?"\n"+draft.sourceUrl:"");
      const text=config.stripEmoji?stripEmoji(raw):stripWechatCodes(raw);
      if(draft.imageId){
        const image=images.get(draft.imageId);
        if(!config.proactiveImages||!image?.viewable||image.sourceUrl!==draft.sourceUrl)throw Error("Image was not prepared and viewed for this source");
        const uploaded=await uploadFileToWeixin({filePath:image.path,toUserId:owner,opts:{baseUrl:account.baseUrl,token:account.token},cdnBaseUrl:account.cdnBaseUrl});
        assertDelivery();
        await sendImageMessageWeixin({to:owner,text,uploaded,opts:{baseUrl:account.baseUrl,token:account.token,contextToken:bridge.contextTokenFor(owner),timeoutMs:15000}});
      }else await sendMessageWeixin({to:owner,text,opts:{baseUrl:account.baseUrl,token:account.token,contextToken:bridge.contextTokenFor(owner),timeoutMs:15000}});
      bridge.noteDelivered(owner);
    },
  });
  const arm=()=>{
    if(timer)clearTimeout(timer);timer=undefined;
    if(stopped||!config.proactiveEnabled)return;
    if(engine.lastReason==="尚未开启")engine.lastReason="等待随机分享机会";
    timer=setTimeout(()=>{void engine.tick().catch(()=>{engine.lastReason="本次评估失败，稍后再考虑";ctx.logger.warn("主动互动评估失败，不重发本次分享。");}).finally(arm);},Math.max(1000,Math.min(2147483647,engine.state.nextAt-Date.now())));
    timer.unref?.();
  };
  const ready=(async()=>{
    let saved:unknown;try{saved=JSON.parse(await fs.readFile(statePath,"utf8"));}catch{}
    await engine.restore(saved);
    // Recover only metadata timestamps from the existing bot session, not transcript contents.
    const session=ctx.agents.get(SessionId(config.sessionId))?.session;
    if(session){for(const event of session.snapshotEvents())if(event.type==="user/message"&&String(event.data.source.kind)==="plugin:wechat-clawbot")engine.state.lastHumanAt=Math.max(engine.state.lastHumanAt,event.time);}
    await engine.persist();arm();
  })().catch(error=>{engine.lastReason="主动互动初始化失败";const code=(error as {code?:unknown})?.code;ctx.logger.warn(engine.lastReason+(typeof code==="string"?" ("+code+")":""));});
  ctx.effect(()=>async()=>{stopped=true;if(timer)clearTimeout(timer);await ready;await writeChain;});
  (ctx.on as unknown as (name:string,fn:()=>void)=>()=>void)("loader/volatile-update",()=>{
    void ready.then(async()=>{if(!config.proactiveEnabled&&engine.active())await engine.skip("已关闭主动互动");await engine.reschedule();arm();});
  });
  ctx.on("session/event",(session,event)=>{
    if(session.id!==config.sessionId)return;
    if(event.type==="user/message"&&["plugin:wechat-clawbot","user"].includes(event.data.source.kind)){
      running=false;void ready.then(()=>engine.human(event.time)).catch(()=>{});
    }
    if(event.type==="turn/end")void ready.then(()=>engine.ended()).catch(()=>{});
  });
  ctx.systemPrompt.section({name:"clawbot-proactive-style",order:82,text:context=>belongs(context.agent)?buildProactiveGuidance(config):""});
  const installed=new WeakSet<object>();const registrations:Array<()=>void>=[];
  const mount=(agent:Agent)=>{
    if(!belongs(agent)||installed.has(agent))return;installed.add(agent);
    registrations.push(agent.ctx.tools.guard(exec=>running&&belongs(exec.agent)&&!ALLOWED.has(exec.name)?"主动模式仅允许读取公开资料与记忆；请用 clawbot_share 投递或 clawbot_skip_share 跳过。":undefined));
    registrations.push(agent.ctx.tools.register(defineTool({
      name:"clawbot_skip_share",description:"Quietly skip the current optional proactive opportunity; sends no WeChat message.",
      parameters:{reason:{type:"string",required:true}},output:JSON_OUTPUT,isConcurrencySafe:()=>false,
      async execute(args,exec){requireActive(exec.agent);await engine.skip(String(args.reason).slice(0,180));return {ok:true,message:"本次跳过，未发送微信"};},
    })));
    registrations.push(agent.ctx.tools.register(defineTool({
      name:"clawbot_share",description:"Send one complete personal share to the bound owner, optionally with a previously prepared real image. Enforces deduplication and limits; do not also use send_wechat_text/file.",
      parameters:{title:{type:"string",required:true},text:{type:"string",required:true},sourceUrl:{type:"string"},imageId:{type:"string"},includeLink:{type:"boolean"}},output:JSON_OUTPUT,isConcurrencySafe:()=>false,
      async execute(args,exec){requireActive(exec.agent);if(exec.signal.aborted)throw Error("Cancelled");return engine.share(args as unknown as ShareDraft);},
    })));
    registrations.push(agent.ctx.tools.register(defineTool({
      name:"clawbot_prepare_share_image",description:"Fetch a public article's actual photo/chart and show it to you. pageUrl is the source article; optional imageUrl must appear on that page. Never passes through private files.",
      parameters:{pageUrl:{type:"string",required:true},imageUrl:{type:"string"}},
      output:{schema:{type:"object",additionalProperties:true,properties:{ok:{type:"boolean",required:true},text:{type:"string",required:true}}},render:(_args,value)=>{
        const content:Array<{type:"text";text:string}|{type:"image";attachment:never}>=[{type:"text",text:String(value.text)}];
        if(value.image)content.push({type:"image",attachment:value.image as never});return content;
      }},isConcurrencySafe:()=>false,
      async execute(args,exec):Promise<{ok:boolean;text:string}&Record<string,JsonValue>>{
        requireActive(exec.agent);if(!config.proactiveImages)throw Error("Images disabled");
        const pageUrl=canonicalSource(String(args.pageUrl)),page=await readPublic(pageUrl,1500000);
        const html=page.data.toString("utf8"),imageUrl=pageImage(html,page.url,typeof args.imageUrl==="string"?args.imageUrl:undefined);
        if(!imageUrl)return {ok:false,text:"原文没有合适的可下载图片，可选择纯文字或跳过。"};
        const image=await readPublic(imageUrl,8*1024*1024);
        if(!/^image\/(jpeg|png|webp|gif)/i.test(image.contentType))throw Error("Unsupported image format");
        const bytes=await sharp(image.data,{limitInputPixels:24000000}).rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
        if(bytes.length>2500000)throw Error("Picture remains too large");
        requireActive(exec.agent);if(exec.signal.aborted)throw Error("Cancelled");
        await fs.mkdir(mediaDir,{recursive:true});const id=randomUUID(),file=path.join(mediaDir,id+".jpg");await fs.writeFile(file,bytes);
        const bridge=deps.getBridge();const ref=bridge&&await bridge.routeTakesImages()?await bridge.attachImage(file,"clawbot_prepare_share_image"):null;
        images.set(id,{path:file,sourceUrl:pageUrl,viewable:Boolean(ref)});
        // Bounded task-owned cache only; never enumerate or delete arbitrary local files.
        const old=(await fs.readdir(mediaDir)).filter(name=>/^[0-9a-f-]{36}\.jpg$/.test(name));
        if(old.length>30){const rows=await Promise.all(old.map(async name=>({name,mtime:(await fs.stat(path.join(mediaDir,name))).mtimeMs})));for(const row of rows.sort((a,b)=>b.mtime-a.mtime).slice(30))if(![...images.values()].some(v=>path.basename(v.path)===row.name))await fs.unlink(path.join(mediaDir,row.name));}
        const result:{ok:boolean;text:string}&Record<string,JsonValue>={ok:Boolean(ref),text:JSON.stringify({imageId:id,sourceUrl:pageUrl,sourceExcerpt:pageExcerpt(html),instruction:ref?"图片已附在工具结果里；确认内容相关后可用 imageId 分享。":"当前模型无法直接看此图片，不要带 imageId 发送；可选择纯文字。"})};
        if(ref)result.image=JSON.parse(JSON.stringify(ref)) as JsonValue;
        return result;
      },
    })));
  };
  for(const agent of ctx.agents.list())mount(agent);
  ctx.on("agent/created",({agent})=>{mount(agent);return undefined;});
  ctx.effect(()=>()=>{for(const remove of registrations.splice(0).reverse())remove();});
  ctx.inject(["webServer","connection"],child=>{
    const services=child as unknown as {webServer:{register(route:{kind:"exact";path:string;handler(req:IncomingMessage,res:ServerResponse):Promise<void>}):()=>void};connection:{requestRejection(req:IncomingMessage):401|403|undefined}};
    child.effect(()=>services.webServer.register({kind:"exact",path:"/plugins/clawbot/proactive",async handler(req,res){
      const send=(code:number,value:unknown)=>{res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(value));};
      const rejected=services.connection.requestRejection(req);if(rejected!==undefined){send(rejected,{ok:false});return;}
      await ready;
      if(req.method==="GET"){
        const actual=engine.effective();
        send(200,{ok:true,enabled:config.proactiveEnabled,nextAt:config.proactiveEnabled?engine.state.nextAt:null,reason:engine.lastReason,phase:actual===config?"regular":"exploration",exploreEndsAt:config.proactiveExploreDays&&engine.state.startedAt?engine.state.startedAt+config.proactiveExploreDays*86400000:null,minMinutes:actual.proactiveMinMinutes,maxMinutes:actual.proactiveMaxMinutes,dailyLimit:actual.proactiveDailyLimit,history:engine.state.history.slice(-15).reverse()});return;
      }
      if(req.method!=="POST"){send(405,{ok:false});return;}
      if(req.headers["x-clawbot-proactive-action"]!=="preview"){send(403,{ok:false});return;}
      // Rule preview only: no model request, no timer dispatch and no WeChat send.
      const kind:ShareKind=config.proactiveIndustry&&config.proactiveTopics?"industry":config.proactiveNearby&&config.proactivePlace?"nearby":"chat";
      send(200,{ok:true,rules:buildProactiveGuidance({...config,proactiveEnabled:true}),opportunity:buildOpportunityPrompt(kind,config,Date.now(),engine.state.history.filter(r=>r.status==="sent"))});
    }}));
  });
}

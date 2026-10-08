import type { Context } from "@deepseek-ai/cordis";
import type { ClawbotConfig } from "./config.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { isClawbotMemorySession } from "./clawbot-memory-scope.js";

type Trace = {id: string; summary?: string | null; userText: string; agentText: string; ts: number};
type Core = {
  health(): Promise<{ok: boolean; embedder: {available: boolean; provider: string; model: string}}>;
  countTraces(): Promise<number>;
  listTraces(args: {limit: number}): Promise<Trace[]>;
  deleteTrace(id: string): Promise<{deleted: boolean}>;
};
type Adapter = {apply(ctx: Context, config: Record<string, unknown>): Promise<() => Promise<void>>};
type Request = AsyncIterable<Uint8Array> & {method?: string; headers: Record<string,string|undefined>};
type Response = {writeHead(code: number, headers: Record<string,string>): void; end(body: string): void};

/** Embedded in clawbot; no second bundle, global memory tools, or independent daemon. */
export function registerClawbotMemory(ctx: Context, config: ClawbotConfig): void {
  let core: Core | undefined;
  let state = "initializing";
  let startupError = "";
  let stopped = false;
  let dispose: (()=>Promise<void>) | undefined;
  const key=createHash("sha256").update(config.sessionId).digest("hex").slice(0,16);
  const home=path.join(process.env.DSH_HOME || path.join(os.homedir(),".dsh"),"clawbot","memos",key);
  const allows=(session: unknown)=>isClawbotMemorySession(session,config.sessionId);
  const ready=new Promise<void>(resolve=>{
    ctx.inject(["llm"],child=>{
      const startup=(async()=>{
        await fs.mkdir(home,{recursive:true});
        const configFile=path.join(home,"config.yaml");
        await fs.writeFile(configFile,[
          "version: 1", "embedding:", "  provider: local", "  model: Xenova/paraphrase-multilingual-MiniLM-L12-v2",
          "llm:", "  provider: host", "  maxRetries: 0", "  timeoutMs: 15000",
          "hub:", "  enabled: false", "telemetry:", "  enabled: false", "algorithm:",
          "  lightweightMemory:", "    enabled: true", "  retrieval:", "    llmFilterEnabled: false", "",
        ].join("\n"),{flag:"wx"}).catch((error: NodeJS.ErrnoException)=>{if(error.code!=="EEXIST")throw error;});
        const spec="./memos/adapters/deepseek-harness/index.js";
        const adapter=await import(spec) as Adapter;
        dispose=await adapter.apply(child,{
          enabled:true,profileId:"clawbot-"+key,home,
          recallEnabled:true,captureEnabled:true,toolsEnabled:true,hostLlmEnabled:true,
          viewerEnabled:false,viewerPort:18801,recallTimeoutMs:1500,
          contextMaxChars:4000,toolResultMaxChars:1500,failOnStartupError:true,
          allowSession:allows,active:()=>config.memosEnabled,
          recallActive:()=>config.memosEnabled && config.memosRecall,
          captureActive:()=>config.memosEnabled && config.memosCapture,
          onReady:(value: Core)=>{core=value;state="ready";},
        });
        if(stopped){core=undefined;await dispose();dispose=undefined;}
      })().catch(()=>{state="failed";startupError="MemOS 初始化失败；请检查本机依赖和 DSH 日志。";ctx.logger.warn(startupError);});
      child.effect(()=>async()=>{stopped=true;await startup;core=undefined;await dispose?.();dispose=undefined;});
      void startup.finally(resolve);
    });
  });
  // Raw webServer routes do not authenticate; explicitly use the DSH trust fence.
  ctx.inject(["webServer","connection"],child=>{
    const services=child as unknown as {
      webServer:{register(route: {kind:"exact";path:string;handler(req:Request,res:Response):Promise<void>}):()=>void};
      connection:{requestRejection(req:Request):401|403|undefined};
    };
    const server=services.webServer;
    child.effect(()=>server.register({kind:"exact",path:"/plugins/clawbot/memory",async handler(req,res){
      const send=(code:number,value:unknown)=>{res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(value));};
      const rejection=services.connection.requestRejection(req);
      if(rejection!==undefined){send(rejection,{ok:false,error:"Authentication required"});return;}
      if(req.method==="GET"){
        try{
          const total=core?await core.countTraces():0;
          const records=core?await core.listTraces({limit:30}):[];
          send(200,{ok:true,state,enabled:config.memosEnabled,recall:config.memosRecall,capture:config.memosCapture,
            scope:"当前 clawbot 微信主会话",total,error:startupError,records:records.map(row=>({id:row.id,summary:row.summary||row.userText.slice(0,200),ts:row.ts}))});
        }catch{send(503,{ok:false,error:"暂时无法读取记忆；请稍后刷新。"});}
        return;
      }
      if(req.method!=="POST"){send(405,{ok:false,error:"Method not allowed"});return;}
      if(req.headers["x-clawbot-memory-action"]!=="delete"){send(403,{ok:false,error:"Missing action header"});return;}
      const origin=req.headers.origin;
      if(origin){try{if(new URL(origin).host!==req.headers.host){send(403,{ok:false,error:"Origin rejected"});return;}}catch{send(403,{ok:false,error:"Origin rejected"});return;}}
      if(!core){send(503,{ok:false,error:"MemOS 尚未就绪"});return;}
      try{
        let body="";for await(const chunk of req){body+=Buffer.from(chunk).toString("utf8");if(Buffer.byteLength(body)>2048){send(413,{ok:false,error:"Request too large"});return;}}
        const payload=JSON.parse(body) as {id?:unknown};
        if(typeof payload.id!=="string"||!payload.id||payload.id.length>150){send(400,{ok:false,error:"Invalid record id"});return;}
        send(200,{ok:true,...await core.deleteTrace(payload.id)});
      }catch{send(400,{ok:false,error:"删除未完成，请刷新后重试。"});}
    }}));
  });
  // Retained to make the optional injection lifecycle explicit; startup does not block clawbot.
  void ready;
}

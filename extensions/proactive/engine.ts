import {randomUUID,createHash} from "node:crypto";
import {localDay,inWindow,nextOpportunity,canonicalSource,buildOpportunityPrompt,buildContentExperiencePrompt,effectiveProactive,type ProactiveConfig,type ShareKind} from "./clawbot-proactive-policy.js";
export type ShareRecord={id:string;at:number;kind:ShareKind;status:"evaluating"|"sent"|"skipped"|"failed"|"abandoned";title:string;sourceUrl?:string;fingerprint?:string;reason?:string;testRunId?:string;testDeadlineAt?:number};
export type ProactiveState={version:1;nextAt:number;lastHumanAt:number;startedAt:number;history:ShareRecord[]};
export type ShareDraft={title:string;text:string;sourceUrl?:string;imageId?:string;includeLink?:boolean};
export type EngineDeps={now:()=>number;random:()=>number;save:(s:ProactiveState)=>Promise<void>;
  available:()=>{ready:boolean;reason:string};dispatch:(prompt:string)=>Promise<boolean>;deliver:(draft:ShareDraft)=>Promise<void>};
export type OpportunityStatus={ready:boolean;blockCode:string|null;reason:string;lastHumanAt:number;todaySent:number;todayFailed:number;todaySkipped:number;todayEvaluations:number;evaluationsSinceReply:number;evaluationLimit:number;replyEvaluationLimit:number;dailyLimit:number};
export class ProactiveEngine {
  state:ProactiveState={version:1,nextAt:0,lastHumanAt:0,startedAt:0,history:[]};
  lastReason="尚未开启";
  private activeId:string|undefined;private claimed=false;private busy=false;
  constructor(readonly config:ProactiveConfig,readonly deps:EngineDeps){}
  async restore(input:unknown):Promise<void>{
    const s=input as Partial<ProactiveState>|undefined;
    if(s?.version===1&&Array.isArray(s.history)){
      this.state={version:1,nextAt:typeof s.nextAt==="number"&&Number.isFinite(s.nextAt)?s.nextAt:0,
        lastHumanAt:typeof s.lastHumanAt==="number"&&Number.isFinite(s.lastHumanAt)?s.lastHumanAt:0,
        startedAt:typeof s.startedAt==="number"&&Number.isFinite(s.startedAt)&&s.startedAt>0?s.startedAt:0,
        history:s.history.filter(r=>typeof r?.id==="string"&&typeof r.at==="number"&&Number.isFinite(r.at)&&typeof r.title==="string"&&["industry","nearby","chat"].includes(r.kind)&&["evaluating","sent","skipped","failed","abandoned"].includes(r.status)).slice(-60).map(r=>{
          let sourceUrl:string|undefined;try{sourceUrl=r.sourceUrl?canonicalSource(r.sourceUrl):undefined;}catch{}
          return {...r,sourceUrl,status:r.status==="evaluating"?"abandoned":r.status};
        })};
    }
    this.beginExploration();
    if(this.state.nextAt<=this.deps.now())this.state.nextAt=nextOpportunity(this.deps.now(),this.effective(),this.deps.random);
    await this.persist();
  }
  async persist():Promise<void>{await this.deps.save(structuredClone(this.state));}
  active():boolean{return this.activeId!==undefined;}
  currentTestId():string|undefined{return this.state.history.find(r=>r.id===this.activeId)?.testRunId;}
  effective():ProactiveConfig{return effectiveProactive(this.config,this.state.startedAt,this.deps.now());}
  private beginExploration():void{if(this.config.proactiveEnabled&&this.config.proactiveExploreDays&&!this.state.startedAt)this.state.startedAt=this.deps.now();}
  kind():ShareKind|undefined{return this.state.history.find(r=>r.id===this.activeId)?.kind;}
  async human(at:number):Promise<void>{
    this.state.lastHumanAt=Math.max(this.state.lastHumanAt,at);
    if(this.activeId&&!this.claimed)await this.skip("用户正在聊天，取消本次主动机会");
    else if(this.claimed)this.activeId=undefined;
    await this.persist();
  }
  async reschedule():Promise<void>{this.beginExploration();this.state.nextAt=nextOpportunity(this.deps.now(),this.effective(),this.deps.random);await this.persist();}
  status(now=this.deps.now()):OpportunityStatus {
    const c=this.effective(),today=this.state.history.filter(r=>!r.testRunId&&localDay(r.at)===localDay(now));
    const sent=today.filter(r=>r.status==="sent"),failed=today.filter(r=>r.status==="failed");
    // A fresh real conversation can restore a bounded assessment budget after
    // repeated skips. Keep an absolute daily limit so chatting cannot cause
    // unbounded paid model evaluations; delivery limits remain independent.
    const replyEvaluationLimit=c.proactiveDailyLimit+2,evaluationLimit=replyEvaluationLimit*2;
    const value:OpportunityStatus={ready:false,blockCode:null,reason:"",lastHumanAt:this.state.lastHumanAt,todaySent:sent.length,todayFailed:failed.length,todaySkipped:today.filter(r=>["skipped","abandoned"].includes(r.status)).length,todayEvaluations:today.length,evaluationsSinceReply:today.filter(r=>r.at>this.state.lastHumanAt).length,evaluationLimit,replyEvaluationLimit,dailyLimit:c.proactiveDailyLimit};
    const blocked=(code:string,reason:string)=>({...value,blockCode:code,reason});
    if(!this.config.proactiveEnabled)return blocked("disabled","尚未开启");
    if(!inWindow(now,this.config))return blocked("quiet","免打扰时段");
    if(this.active())return blocked("active","正在挑选值得分享的内容");
    const readiness=this.deps.available();if(!readiness.ready)return blocked("unavailable",readiness.reason);
    if(!this.state.lastHumanAt)return blocked("no-human","等待首次真实微信聊天");
    if(now-this.state.lastHumanAt<this.config.proactiveIdleMinutes*60000)return blocked("recent-chat","近期正在聊天，稍后再考虑");
    if(sent.length+failed.length>=c.proactiveDailyLimit)return blocked("delivery-limit","今日主动分享已达上限");
    if(sent.some(r=>r.at>this.state.lastHumanAt))return blocked("unanswered","上次随机分享尚未收到新的来信，今天先不继续打扰");
    if(today.length>=evaluationLimit)return blocked("evaluation-limit","今日评估次数已达总上限");
    if(value.evaluationsSinceReply>=replyEvaluationLimit)return blocked("reply-evaluation-limit","连续评估已达上限，收到新的微信来信后再考虑");
    if(!(this.config.proactiveIndustry&&this.config.proactiveTopics||this.config.proactiveNearby&&this.config.proactivePlace||this.config.proactiveChat))return blocked("no-topics","请设置分享主题或开启闲聊");
    return {...value,ready:true,reason:"等待随机分享机会"};
  }
  async tick():Promise<void>{
    if(this.busy)return;this.busy=true;
    try{
      const now=this.deps.now();
      if(this.activeId){const r=this.state.history.find(r=>r.id===this.activeId);if(r&&now-r.at>20*60000)await this.skip("本次评估超时，不重发");}
      await this.reschedule();
      const status=this.status(now);if(!status.ready){this.lastReason=status.reason;return;}
      const kinds:ShareKind[]=[];
      if(this.config.proactiveIndustry&&this.config.proactiveTopics)kinds.push("industry");
      if(this.config.proactiveNearby&&this.config.proactivePlace)kinds.push("nearby");
      if(this.config.proactiveChat)kinds.push("chat");
      if(!kinds.length){this.lastReason="请设置分享主题或开启闲聊";return;}
      const kind=kinds[Math.min(kinds.length-1,Math.floor(Math.max(0,Math.min(1,this.deps.random()))*kinds.length))]!;
      const record:ShareRecord={id:randomUUID(),at:now,kind,status:"evaluating",title:""};
      this.state.history.push(record);this.state.history=this.state.history.slice(-60);this.activeId=record.id;this.claimed=false;
      await this.persist();this.lastReason="正在挑选值得分享的内容";
      if(!await this.deps.dispatch(buildOpportunityPrompt(kind,this.config,now,this.state.history.filter(r=>r.status==="sent"),status)))await this.skip("会话忙或连接不可用，本次跳过");
    }finally{this.busy=false;}
  }
  async contentExperience(id:string,index:number,deadlineAt:number):Promise<"sent"|"skipped"|"failed">{
    const now=this.deps.now();
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)||!Number.isInteger(index)||index<1||index>10||deadlineAt<=now||deadlineAt-now>3600000)throw Error("Invalid content experience");
    if(this.busy||this.active()||!this.config.proactiveEnabled||!this.deps.available().ready)return "skipped";
    this.busy=true;
    const kind:ShareKind=[3,7].includes(index)?"nearby":"industry";
    const record:ShareRecord={id:randomUUID(),at:now,kind,status:"evaluating",title:"",testRunId:id,testDeadlineAt:deadlineAt};
    this.state.history.push(record);this.state.history=this.state.history.slice(-60);this.activeId=record.id;this.claimed=false;
    try{
      await this.persist();this.lastReason="正在挑选真实分享内容";
      const prompt=buildContentExperiencePrompt(index,this.config,now,deadlineAt,this.state.history.filter(r=>r.status==="sent"));
      if(!await this.deps.dispatch(prompt))await this.skip("会话忙，本次内容体验跳过");
      await this.ended();return record.status==="sent"?"sent":record.status==="failed"?"failed":"skipped";
    }catch{if(record.status==="evaluating")await this.skip("本次选题失败，未投递内容");return record.status==="failed"?"failed":"skipped";}
    finally{this.busy=false;}
  }
  async skip(reason:string):Promise<void>{
    const record=this.state.history.find(r=>r.id===this.activeId);
    if(record&&record.status==="evaluating"){record.status="skipped";record.reason=reason.slice(0,180);}
    this.activeId=undefined;this.claimed=false;this.lastReason=reason;await this.persist();
  }
  async ended():Promise<void>{if(this.activeId&&!this.claimed)await this.skip("没有找到值得投递的内容");}
  async share(draft:ShareDraft):Promise<{ok:true;sourceUrl?:string}>{
    const record=this.state.history.find(r=>r.id===this.activeId);
    if(!record||record.status!=="evaluating"||this.claimed)throw Error("No active sharing opportunity");
    if(!this.config.proactiveEnabled||(!record.testRunId&&!inWindow(this.deps.now(),this.config))||(record.testDeadlineAt!==undefined&&this.deps.now()>=record.testDeadlineAt)||!this.deps.available().ready)throw Error("Sharing is paused or unavailable");
    const text=draft.text.trim();if(text.length>700||text.replace(/https?:\/\/\S+/g,"").trim().length<8)throw Error("Share a real short comment, not a bare link");
    if(!draft.title.trim()||draft.title.length>120)throw Error("A concise topic title is required");
    const sourceUrl=draft.sourceUrl?canonicalSource(draft.sourceUrl):undefined;
    if(record.kind!=="chat"&&!sourceUrl)throw Error("News and nearby recommendations require a verified source");
    const fingerprint=createHash("sha256").update(sourceUrl??text.replace(/\s+/g,"")).digest("hex");
    if(this.state.history.some(r=>r.id!==record.id&&r.fingerprint===fingerprint&&["sent","failed"].includes(r.status)))throw Error("This content was already shared or attempted");
    // Reserve durably before network I/O. A timeout may mean delivered: never auto-retry it.
    this.claimed=true;record.title=draft.title.trim();record.sourceUrl=sourceUrl;record.fingerprint=fingerprint;record.status="failed";record.reason="投递未确认；不会自动重发";
    try{
      await this.persist();
      await this.deps.deliver({...draft,text,sourceUrl});record.status="sent";record.reason=undefined;this.lastReason="已分享";
      await this.persist();return {ok:true,...sourceUrl?{sourceUrl}:{}};
    }catch{this.lastReason="投递未确认，可能是连接或微信凭证问题；不会自动重发";await this.persist();throw Error(this.lastReason);}
    finally{this.activeId=undefined;this.claimed=false;}
  }
}

export type TestAttempt={index:number;dueAt:number;status:"planned"|"sending"|"sent"|"uncertain"|"skipped"|"missed"|"cancelled";sentAt?:number};
export type SendTestState={version:1;id:string;ownerHash:string;startedAt:number;deadlineAt:number;mode?:"content"|"transport";status:"running"|"complete"|"cancelled";attempts:TestAttempt[]};
type Deps={now:()=>number;random:()=>number;save:(state:SendTestState)=>Promise<void>;send:(text:string,ownerHash:string,attempt:TestAttempt,state:SendTestState)=>Promise<void|"sent"|"skipped"|"failed">;changed:()=>void};
/** One explicitly requested, finite ten-message test. Never replays uncertain I/O. */
export class RandomSendTest {
  state:SendTestState|undefined;private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;private work:Promise<void>|undefined;
  constructor(readonly deps:Deps){}
  active():boolean{return this.state?.status==="running"&&this.deps.now()<this.state.deadlineAt;}
  view(){if(!this.state)return null;const {ownerHash,...state}=structuredClone(this.state);return {...state,sent:state.attempts.filter(a=>a.status==="sent").length,uncertain:state.attempts.filter(a=>a.status==="uncertain").length};}
  async restore(raw:unknown){
    const s=raw as SendTestState|undefined;
    if(!s)return;
    if(s.version!==1||!this.validId(s.id)||!/^[a-f0-9]{64}$/.test(s.ownerHash)||!Number.isFinite(s.startedAt)||!Number.isFinite(s.deadlineAt)||s.deadlineAt<=s.startedAt||s.deadlineAt-s.startedAt>3600000||!["running","complete","cancelled"].includes(s.status)||s.attempts?.length!==10)throw Error("Invalid send-test state");
    for(const [i,a] of s.attempts.entries())if(a.index!==i+1||!Number.isFinite(a.dueAt)||a.dueAt<s.startedAt||a.dueAt>=s.deadlineAt||!["planned","sending","sent","uncertain","skipped","missed","cancelled"].includes(a.status))throw Error("Invalid send-test attempt");
    this.state=structuredClone(s);
    for(const a of this.state.attempts){if(a.status==="sending")a.status="uncertain";else if(a.status==="planned"&&a.dueAt<this.deps.now())a.status="missed";}
    this.finish();await this.save();this.arm();
  }
  private validId(id:string){return typeof id==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);}
  async start(id:string,deadlineAt:number,ownerHash:string,mode:"content"|"transport"="content"){
    if(!this.validId(id)||!/^[a-f0-9]{64}$/.test(ownerHash))throw Error("Invalid test identity");
    if(this.state?.id===id){if(this.state.ownerHash!==ownerHash)throw Error("Test owner changed");return this.view();}
    if(this.active()||this.work)throw Error("A send test is already running");
    const now=this.deps.now();if(!Number.isFinite(deadlineAt)||deadlineAt-now<600000||deadlineAt-now>3600000)throw Error("Test deadline must be ten minutes to one hour away");
    const bin=(deadlineAt-now-60000)/10,unit=()=>Math.max(0,Math.min(1,this.deps.random()));
    this.state={version:1,id,ownerHash,startedAt:now,deadlineAt,mode,status:"running",attempts:Array.from({length:10},(_,i)=>({index:i+1,dueAt:Math.round(now+(i===0?5000+unit()*20000:i*bin+(0.15+unit()*0.7)*bin)),status:"planned"}))};
    await this.save();this.arm();this.deps.changed();return this.view();
  }
  private async save(){if(this.state)await this.deps.save(structuredClone(this.state));}
  private finish(){if(!this.state||this.state.status!=="running")return;if(this.deps.now()>=this.state.deadlineAt)for(const a of this.state.attempts)if(a.status==="planned")a.status="missed";if(this.state.attempts.every(a=>a.status!=="planned"&&a.status!=="sending"))this.state.status="complete";}
  private arm(){
    if(this.timer)clearTimeout(this.timer);this.timer=undefined;
    if(this.stopped||this.state?.status!=="running")return;
    const due=this.state.attempts.find(a=>a.status==="planned")?.dueAt??this.state.deadlineAt;
    this.timer=setTimeout(()=>{void this.tick().catch(()=>{});},Math.max(1000,Math.min(due,this.state.deadlineAt)-this.deps.now()));this.timer.unref?.();
  }
  async tick(){
    if(this.stopped||this.work||!this.state||this.state.status!=="running")return;
    this.work=this.run();try{await this.work;}finally{this.work=undefined;this.arm();this.deps.changed();}
  }
  private async run(){
    this.finish();if(!this.active()){await this.save();return;}
    const state=this.state!,a=state.attempts.find(row=>row.status==="planned");if(!a||a.dueAt>this.deps.now())return;
    if(this.deps.now()-a.dueAt>90000){a.status="missed";this.finish();await this.save();return;}
    a.status="sending";
    try{
      await this.save();if(this.stopped||state.status!=="running"||this.deps.now()>=state.deadlineAt){a.status="cancelled";return;}
      const time=new Date(this.deps.now()).toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
      const outcome=await this.deps.send(state.mode==="content"?"":`随机主动消息测试 ${a.index}/10 · ${time}\n这一条是你要求的发送测试，不用回复；这一轮测试结束后会恢复日常节奏。`,state.ownerHash,a,state);
      a.status=outcome==="skipped"?"skipped":outcome==="failed"?"uncertain":"sent";if(a.status==="sent")a.sentAt=this.deps.now();
    }catch{a.status="uncertain";}
    finally{this.finish();await this.save();}
  }
  async cancel(){if(this.state?.status!=="running")return;this.state.status="cancelled";for(const a of this.state.attempts)if(a.status==="planned")a.status="cancelled";if(this.timer)clearTimeout(this.timer);await this.save();this.deps.changed();}
  async dispose(){this.stopped=true;if(this.timer)clearTimeout(this.timer);await this.work;}
}

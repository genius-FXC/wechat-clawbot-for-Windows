function ProactiveFields({value:v,user,disabled,set,clear}) {
  const [status,setStatus]=useState(null),[error,setError]=useState(""),[preview,setPreview]=useState("");
  const commit=async(key,value)=>{try{await set(key,value);setError("");}catch{setError("设置未保存，请重试。");}};
  const refresh=async()=>{try{const r=await fetch("/plugins/clawbot/proactive",{credentials:"same-origin"}),s=await r.json();if(!r.ok||!s.ok)throw Error();setStatus(s);}catch{setError("主动互动状态暂不可用。");}};
  useEffect(()=>{void refresh();},[]);
  const field=(key,label,hint,control,inline)=>Field({label,hint,disabled,control,inline,overridden:Object.hasOwn(user,key),onReset:()=>{void clear(key).catch(()=>setError("设置未保存"));}});
  const toggle=(key,label,hint,fallback)=>field(key,label,hint,null,h(Switch,{label,disabled,on:typeof v[key]==="boolean"?v[key]:fallback,onChange:next=>{void commit(key,next);}}));
  const placeholders={proactiveTopics:"填写你真正关心的主题，留空不分享行业资讯",proactivePlace:"常用城市与商圈，留空不推荐附近吃喝",proactiveStart:"10:00",proactiveEnd:"21:30"};
  const text=(key,label,hint,limit)=>field(key,label,hint,h(PersonalityText,{value:v[key]||"",field:key,label,disabled,commit,limit,placeholder:placeholders[key],multiline:key==="proactiveTopics"}));
  const number=(key,label,hint,fallback,min,max)=>field(key,label,hint,h("input",{className:S.input,type:"number","aria-label":label,disabled,min,max,step:1,value:v[key]??fallback,onChange:event=>{const n=Number(event.target.value);if(Number.isFinite(n))void commit(key,n);}}));
  const showRules=async()=>{try{const r=await fetch("/plugins/clawbot/proactive",{method:"POST",credentials:"same-origin",headers:{"x-clawbot-proactive-action":"preview"}}),s=await r.json();if(!r.ok||!s.ok)throw Error();setPreview(s.rules+"\n\n"+s.opportunity);}catch{setError("规则暂无法读取，请重试。");}};
  const names={industry:"行业分享",nearby:"附近吃喝",chat:"自然闲聊"},states={evaluating:"挑选中",sent:"已分享",skipped:"跳过",failed:"投递未确认",abandoned:"重启后未重发"};
  return h("section",{"aria-label":"主动互动与真实分享",style:{border:"1px solid var(--dsw-alias-border-l2)",borderRadius:10,padding:16,marginBottom:20}},
    h("p",{className:S.label,style:{marginTop:0}},"主动互动与真实分享"),
    h("p",{className:S.hint},"在允许时段内随机出现机会，挑到值得分享的内容才发。第一人称短评，可配原文的真实图片；你正在聊天或未回应上次分享时会少打扰。"),
    toggle("proactiveEnabled","开启主动互动","仅向绑定的微信用户分享；电脑和 DSH 需要运行。",false),
    toggle("proactiveIndustry","行业资讯","先填写关注主题；检索失败或内容重复就跳过。",true),
    toggle("proactiveNearby","附近吃喝","使用下方常用地点，不会自动取得手机位置。",false),
    toggle("proactiveChat","自然接续旧话题","只用真实记忆和对话，没话题就安静跳过。",true),
    toggle("proactiveImages","优先分享图片","用原文里能说明问题的照片或图表，先看图再配短评；没有好图时不硬配。",true),
    text("proactiveTopics","关注行业与主题","例如：AI agent、科研进展、设计；填写你关心的方向。",600),
    text("proactivePlace","常用城市或地点","例如某城市的某商圈；留空不做附近推荐。",160),
    number("proactiveDailyLimit","常规每天最多分享","上限不是每天必须发满；没有回应时当天暂停继续分享。",2,1,5),
    number("proactiveExploreDays","起步探索期（天）","前期随机 45～90 分钟考虑一次、每天最多 4 份；没有回应仍会暂停。到期恢复下方常规频率，0 为关闭。",0,0,14),
    number("proactiveMinMinutes","随机机会最短间隔（分钟）","这是考虑分享的机会，不是固定发送时间。",90,30,720),
    number("proactiveMaxMinutes","随机机会最长间隔（分钟）","每轮重新抽取间隔，并避开免打扰时段。",240,30,720),
    text("proactiveStart","允许打扰：开始","Asia/Shanghai，填写 HH:mm。",5),
    text("proactiveEnd","允许打扰：结束","可跨午夜；区间外不会主动发送。",5),
    number("proactiveIdleMinutes","聊天后至少安静多久（分钟）","真实对话优先，避免你刚聊完就再来一条。",30,10,240),
    h("details",null,h("summary",{style:{cursor:"pointer"}},"查看规则与最近主动互动"),
      h("p",{className:S.hint},"随机评估会调用当前 DSH 模型与联网工具，消耗额度；每天评估次数也有限制。微信发送上下文过期时需要先发一条消息恢复。"),
      h("button",{type:"button",className:S.button,onClick:()=>{void refresh();}},"刷新状态"),
      h("button",{type:"button",className:S.button,onClick:()=>{void showRules();}},"查看分享规则（不发送）"),
      status?h("p",{className:S.hint,role:"status"},`${status.enabled?"已开启":"未开启"} · ${status.phase==="exploration"?"起步探索":"常规节奏"} · ${status.minMinutes}～${status.maxMinutes} 分钟随机考虑 · 每天最多 ${status.dailyLimit} 份 · ${status.reason}`):null,
      status?.nextAt?h("p",{className:S.hint},"下一次可能评估："+new Date(status.nextAt).toLocaleString()):null,
      preview?h("pre",{style:{whiteSpace:"pre-wrap",fontSize:12}},preview):null,
      status?.history?.length?h("ul",null,status.history.map(row=>h("li",{key:row.id},
        h("p",null,`${new Date(row.at).toLocaleString()} · ${names[row.kind]} · ${states[row.status]||row.status}`),
        row.title?h("p",null,row.title):null,row.reason?h("small",{className:S.hint},row.reason):null,
        row.sourceUrl?h("a",{href:row.sourceUrl,target:"_blank",rel:"noreferrer"},"查看来源"):null))):h("p",{className:S.hint},"暂无主动互动记录。")),
    error?h("p",{className:S.failed,role:"alert"},error):null);
}

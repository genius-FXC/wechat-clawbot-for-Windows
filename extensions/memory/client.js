function MemoryFields({value:v,user,disabled,set,clear}) {
  const [status,setStatus]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=async()=>{
    setBusy(true);setError("");
    try{const response=await fetch("/plugins/clawbot/memory",{credentials:"same-origin"});const result=await response.json();if(!response.ok||!result.ok)throw Error();setStatus(result);}
    catch{setError("记忆服务暂时不可用，请稍后刷新。");}finally{setBusy(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const toggle=(key,label,hint,defaultValue)=>Field({label,hint,disabled,
    overridden:Object.hasOwn(user,key),onReset:()=>{void clear(key).catch(()=>setError("设置未保存"));},
    control:null,inline:h(Switch,{label,disabled,on:typeof v[key]==="boolean"?v[key]:defaultValue,
      onChange:next=>{void set(key,next).catch(()=>setError("设置未保存，请重试。"));}})});
  const remove=async(id)=>{
    setBusy(true);setError("");
    try{const response=await fetch("/plugins/clawbot/memory",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-clawbot-memory-action":"delete"},body:JSON.stringify({id})});const result=await response.json();if(!response.ok||!result.ok||!result.deleted)throw Error();await refresh();}
    catch{setError("这条记录未能删除，请刷新后重试。");}finally{setBusy(false);}
  };
  return h("section",{"aria-label":"微信长期记忆",style:{border:"1px solid var(--dsw-alias-border-l2)",borderRadius:10,padding:16,marginBottom:20}},
    h("p",{className:S.label,style:{marginTop:0}},"微信长期记忆 · MemOS"),
    h("p",{className:S.hint},"仅用于当前微信 Bot 的主会话；普通 DSH 会话和子代理不保存、不检索。记录保存在本机；自动整理仍会调用当前 DSH 模型。"),
    toggle("memosEnabled","启用 MemOS","总开关，修改后下次对话生效。",false),
    toggle("memosRecall","自动回忆","回复前检索相关记忆，失败时继续正常对话。",true),
    toggle("memosCapture","自动记录经历","在后台整理新对话，下一条消息不等待整理完成。",true),
    status?h("p",{className:S.hint,role:"status"},status.state==="ready"?`已就绪 · ${status.total} 条记忆`:(status.error||"初始化中…")):null,
    h("details",null,h("summary",{style:{cursor:"pointer"}},"查看最近记忆"),
      h("button",{type:"button",className:S.button,disabled:busy,onClick:()=>{void refresh();}},busy?"读取中…":"刷新记录"),
      h("p",{className:S.hint},"这里只删除所选 MemOS 记录，原聊天历史和原有 memory.md 保留。"),
      status?.records?.length?h("ul",null,status.records.map(row=>h("li",{key:row.id,style:{marginBottom:12}},
        h("small",{className:S.hint},new Date(row.ts).toLocaleString()),h("p",{style:{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}},row.summary),
        h("button",{type:"button",className:S.button,disabled:disabled||busy,onClick:()=>{void remove(row.id);}},"删除此记录")))):h("p",{className:S.hint},"暂无记录。开启后，新完成的微信对话将自动记录。")),
    error?h("p",{className:S.failed,role:"alert"},error):null);
}

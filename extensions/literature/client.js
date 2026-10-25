function LiteratureFields({value:v,user,disabled,set,clear}) {
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[results,setResults]=useState(null),[busy,setBusy]=useState(false),[report,setReport]=useState(null),[request,setRequest]=useState(null);
  const load=async(action='',preserveError=false)=>{try{const r=await fetch('/plugins/clawbot/papers'+action,{credentials:'same-origin'}),j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'读取失败');if(action)setResults(j);else setStatus(j);if(!preserveError)setError('');}catch(e){setError(e.message);}};
  useEffect(()=>{void load();},[]);
  useEffect(()=>()=>{request?.abort();},[request]);
  const analyze=async(args)=>{if(busy)return;const controller=new AbortController();setRequest(controller);setBusy(true);setError('');try{const r=await fetch('/plugins/clawbot/papers',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-clawbot-paper-action':'analyze'},body:JSON.stringify(args),signal:controller.signal}),j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'研读失败');setReport(j);}catch(e){setError(controller.signal.aborted?'已取消本次网页请求，已保存的报告仍保留；可检查当前进度后重试。':e.message);}finally{setBusy(false);setRequest(null);void load('',true);}};
  const commit=async(k,x)=>{try{await set(k,x);setError('');}catch{setError('设置保存失败');}};
  const field=(key,label,hint,control,inline)=>Field({label,hint,disabled,control,inline,overridden:Object.hasOwn(user,key),onReset:()=>{void clear(key);}});
  const text=(key,label,hint)=>field(key,label,hint,h(PersonalityText,{value:v[key]||'',field:key,label,disabled,commit,limit:2000}));
  const savedReports=[...new Map([...(status?.reports||[]),...(report?.files?[report]:[])].map(r=>[r.jobId+':'+r.part,r])).values()];
  return h('section',{'aria-label':'论文工作台',style:{border:'1px solid var(--dsw-alias-border-l2)',borderRadius:10,padding:16}},
    h('p',{className:S.label,style:{marginTop:0}},'Zotero 与论文研读'),
    field('papersEnabled','启用论文工作台','只供当前微信主会话使用；电脑、DSH 和 Zotero 需保持运行。',null,h(Switch,{label:'启用论文工作台',disabled,on:v.papersEnabled===true,onChange:x=>{void commit('papersEnabled',x);}})),
    text('paperRulesPath','论文阅读规则','每次任务读取此 Markdown；可沿用你原来的论文讲解规则。'),
    h('p',{className:S.hint},'微信里可说：“我的文献有哪些分类”“查 FeSe 的 PDW 论文”“讲这篇，分段读”“继续”“推荐几篇相关 arXiv”。也可以直接发送 PDF。'),
    h('button',{className:S.button,type:'button',onClick:()=>{void load();}},'检查连接'),
    h('button',{className:S.button,type:'button',onClick:()=>{void load('?action=collections');}},'查看分类'),
    status?h('p',{className:S.hint,role:'status'},`${status.zotero?.ok?'Zotero 已连接：'+status.zotero.collections+' 个分类，'+status.zotero.items+' 个条目':status.zotero?.error||'未连接'} · ${status.enabled?'工作台已开启':'工作台未开启'}`):null,
    status?.recent?h('p',{className:S.hint},`最近研读：${status.recent.title} · ${status.recent.next}/${status.recent.total} 部分`):null,
    status?.recent?.error&&!busy?h('p',{className:S.failed,role:'alert'},status.recent.error):null,
    status?.recent?.failedExport?h('button',{type:'button',className:S.button,disabled:busy,onClick:()=>{void analyze({jobId:status.recent.id,retryExport:true});}},'重试导出（复用草稿）'):null,
    h('div',{style:{display:'flex',gap:8,margin:'12px 0'}},h('input',{className:S.input,'aria-label':'检索 Zotero 文献',placeholder:'试搜 FeSe、Kondo 或作者',value:query,onChange:e=>setQuery(e.target.value)}),h('button',{className:S.button,type:'button',onClick:()=>{void load('?action=search&q='+encodeURIComponent(query));}},'检索')),
    results?.collections?h('ul',null,results.collections.map(c=>h('li',{key:c.key},c.name+' · '+c.key))):null,
    results?.items?h('ul',null,results.items.map(i=>h('li',{key:i.key,style:{marginBottom:10}},i.title+' · '+i.key,h('button',{type:'button',className:S.button,disabled:busy||!v.papersEnabled,onClick:()=>{void analyze({itemKey:i.key,mode:'staged'});}},'按规则开始研读')))):null,
    busy?h('p',{className:S.hint,role:'status'},'正在使用当前 DSH 模型研读和看图，可能需要几分钟；会消耗现有模型额度。'):null,
    busy?h('button',{type:'button',className:S.button,onClick:()=>request?.abort()},'取消本次研读'):null,
    savedReports.length?h('div',null,h('p',{className:S.hint},'报告已保存在本机。网页调试不自动发微信。'),...savedReports.map(r=>h('div',{key:r.jobId+':'+r.part},h('p',{className:S.hint},(r.title||'论文报告')+' · 第'+r.part+'部分'),h('ul',null,r.files.map(f=>{const name=f.path.split(/[\\/]/).pop();return h('li',{key:f.path},h('a',{href:'/plugins/clawbot/papers/report?jobId='+encodeURIComponent(r.jobId)+'&name='+encodeURIComponent(name),download:name},name));}))))):null,
    status?.recent&&status.recent.next<status.recent.total?h('button',{type:'button',className:S.button,disabled:busy,onClick:()=>{void analyze({jobId:status.recent.id});}},'继续下一部分（本地生成）'):null,
    h('details',null,h('summary',{style:{cursor:'pointer'}},'运行环境与输出位置'),
      text('zoteroUrl','Zotero 本地地址','默认 http://127.0.0.1:23119。'),text('paperPython','Python 路径','需安装 pdfplumber 和 reportlab。'),text('paperRenderer','PDF 渲染器路径','Poppler 的 pdftoppm，用于真正看图。'),text('paperWorkspace','论文输出工作区','独立保存派生文件和任务进度；修改后重启 DSH。原 PDF 保持只读。')),
    error?h('p',{className:S.failed,role:'alert'},error):null);
}

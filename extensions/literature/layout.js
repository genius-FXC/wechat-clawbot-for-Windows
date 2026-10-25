function SettingsGroups({fields}) {
  const [active,setActive]=useState('papers'),[query,setQuery]=useState('');
  const groups=[
    {id:'papers',title:'论文研读',hint:'Zotero、分类检索、阅读规则、报告',indices:[3]},
    {id:'companion',title:'性格与记忆',hint:'性格、记忆、说话风格、emoji、空闲整理',indices:[0,1,8,10]},
    {id:'proactive',title:'主动互动',hint:'分享、问候、兴趣、随机时间、安静时段',indices:[2]},
    {id:'model',title:'模型与连接',hint:'provider、模型、思考等级、看图、白名单、MCP、Codex、Claude',indices:[4,5,6,7,17,18,19,20]},
    {id:'advanced',title:'文件与高级',hint:'图片压缩、JPEG、文件预告、审批、日志、工作目录',indices:[9,11,12,13,14,15,16]},
  ];
  const q=query.trim().toLowerCase(),matches=groups.filter(g=>(g.title+g.hint).toLowerCase().includes(q));
  return h('div',null,
    h('input',{type:'search','aria-label':'查找设置分组',value:query,placeholder:'查找设置：论文、记忆、模型…',className:S.input,style:{width:'100%',boxSizing:'border-box',marginBottom:12},onInput:e=>setQuery(e.target.value)}),
    h('div',{role:'tablist','aria-label':'微信 Bot 设置分组',style:{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}},groups.map(g=>h('button',{key:g.id,id:'clawbot-tab-'+g.id,type:'button',role:'tab','aria-selected':active===g.id,'aria-controls':'clawbot-panel-'+g.id,className:S.button,style:{fontWeight:active===g.id?650:400,borderColor:active===g.id?'var(--accent, #1677ff)':undefined},onClick:()=>{setActive(g.id);setQuery('');}},g.title))),
    ...groups.map(g=>{const visible=q?matches.includes(g):g.id===active;return h('section',{key:g.id,id:'clawbot-panel-'+g.id,role:q?'region':'tabpanel',hidden:!visible,style:{display:visible?undefined:'none'},'aria-labelledby':'clawbot-tab-'+g.id},h('p',{className:S.note,style:{marginTop:0}},g.hint),...g.indices.map(i=>fields[i]));}),
    q&&!matches.length?h('p',{className:S.note},'没有匹配分组，可试“论文”“记忆”“模型”或“图片”。'):null,
  );
}

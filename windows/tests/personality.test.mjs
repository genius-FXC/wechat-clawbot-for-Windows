import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {buildPersonalityPrompt,normalizePersonality,PERSONALITY_FIELDS} from '../.build/work/lib/clawbot-personality.js';
import {normalizeConfig,Config,HOT_FIELDS,snapshotConfig} from '../.build/work/lib/config.js';
import {registerWechatGuidanceGlobal} from '../.build/work/lib/prompt.js';

test('existing profiles keep their behavior until personality is enabled',()=>{
  assert.equal(buildPersonalityPrompt(normalizeConfig({})), '');
  assert.equal(buildPersonalityPrompt({personaEnabled:false,personaInstructions:'custom'}), '');
});

test('invalid choices and oversized input are normalized without altering unrelated config',()=>{
  const c=normalizeConfig({personaEnabled:true,personaPreset:'unknown',personaName:'n'.repeat(80),
    personaInstructions:'x'.repeat(2200),stripEmoji:false,codexPeer:false,provider:'openai-codex'});
  assert.equal(c.personaPreset,'warm'); assert.equal(c.personaName.length,60);
  assert.equal(c.personaInstructions.length,2000); assert.equal(c.stripEmoji,false);
  assert.equal(c.codexPeer,false); assert.equal(c.provider,'openai-codex');
  assert.equal(normalizePersonality({personaEnabled:'true'}).personaEnabled,false);
  assert.equal(normalizePersonality({personaName:'a\u0000b\r\nc'}).personaName,'ab\nc');
});

test('all personality settings are in the schema, volatile and survive live-value snapshots',()=>{
  const raw={personaEnabled:true,personaPreset:'calm',personaName:'测试伙伴',personaUserName:'测试称呼',
    personaCloseness:'close',personaReplyLength:'brief',personaHumor:'none',personaFollowup:'off',personaInstructions:'少说套话'};
  for(const key of PERSONALITY_FIELDS){
    assert.ok(HOT_FIELDS.has(key)); assert.ok(Config.dict[key]);
    assert.equal(Config.dict[key].meta.volatile,true);
  }
  const c=normalizeConfig(snapshotConfig(Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{get:()=>v}]))));
  for(const key of PERSONALITY_FIELDS)assert.equal(c[key],raw[key]);
  assert.throws(()=>Config({personaPreset:'invalid'}));
});

test('prompt is scoped to the WeChat session, rereads live settings and clears on disable',()=>{
  const sections=[]; const context={systemPrompt:{section:s=>sections.push(s)}};
  const config=normalizeConfig({personaEnabled:true,personaPreset:'warm'});
  registerWechatGuidanceGlobal(context,'test-wechat',config);
  const section=sections.find(s=>s.name==='wechat-personality');
  assert.ok(section); assert.equal(sections.filter(s=>s.name==='wechat-personality').length,1);
  assert.equal(section.text({agent:{session:{id:'web'}}}), '');
  assert.equal(section.text({}), '');
  const ctx={agent:{session:{id:'test-wechat'}}};
  const before=section.text(ctx); config.personaPreset='direct'; config.personaName='伙伴测试';
  const after=section.text(ctx); assert.notEqual(before,after); assert.match(after,/伙伴测试/);
  config.personaEnabled=false; assert.equal(section.text(ctx),'');
});

test('emoji policy stays controlled by the original toggle; prompt does not invent capabilities',()=>{
  const raw={personaEnabled:true,personaInstructions:'说话直一点',personaHumor:'lively'};
  assert.match(buildPersonalityPrompt({...raw,stripEmoji:true}),/不输出 emoji/);
  assert.match(buildPersonalityPrompt({...raw,stripEmoji:false}),/可适量使用/);
  assert.match(buildPersonalityPrompt(raw),/不会自行启动定时任务/);
  assert.match(buildPersonalityPrompt(raw),/不虚构共同经历/);
  assert.match(buildPersonalityPrompt(raw),/工具权限/);
  assert.match(buildPersonalityPrompt(raw),/必须追问或只回答确切问题/);
  assert.equal(buildPersonalityPrompt(raw),buildPersonalityPrompt(raw));
});

test('existing browser card registers and preview uses the exact server prompt builder',async()=>{
  const code=await fs.readFile(new URL('../.build/work/lib/client.js',import.meta.url),'utf8');
  let plugin;
  const react={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>[v,()=>{}],useEffect:()=>{}};
  const modules={'react':react,'@deepseek-ai/dsh-client-store':{createSnapshotStore:()=>({set(){}})}};
  // Instrument only the test VM: the shipped client keeps these helpers private.
  const instrumented=code.replace('    exports.apply = apply;','    exports.__prompt = buildPersonalityPrompt; exports.__fields = PersonalityFields;\n    exports.apply = apply;');
  vm.runInNewContext(instrumented,{window:{__ModuleLoader__:{load:({factory})=>{plugin=factory(id=>{
    if(!modules[id])throw Error('unexpected module '+id);return modules[id];
  });}}}});
  assert.equal(plugin.inject.join(','),'slots,configForms');
  const raw={personaEnabled:true,personaName:'UI 测试',personaPreset:'playful',stripEmoji:false};
  assert.equal(plugin.__prompt(raw),buildPersonalityPrompt(raw));
  const tree=plugin.__fields({value:raw,user:{},disabled:false,set(){},clear(){}});
  assert.equal(tree.props['aria-label'],'性格与聊天风格');
  assert.match(JSON.stringify(tree),/查看已保存的性格提示词/);
  assert.match(code,/h\(PersonalityFields, \{ key: "personality"/);
});

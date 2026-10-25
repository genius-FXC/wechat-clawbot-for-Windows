import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('./',import.meta.url));
export async function integrateLiterature(work,patch){
  await fs.copyFile(path.join(directory,'runtime.ts'),path.join(work,'src/clawbot-literature.ts'));
  await fs.copyFile(path.join(directory,'schema.ts'),path.join(work,'src/clawbot-literature-schema.ts'));
  await fs.copyFile(path.join(directory,'analyzer.ts'),path.join(work,'src/clawbot-paper-analyzer.ts'));
  await patch('src/config.ts','import Schema from "@deepseek-ai/schemastery";','import Schema from "@deepseek-ai/schemastery";\nimport {DEFAULT_LITERATURE,LITERATURE_HOT_FIELDS,normalizeLiterature,LITERATURE_SCHEMA,type LiteratureConfig} from "./clawbot-literature-schema.js";');
  await patch('src/config.ts','export interface ClawbotConfig extends PersonalityConfig, ClawbotMemoryConfig, ProactiveConfig {','export interface ClawbotConfig extends PersonalityConfig, ClawbotMemoryConfig, ProactiveConfig, LiteratureConfig {');
  await patch('src/config.ts','  ...DEFAULT_PROACTIVE,','  ...DEFAULT_PROACTIVE,\n  ...DEFAULT_LITERATURE,');
  await patch('src/config.ts','    ...normalizeProactive(r),','    ...normalizeProactive(r),\n    ...normalizeLiterature(r),');
  await patch('src/config.ts','  ...PROACTIVE_SCHEMA,','  ...PROACTIVE_SCHEMA,\n  ...LITERATURE_SCHEMA,');
  await patch('src/config.ts','  ...PROACTIVE_FIELDS,','  ...PROACTIVE_FIELDS,\n  ...LITERATURE_HOT_FIELDS,');
  await patch('src/index.ts','import path from "node:path";','import path from "node:path";\nimport {registerLiterature} from "./clawbot-literature.js";');
  await patch('src/index.ts','  let abort = new AbortController();','  let abort = new AbortController();\n  registerLiterature(ctx,config,{getBridge:()=>bridge,getOwner:()=>currentAccount?.userId});');
  await patch('src/bridge.ts','  private currentRoute(): { provider: string; model: string; source: string } | null {','  paperRoute(): {provider:string;model:string} | null { return this.currentRoute(); }\n  private currentRoute(): { provider: string; model: string; source: string } | null {');
  await patch('src/inbound.ts','import path from "node:path";','import path from "node:path";\nimport {registerPaperAttachment} from "./clawbot-literature.js";');
  await patch('src/inbound.ts','        if (media.filePath) {','        if (media.filePath) {\n          mediaNote += await registerPaperAttachment(this.config.sessionId,media.filePath,sender,item.file_item?.file_name);');
  await patch('src/inbound.ts','      if (media.filePath) {\n        mediaNote += `\\n（用户引用的文件','      if (media.filePath) {\n        mediaNote += await registerPaperAttachment(this.config.sessionId,media.filePath,sender,refMediaItem.file_item?.file_name);\n        mediaNote += `\\n（用户引用的文件');
  await patch('src/inbound-media.ts','import path from "node:path";','import path from "node:path";\nimport {randomUUID} from "node:crypto";');
  await patch('src/inbound-media.ts','`${Date.now()}-${path.basename(originalName).replace(/[^\\w.\\-]/g, "_")}`','`${Date.now()}-${randomUUID()}-${path.basename(originalName).replace(/[^\\w.\\-]/g, "_").slice(0,160)}`');
  await patch('src/inbound-media.ts','`${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`','`${Date.now()}-${randomUUID()}${ext}`');
  await patch('src/inbound-media.ts','fs.writeFileSync(filePath, buf, { mode: 0o600 });','fs.writeFileSync(filePath, buf, { mode: 0o600, flag: "wx" });');
  await patch('src/client.js','        h(ProactiveFields, { key: "proactive", value: v, user, disabled, set, clear }),','        h(ProactiveFields, { key: "proactive", value: v, user, disabled, set, clear }),\n        h(LiteratureFields, { key: "literature", value: v, user, disabled, set, clear }),');
  await patch('src/client.js','    const MODELS_URL = "/plugins/clawbot/models";','    const MODELS_URL = "/plugins/clawbot/models";\n'+await fs.readFile(path.join(directory,'client.js'),'utf8'));
  await patch('src/client.js','    const MODELS_URL = "/plugins/clawbot/models";','    const MODELS_URL = "/plugins/clawbot/models";\n'+await fs.readFile(path.join(directory,'layout.js'),'utf8'));
  await patch('src/client.js','              fields,','              h(SettingsGroups,{fields}),');
  await patch('src/client.js','性格、模型、图片与发送设置。改完下次回复生效','论文、性格与记忆、主动互动、模型连接；分组管理与调试');
}
export async function installLiteratureRuntime(work){const target=path.join(work,'lib/literature');await fs.mkdir(target,{recursive:true});for(const f of ['core.mjs','zotero.mjs','reading.mjs','math-render.mjs','pdf-worker.py'])await fs.copyFile(path.join(directory,f),path.join(target,f));}

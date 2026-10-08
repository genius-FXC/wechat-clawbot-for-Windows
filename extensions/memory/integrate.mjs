import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMemos} from './build-memos.mjs';
const directory=fileURLToPath(new URL('./',import.meta.url));

export async function integrateMemory(work,patch){
  for(const [from,to] of [['scope.ts','clawbot-memory-scope.ts'],['runtime.ts','clawbot-memory.ts'],['schema.ts','clawbot-memory-schema.ts']])await fs.copyFile(path.join(directory,from),path.join(work,'src',to));
  await patch('src/config.ts','import Schema from "@deepseek-ai/schemastery";',
    'import Schema from "@deepseek-ai/schemastery";\nimport {DEFAULT_MEMORY,MEMORY_FIELDS,normalizeMemory,type ClawbotMemoryConfig} from "./clawbot-memory-scope.js";\nimport {MEMORY_SCHEMA} from "./clawbot-memory-schema.js";');
  await patch('src/config.ts','export interface ClawbotConfig extends PersonalityConfig {','export interface ClawbotConfig extends PersonalityConfig, ClawbotMemoryConfig {');
  await patch('src/config.ts','  ...DEFAULT_PERSONALITY,','  ...DEFAULT_PERSONALITY,\n  ...DEFAULT_MEMORY,');
  await patch('src/config.ts','    ...normalizePersonality(r),','    ...normalizePersonality(r),\n    ...normalizeMemory(r),');
  await patch('src/config.ts','  ...PERSONALITY_SCHEMA,','  ...PERSONALITY_SCHEMA,\n  ...MEMORY_SCHEMA,');
  await patch('src/config.ts','  ...PERSONALITY_FIELDS,','  ...PERSONALITY_FIELDS,\n  ...MEMORY_FIELDS,');
  await patch('src/index.ts','import path from "node:path";','import path from "node:path";\nimport {registerClawbotMemory} from "./clawbot-memory.js";');
  await patch('src/index.ts','  registerModelsRoute(ctx);','  registerModelsRoute(ctx);\n  registerClawbotMemory(ctx,config);');
  // Retain the original explicit memory tool and file, but avoid two background classifiers.
  await patch('src/bridge.ts','        if (this.config.autoMemory) {','        if (this.config.autoMemory && !this.config.memosEnabled) {');
  await patch('src/client.js','        h(PersonalityFields, { key: "personality", value: v, user, disabled, set, clear }),',
    '        h(PersonalityFields, { key: "personality", value: v, user, disabled, set, clear }),\n        h(MemoryFields, { key: "memory", value: v, user, disabled, set, clear }),');
  await patch('src/client.js','    const MODELS_URL = "/plugins/clawbot/models";',
    '    const MODELS_URL = "/plugins/clawbot/models";\n'+await fs.readFile(path.join(directory,'client.js'),'utf8'));
}
export async function installMemoryRuntime(work){
  await buildMemos(path.join(work,'lib/memos'));
}

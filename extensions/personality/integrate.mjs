import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('./',import.meta.url));

/** Patch only the generated copy, never upstream. Each integration point is checked. */
export async function integratePersonality(work, patch) {
  const choices=JSON.parse(await fs.readFile(path.join(directory,'choices.json'),'utf8'));
  await fs.writeFile(path.join(work,'src/clawbot-personality-data.ts'),'export const PERSONALITY_CHOICES = '+JSON.stringify(choices,null,2)+' as const;\n');
  await fs.copyFile(path.join(directory,'runtime.ts'),path.join(work,'src/clawbot-personality.ts'));
  await fs.copyFile(path.join(directory,'schema.ts'),path.join(work,'src/clawbot-personality-schema.ts'));
  await patch('src/config.ts','import Schema from "@deepseek-ai/schemastery";',
    'import Schema from "@deepseek-ai/schemastery";\nimport {DEFAULT_PERSONALITY, PERSONALITY_FIELDS, normalizePersonality, type PersonalityConfig} from "./clawbot-personality.js";\nimport {PERSONALITY_SCHEMA} from "./clawbot-personality-schema.js";');
  await patch('src/config.ts','export interface ClawbotConfig {','export interface ClawbotConfig extends PersonalityConfig {');
  await patch('src/config.ts','export const DEFAULT_CONFIG: ClawbotConfig = {','export const DEFAULT_CONFIG: ClawbotConfig = {\n  ...DEFAULT_PERSONALITY,');
  await patch('src/config.ts','  const r = (raw ?? {}) as Record<string, unknown>;\n  return {','  const r = (raw ?? {}) as Record<string, unknown>;\n  return {\n    ...normalizePersonality(r),');
  await patch('src/config.ts','export const BaseConfig = Schema.object({','export const BaseConfig = Schema.object({\n  ...PERSONALITY_SCHEMA,');
  await patch('src/config.ts','export const HOT_FIELDS = new Set<keyof ClawbotConfig>([','export const HOT_FIELDS = new Set<keyof ClawbotConfig>([\n  ...PERSONALITY_FIELDS,');
  await patch('src/prompt.ts','import { loadMemoryText } from "./memory.js";','import { loadMemoryText } from "./memory.js";\nimport {buildPersonalityPrompt, type PersonalityConfig} from "./clawbot-personality.js";');
  await patch('src/prompt.ts','export function buildWechatSystemPrompt(allowEmoji = false): string {','export function buildWechatSystemPrompt(allowEmoji = false, personality: Partial<PersonalityConfig> = {}): string {');
  await patch('src/prompt.ts','  return `${memorySection}${currentTimeSection()}${weixinRules(allowEmoji)}`;','  return `${memorySection}${currentTimeSection()}${weixinRules(allowEmoji)}${buildPersonalityPrompt({...personality, stripEmoji: !allowEmoji} as Partial<PersonalityConfig>)}`;');
  await patch('src/prompt.ts','  config: { stripEmoji: boolean },','  config: { stripEmoji: boolean } & Partial<PersonalityConfig>,');
  await patch('src/prompt.ts','    name: "wechat-memory",','    name: "wechat-personality",\n    order: 81,\n    text: (context) => {\n      const agent = (context as { agent?: { session?: { id?: unknown } } }).agent;\n      return String(agent?.session?.id) === String(sessionId) ? buildPersonalityPrompt(config) : "";\n    },\n  });\n  ctx.systemPrompt.section({\n    name: "wechat-memory",');
  await patch('src/client.js','      const fields = [','      const fields = [\n        h(PersonalityFields, { key: "personality", value: v, user, disabled, set, clear }),');
  await patch('src/client.js','"模型、图片、发送与白名单。改完立刻生效，微信连接不中断"','"性格、模型、图片与发送设置。改完下次回复生效"');
  await patch('src/tool.ts','"Send ONE message per call; keep each message as short as possible. "','"Send ONE message per call; keep it concise while respecting the configured conversation style and the user\'s requested detail. "');
  await patch('src/tool.ts','"The exact text to send to WeChat (plain text, no emojis; may use WeChat native emoji codes like [捂脸])."','"The exact text to send to WeChat. Follow the configured emoji policy; do not use bracketed WeChat emoji codes."');
}

/** The browser and server execute the same compiled pure prompt builder. */
export async function integratePersonalityClient(work, patch) {
  const choices=JSON.parse(await fs.readFile(path.join(directory,'choices.json'),'utf8'));
  let runtime=await fs.readFile(path.join(work,'lib/clawbot-personality.js'),'utf8');
  runtime=runtime.replace('import { PERSONALITY_CHOICES } from "./clawbot-personality-data.js";','const PERSONALITY_CHOICES = '+JSON.stringify(choices)+';');
  runtime=runtime.replace(/^export /gm,'').replace(/^\/\/# sourceMappingURL=.*$/gm,'');
  const ui=await fs.readFile(path.join(directory,'client.js'),'utf8');
  await patch('src/client.js','    const MB = 1024 * 1024;', '    const MB = 1024 * 1024;\n'+runtime+'\n'+ui);
}

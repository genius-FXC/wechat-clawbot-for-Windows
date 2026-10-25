import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('./',import.meta.url));
export async function integrateProactive(work,patch){
  for(const [from,to] of [['policy.ts','clawbot-proactive-policy.ts'],['engine.ts','clawbot-proactive-engine.ts'],['media.ts','clawbot-proactive-media.ts'],['runtime.ts','clawbot-proactive.ts'],['schema.ts','clawbot-proactive-schema.ts']])await fs.copyFile(path.join(directory,from),path.join(work,'src',to));
  await fs.copyFile(path.join(directory,'send-test.ts'),path.join(work,'src/clawbot-proactive-send-test.ts'));
  await patch('src/config.ts','import Schema from "@deepseek-ai/schemastery";',
    'import Schema from "@deepseek-ai/schemastery";\nimport {DEFAULT_PROACTIVE,PROACTIVE_FIELDS,normalizeProactive,type ProactiveConfig} from "./clawbot-proactive-policy.js";\nimport {PROACTIVE_SCHEMA} from "./clawbot-proactive-schema.js";');
  await patch('src/config.ts','export interface ClawbotConfig extends PersonalityConfig, ClawbotMemoryConfig {','export interface ClawbotConfig extends PersonalityConfig, ClawbotMemoryConfig, ProactiveConfig {');
  await patch('src/config.ts','  ...DEFAULT_MEMORY,','  ...DEFAULT_MEMORY,\n  ...DEFAULT_PROACTIVE,');
  await patch('src/config.ts','    ...normalizeMemory(r),','    ...normalizeMemory(r),\n    ...normalizeProactive(r),');
  await patch('src/config.ts','  ...MEMORY_SCHEMA,','  ...MEMORY_SCHEMA,\n  ...PROACTIVE_SCHEMA,');
  await patch('src/config.ts','  ...MEMORY_FIELDS,','  ...MEMORY_FIELDS,\n  ...PROACTIVE_FIELDS,');
  await patch('src/index.ts','import path from "node:path";','import path from "node:path";\nimport {registerProactive} from "./clawbot-proactive.js";');
  await patch('src/index.ts','  let abort = new AbortController();','  let abort = new AbortController();\n  registerProactive(ctx,config,{getBridge:()=>bridge,getAccount:()=>currentAccount});');
  await patch('src/bridge.ts','type QueuedMessage = { sender: string; text: string; message: UserMessage; parts: unknown[] };','type QueuedMessage = { sender: string; text: string; message: UserMessage; parts: unknown[]; proactive?: boolean };');
  await patch('src/bridge.ts','  private readonly queue: QueuedMessage[] = [];','  private readonly queue: QueuedMessage[] = [];\n  private proactiveTurn = false;');
  await patch('src/bridge.ts','  async enqueueMessage(sender: string, text: string, imagePath?: string): Promise<void> {',`  /** Optional background sharing never steers or impersonates a human message. */
  canStartProactive(): boolean {
    return !this.disposed && !this.worker && this.queue.length === 0 && this.deps.pending.size === 0 && (this.incoming?.size ?? 0) === 0
      && this.ctx.agents.get(this.sessionId)?.status !== "running";
  }
  async enqueueProactive(sender: string, prompt: string): Promise<boolean> {
    if (!this.config.proactiveEnabled || !this.canStartProactive()) return false;
    const parts = [{type:"text" as const,text:prompt}];
    const message = createUserMessage({content:parts,source:{kind:"plugin:clawbot-proactive"}});
    this.queue.push({sender,text:prompt,message,parts,proactive:true});
    this.runWorker(); await this.worker; return true;
  }

  async enqueueMessage(sender: string, text: string, imagePath?: string): Promise<void> {`);
  await patch('src/bridge.ts','    const live = this.ctx.agents.get(this.sessionId);\n    if (this.worker !== null && sender === this.currentSender',
    '    const live = this.ctx.agents.get(this.sessionId);\n    if (this.proactiveTurn) {\n      this.queue.push(task);\n      live?.cancel({kind:"hook",reason:"wechat: human message supersedes proactive sharing"} as never);\n      return;\n    }\n    if (this.worker !== null && sender === this.currentSender');
  await patch('src/bridge.ts','      while (this.queue.length > 0 && this.queue[0].sender === first.sender)',
    '      this.proactiveTurn = first.proactive === true;\n      while (!first.proactive && this.queue.length > 0 && !this.queue[0].proactive && this.queue[0].sender === first.sender)');
  await patch('src/bridge.ts','        const agent = await this.ensureAgent();\n        if (agent.status === "running" && this.currentSender',
    '        const agent = await this.ensureAgent();\n        if (first.proactive && (!this.config.proactiveEnabled || agent.status === "running")) throw new Error("Proactive opportunity cancelled because the session is busy");\n        if (agent.status === "running" && this.currentSender');
  await patch('src/bridge.ts','      this.typing.start(first.sender);','      if (!first.proactive) this.typing.start(first.sender);');
  await patch('src/bridge.ts','        this.trackInbox({ sender: first.sender, text: batch.map((t) => t.text).join("\\n"), message, parts });','        if (!first.proactive) this.trackInbox({ sender: first.sender, text: batch.map((t) => t.text).join("\\n"), message, parts });');
  await patch('src/bridge.ts','if (this.config.autoMemory && !this.config.memosEnabled) {','if (this.config.autoMemory && !this.config.memosEnabled && !first.proactive) {');
  await patch('src/bridge.ts','    this.currentSender = undefined;\n  }\n\n  /**\n   * Session event feed:', '    this.proactiveTurn = false;\n    this.currentSender = undefined;\n  }\n\n  /**\n   * Session event feed:');
  await patch('src/client.js','        h(MemoryFields, { key: "memory", value: v, user, disabled, set, clear }),',
    '        h(MemoryFields, { key: "memory", value: v, user, disabled, set, clear }),\n        h(ProactiveFields, { key: "proactive", value: v, user, disabled, set, clear }),');
  await patch('src/client.js','    const MODELS_URL = "/plugins/clawbot/models";','    const MODELS_URL = "/plugins/clawbot/models";\n'+await fs.readFile(path.join(directory,'client.js'),'utf8'));
}

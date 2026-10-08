import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const MEMOS_COMMIT='a7367d07e55db61099f7b4e2c1108bc5831a24f3';
const root=fileURLToPath(new URL('../../',import.meta.url));
const checkout=path.resolve(root,'../MemOS-for-clawbot');
export const MEMOS_SOURCE=path.join(checkout,'apps/memos-local-plugin');

/** Build a reviewed, isolated copy against the actual DSH host; never edit upstream. */
export async function buildMemos(destination) {
  const head=spawnSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8',windowsHide:true});
  if(head.status!==0||head.stdout.trim()!==MEMOS_COMMIT)throw Error('MemOS revision changed; review before rebuilding');
  const changes=spawnSync('git',['status','--porcelain','--untracked-files=no'],{cwd:checkout,encoding:'utf8',windowsHide:true});
  if(changes.status!==0||changes.stdout.trim())throw Error('MemOS tracked source changed; review before rebuilding');
  const generated=path.join(root,'windows/.build/memos');
  if(path.dirname(generated)!==path.join(root,'windows/.build'))throw Error('Unsafe MemOS build path');
  await fs.rm(generated,{recursive:true,force:true});await fs.mkdir(generated,{recursive:true});
  for(const dir of ['core','agent-contract','server','adapters/deepseek-harness','scripts'])await fs.cp(path.join(MEMOS_SOURCE,dir),path.join(generated,dir),{recursive:true});
  for(const file of ['package.json','tsconfig.json','tsconfig.build.json'])await fs.copyFile(path.join(MEMOS_SOURCE,file),path.join(generated,file));
  const buildConfig=JSON.parse(await fs.readFile(path.join(generated,'tsconfig.json'),'utf8'));
  buildConfig.compilerOptions.types=['node'];
  buildConfig.compilerOptions.paths={'better-sqlite3':[path.join(MEMOS_SOURCE,'node_modules/@types/better-sqlite3/index.d.ts').replaceAll('\\','/')]};
  await fs.writeFile(path.join(generated,'tsconfig.json'),JSON.stringify(buildConfig,null,2));
  const edit=async(file,from,to,count=1)=>{
    const target=path.join(generated,file);const body=(await fs.readFile(target,'utf8')).replaceAll('\r\n','\n');
    if(body.split(from).length-1!==count)throw Error('MemOS patch anchor drift: '+file+' / '+from.slice(0,60));
    await fs.writeFile(target,body.replaceAll(from,to));
  };
  // The caller supplies a live, exact session predicate. An absent predicate denies all.
  await edit('adapters/deepseek-harness/index.ts','  failOnStartupError: boolean;','  failOnStartupError: boolean;\n  allowSession?: (session: unknown) => boolean;\n  active?: () => boolean;\n  recallActive?: () => boolean;\n  captureActive?: () => boolean;\n  onReady?: (core: MemoryCore) => void;');
  await edit('adapters/deepseek-harness/index.ts','export const inject = ["systemPrompt", "tools", "llm"];','export const inject = ["systemPrompt", "tools", "llm", "agents"];');
  await edit('adapters/deepseek-harness/index.ts','  const configuredHome = defaultDeepSeekHarnessHome(config.home);','  const configuredHome = defaultDeepSeekHarnessHome(config.home);\n  const allows = (session: unknown): boolean => config.allowSession?.(session) === true;');
  await edit('adapters/deepseek-harness/index.ts','      contextMaxChars: config.contextMaxChars,','      contextMaxChars: config.contextMaxChars,\n      allowSession: allows,\n      userSourceKinds: ["user", "plugin:wechat-clawbot"],\n      recallActive: config.recallActive,\n      captureActive: config.captureActive,');
  await edit('adapters/deepseek-harness/index.ts','          kind: "plugin",\n          plugin: DEEPSEEK_HARNESS_PLUGIN,','          kind: "plugin:clawbot-memory",');
  await edit('adapters/deepseek-harness/index.ts','      text: deepSeekHarnessMemoryGuidance(config.toolsEnabled),','      text: (context) => config.active?.() !== false && allows((context as {agent?: {session?: unknown}}).agent?.session) ? deepSeekHarnessMemoryGuidance(config.toolsEnabled) : "",');
  const toolsStart='    if (config.toolsEnabled) {\n      registrations.push(registerDeepSeekHarnessTools(ctx, {';
  const toolsEnd='      }));\n    }\n\n    ctx.logger.info(';
  const indexPath=path.join(generated,'adapters/deepseek-harness/index.ts');let index=(await fs.readFile(indexPath,'utf8')).replaceAll('\r\n','\n');
  const a=index.indexOf(toolsStart),b=index.indexOf(toolsEnd,a);
  if(a<0||b<0)throw Error('MemOS scoped tool registration boundary changed');
  index=index.slice(0,a)+`    if (config.toolsEnabled) {
      const installed = new WeakSet<object>();
      const mountTools = (agent: {session: unknown; ctx: Context}): void => {
        if (!allows(agent.session) || installed.has(agent)) return;
        installed.add(agent);
        registrations.push(registerDeepSeekHarnessTools(agent.ctx, {
          core: core!, profileId: config.profileId, maxBodyChars: config.toolResultMaxChars,
          searchTimeoutMs: foregroundSearchTimeoutMs,
          allowSession: (session) => config.active?.() !== false && allows(session),
          currentEpisode: (session) => bridge!.currentEpisode(session),
          runWithLlmRoute: (route, operation) => routes.run(route, operation),
        }));
      };
      for (const agent of ctx.agents.list()) mountTools(agent);
      registrations.push(ctx.on("agent/created", ({agent}) => { mountTools(agent); return undefined; }));
    }
    config.onReady?.(core);

    ctx.logger.info(`+index.slice(b+toolsEnd.length);
  await fs.writeFile(indexPath,index);
  // Admission is applied before any state creation, lookup, capture, or close.
  await edit('adapters/deepseek-harness/bridge.ts','  core: MemoryCore;','  core: MemoryCore;\n  allowSession?: (session: DshSessionLike) => boolean;\n  userSourceKinds?: readonly string[];\n  recallActive?: () => boolean;\n  captureActive?: () => boolean;');
  await edit('adapters/deepseek-harness/bridge.ts','  private readonly core: MemoryCore;','  private readonly core: MemoryCore;\n  private readonly allows: (session: DshSessionLike) => boolean;\n  private readonly sourceKinds: readonly string[];\n  private readonly recallActive: () => boolean;\n  private readonly captureActive: () => boolean;');
  await edit('adapters/deepseek-harness/bridge.ts','    this.core = options.core;','    this.core = options.core;\n    this.allows = options.allowSession ?? (() => false);\n    this.sourceKinds = options.userSourceKinds ?? ["user"];\n    this.recallActive = options.recallActive ?? (() => true);\n    this.captureActive = options.captureActive ?? (() => true);');
  await edit('adapters/deepseek-harness/bridge.ts','    if (payload.step !== 1) return decision;','    if (payload.step !== 1 || !this.allows(payload.agent.session)) return decision;');
  await edit('adapters/deepseek-harness/bridge.ts','userTextFromMessages(decision.messages)','userTextFromMessages(decision.messages, this.sourceKinds)');
  await edit('adapters/deepseek-harness/bridge.ts','!this.recallEnabled || !userText','!this.recallEnabled || !this.recallActive() || !userText');
  await edit('adapters/deepseek-harness/bridge.ts','  onSessionEvent(session: DshSessionLike, event: DshSessionEventLike): void {','  onSessionEvent(session: DshSessionLike, event: DshSessionEventLike): void {\n    if (!this.allows(session)) return;');
  await edit('adapters/deepseek-harness/bridge.ts','if (event.data.source.kind !== "user") return;','if (!this.sourceKinds.includes(event.data.source.kind)) return;');
  await edit('adapters/deepseek-harness/bridge.ts','!this.captureEnabled || !state.userText','!this.captureEnabled || !this.captureActive() || !state.userText');
  await edit('adapters/deepseek-harness/bridge.ts','  private async captureTurn(state: TurnState): Promise<void> {','  private async captureTurn(state: TurnState): Promise<void> {\n    if (!this.allows(state.dshSession) || !this.captureActive()) { this.deleteTurn(state.dshSession, state.turn); return; }');
  await edit('adapters/deepseek-harness/bridge.ts','function userTextFromMessages(messages: readonly DshUserMessageLike[]): string {','function userTextFromMessages(messages: readonly DshUserMessageLike[], sources: readonly string[]): string {');
  await edit('adapters/deepseek-harness/bridge.ts','.filter((message) => message.source.kind === "user")','.filter((message) => sources.includes(message.source.kind))');
  await edit('adapters/deepseek-harness/bridge.ts','    const preset = session.header?.["agentPreset"];\n    const profileId = typeof preset === "string" && preset.trim()\n      ? preset.trim()\n      : this.profileId;','    const profileId = this.profileId;');
  await edit('adapters/deepseek-harness/tools.ts','  const preset = session?.header?.["agentPreset"];\n  const resolvedProfileId = typeof preset === "string" && preset.trim()\n    ? preset.trim()\n    : profileId;','  const resolvedProfileId = profileId;');
  await edit('adapters/deepseek-harness/bridge.ts','  async closeSession(session: DshSessionLike): Promise<void> {','  async closeSession(session: DshSessionLike): Promise<void> {\n    if (!this.allows(session)) return;');
  await edit('adapters/deepseek-harness/host-llm.ts','source: { kind: "plugin", plugin: HOST_LLM_MESSAGE_SOURCE },','source: { kind: "plugin:clawbot-memory" } as never,');
  await fs.writeFile(path.join(generated,'adapters/deepseek-harness/source.ts'),'import type {} from "@deepseek-ai/dsh-llm";\ndeclare module "@deepseek-ai/dsh-llm" { interface MessageSourceMap { "plugin:clawbot-memory": {kind:"plugin:clawbot-memory"; form?:"recall"}; } }\n');
  await edit('adapters/deepseek-harness/index.ts','/** Native Cordis adapter for DeepSeek Harness. */','/** Native Cordis adapter for DeepSeek Harness. */\nimport type {} from "./source.js";');
  await edit('adapters/deepseek-harness/tools.ts','import { defineTool, type JsonValue } from "@deepseek-ai/dsh-tools";','import { defineTool } from "@deepseek-ai/dsh-tools";\ntype JsonValue = null | string | number | boolean | JsonValue[] | {[key: string]: JsonValue};');
  await edit('adapters/deepseek-harness/tools.ts','  core: MemoryCore;','  core: MemoryCore;\n  allowSession?: (session: unknown) => boolean;');
  await edit('adapters/deepseek-harness/tools.ts','      const agent = toolAgent(exec.agent);','      const agent = toolAgent(exec.agent);\n      if (options.allowSession?.(agent?.session) !== true) throw new Error("MemOS is limited to the configured WeChat chatbot session");',6);
  // Explicit home prevents MemOS environment variables redirecting private data.
  await edit('adapters/deepseek-harness/index.ts','    const home = resolveHome(DEEPSEEK_HARNESS_AGENT, configuredHome);','    const home = resolveHome(DEEPSEEK_HARNESS_AGENT, configuredHome);\n    if (resolve(home.root) !== resolve(configuredHome)) throw new Error("MemOS home override rejected for isolated chatbot storage");');
  await edit('adapters/deepseek-harness/index.ts','      loaded.config,\n      config.hostLlmEnabled,','      { ...loaded.config,\n        embedding: {...loaded.config.embedding,provider:"local",endpoint:"",apiKey:""},\n        llm: {...loaded.config.llm,provider:"",endpoint:"",apiKey:"",maxRetries:0},\n        l3Llm: {...loaded.config.l3Llm,provider:"",endpoint:"",apiKey:""},\n        skillEvolver: {...loaded.config.skillEvolver,provider:"",endpoint:"",apiKey:""},\n        hub: {...loaded.config.hub,enabled:false},\n        telemetry: {...loaded.config.telemetry,enabled:false},\n        algorithm: {...loaded.config.algorithm,lightweightMemory:{enabled:true}},\n      },\n      config.hostLlmEnabled,');
  const tsc=spawnSync(process.execPath,[path.join(root,'windows/node_modules/typescript/bin/tsc'),'-p',path.join(generated,'tsconfig.build.json')],{cwd:generated,stdio:'inherit',windowsHide:true});
  if(tsc.status!==0)throw Error('Reviewed MemOS build failed');
  const assets=spawnSync(process.execPath,[path.join(generated,'scripts/copy-runtime-assets.cjs')],{cwd:generated,stdio:'inherit',windowsHide:true});
  if(assets.status!==0)throw Error('MemOS assets build failed');
  await fs.cp(path.join(generated,'dist'),destination,{recursive:true});
  await fs.copyFile(path.join(checkout,'LICENSE'),path.join(destination,'LICENSE-MemOS'));
  await fs.writeFile(path.join(destination,'UPSTREAM.json'),JSON.stringify({repository:'https://github.com/MemTensor/MemOS',commit:MEMOS_COMMIT,component:'apps/memos-local-plugin',adaptation:'Windows DSH 0.2, chatbot-only'},null,2));
}

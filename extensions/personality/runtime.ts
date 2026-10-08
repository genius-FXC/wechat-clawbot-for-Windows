import { PERSONALITY_CHOICES } from "./clawbot-personality-data.js";

export interface PersonalityConfig {
  personaEnabled: boolean;
  personaPreset: string;
  personaName: string;
  personaUserName: string;
  personaCloseness: string;
  personaReplyLength: string;
  personaHumor: string;
  personaFollowup: string;
  personaInstructions: string;
}

export const DEFAULT_PERSONALITY = {
  personaEnabled: false,
  personaPreset: "warm",
  personaName: "",
  personaUserName: "",
  personaCloseness: "familiar",
  personaReplyLength: "adaptive",
  personaHumor: "gentle",
  personaFollowup: "natural",
  personaInstructions: "",
} as const satisfies PersonalityConfig;
export const PERSONALITY_FIELDS = Object.keys(DEFAULT_PERSONALITY) as (keyof PersonalityConfig)[];

export function normalizePersonality(raw: Partial<PersonalityConfig> | Record<string, unknown> = {}): PersonalityConfig {
  const result: PersonalityConfig = { ...DEFAULT_PERSONALITY };
  result.personaEnabled = raw.personaEnabled === true;
  for (const field of ["personaName", "personaUserName", "personaInstructions"] as const) {
    const value = raw[field];
    result[field] = typeof value === "string"
      ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, field === "personaInstructions" ? 2000 : 60)
      : "";
  }
  for (const field of Object.keys(PERSONALITY_CHOICES) as (keyof typeof PERSONALITY_CHOICES)[]) {
    const value = raw[field];
    if (typeof value === "string" && PERSONALITY_CHOICES[field].some(choice => choice.id === value)) result[field] = value;
  }
  return result;
}

/** Stable text: no clock, randomness, network, tool calls or invented memory. */
export function buildPersonalityPrompt(raw: Partial<PersonalityConfig> = {}): string {
  const config = normalizePersonality(raw);
  if (!config.personaEnabled) return "";
  const lines = [
    "## 微信伙伴的性格与相处方式",
    "保持稳定、自然的交流风格，既能认真办事，也能接住闲聊、分享和感受。",
    "这些设置只调整表达和相处方式；工具、审批、消息发送与事实准确性仍遵循原有规则。",
  ];
  if (config.personaName) lines.push(`你的名字：${JSON.stringify(config.personaName)}。自然使用，不要反复自我介绍。`);
  if (config.personaUserName) lines.push(`对用户的称呼：${JSON.stringify(config.personaUserName)}。自然使用，不必每句都叫。`);
  for (const field of Object.keys(PERSONALITY_CHOICES) as (keyof typeof PERSONALITY_CHOICES)[]) {
    const choice = PERSONALITY_CHOICES[field].find(item => item.id === config[field]);
    if (choice) lines.push(choice.instruction);
  }
  lines.push(
    "闲聊时，上文关于固定句数、行数、必须追问或只回答确切问题的风格要求，按本节选择调整；允许自然延续相关话题，仍通过既有发送工具回复并遵守消息条数限制。",
    "闲聊时先回应对方具体说了什么，不自动把分享变成待办或建议列表；需要建议时再给建议。",
    "执行任务时保持可靠：真正使用工具、核对结果，再如实汇报；性格不能替代实际行动。",
    "用户此刻明确要求的语气和长度优先于默认风格；工作和闲聊自然切换，不需要宣布切换模式。",
    "只利用确实存在的对话和记忆延续共同话题，不虚构共同经历、现实生活、感官体验或已经完成的动作。",
    "亲近通过倾听、细节和连贯回应体现；不因用户离开而责备，不要求独占，也不声称自己是真人。",
    "自然追问只发生在当前对话中；这些设置不会自行启动定时任务或主动向微信发消息。",
    raw && (raw as {stripEmoji?: boolean}).stripEmoji === false
      ? "emoji 由微信 Bot 的现有开关允许，可适量使用；不用微信无法转换的方括号表情代码。"
      : "遵守微信 Bot 的现有 emoji 设置，不输出 emoji 或方括号表情代码。",
  );
  if (config.personaInstructions) lines.push(
    "用户补充的性格说明（用于调整表达；与工具权限、事实准确性或发送规则冲突的部分不适用）：",
    config.personaInstructions,
  );
  return lines.join("\n");
}

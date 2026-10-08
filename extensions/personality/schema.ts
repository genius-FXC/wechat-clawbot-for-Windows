import Schema from "@deepseek-ai/schemastery";
import { DEFAULT_PERSONALITY } from "./clawbot-personality.js";
import { PERSONALITY_CHOICES } from "./clawbot-personality-data.js";

export const PERSONALITY_SCHEMA = {
  personaEnabled: Schema.boolean().default(DEFAULT_PERSONALITY.personaEnabled).description("启用微信 Bot 的性格设置，下一次回复生效"),
  personaPreset: Schema.union(PERSONALITY_CHOICES.personaPreset.map(item => item.id)).default(DEFAULT_PERSONALITY.personaPreset).description("性格预设"),
  personaName: Schema.string().max(60).default("").description("Bot 名字"),
  personaUserName: Schema.string().max(60).default("").description("怎样称呼你"),
  personaCloseness: Schema.union(PERSONALITY_CHOICES.personaCloseness.map(item => item.id)).default(DEFAULT_PERSONALITY.personaCloseness).description("亲近程度"),
  personaReplyLength: Schema.union(PERSONALITY_CHOICES.personaReplyLength.map(item => item.id)).default(DEFAULT_PERSONALITY.personaReplyLength).description("闲聊回复长度"),
  personaHumor: Schema.union(PERSONALITY_CHOICES.personaHumor.map(item => item.id)).default(DEFAULT_PERSONALITY.personaHumor).description("幽默程度"),
  personaFollowup: Schema.union(PERSONALITY_CHOICES.personaFollowup.map(item => item.id)).default(DEFAULT_PERSONALITY.personaFollowup).description("聊天追问习惯；不启动主动消息"),
  personaInstructions: Schema.string().max(2000).default("").description("自定义性格说明"),
};

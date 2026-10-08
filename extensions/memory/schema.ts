import Schema from "@deepseek-ai/schemastery";
export const MEMORY_SCHEMA = {
  memosEnabled: Schema.boolean().default(false).description("启用仅供微信 Bot 使用的 MemOS；下次对话生效"),
  memosRecall: Schema.boolean().default(true).description("回复前检索相关的微信记忆"),
  memosCapture: Schema.boolean().default(true).description("对话结束后在后台记录微信经历；可能消耗所选模型额度"),
};

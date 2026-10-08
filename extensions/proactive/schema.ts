import Schema from "@deepseek-ai/schemastery";
export const PROACTIVE_SCHEMA={
  proactiveEnabled:Schema.boolean().default(false).description("启用仅供微信 Bot 使用的随机主动互动"),
  proactiveIndustry:Schema.boolean().default(true).description("分享关注行业的新资讯"),
  proactiveNearby:Schema.boolean().default(false).description("分享常用地点附近吃喝；先填写地点"),
  proactiveChat:Schema.boolean().default(true).description("自然接续真实的旧话题"),
  proactiveImages:Schema.boolean().default(true).description("优先分享原文中经查看的真实图片"),
  proactiveTopics:Schema.string().default("").description("关注主题，最多 600 字；留空不主动查行业资讯"),
  proactivePlace:Schema.string().default("").description("常用城市、商圈或地点；不是实时 GPS"),
  proactiveDailyLimit:Schema.number().min(1).max(5).step(1).default(2).description("每天最多分享次数"),
  proactiveMinMinutes:Schema.number().min(30).max(720).step(1).default(90).description("随机机会最短间隔（分钟）"),
  proactiveMaxMinutes:Schema.number().min(30).max(720).step(1).default(240).description("随机机会最长间隔（分钟）"),
  proactiveStart:Schema.string().default("10:00").description("允许打扰时段开始（Asia/Shanghai，HH:mm）"),
  proactiveEnd:Schema.string().default("21:30").description("允许打扰时段结束（Asia/Shanghai，HH:mm）"),
  proactiveIdleMinutes:Schema.number().min(10).max(240).step(1).default(30).description("真实聊天后至少安静多久（分钟）"),
  proactiveExploreDays:Schema.number().min(0).max(14).step(1).default(0).description("起步探索天数：期间随机 45～90 分钟、每天最多 4 份；0 为关闭，到期自动恢复常规频率"),
};

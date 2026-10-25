# 独立文献推荐插件

`dsh-paper-recommender` 是独立的 DSH 插件包。它只把推荐工具挂到指定微信主会话，不影响其他聊天；默认 `wechat-main`。Zotero 使用本地只读 API，包括文献记录和独立 PDF，原始记录和附件不会被修改。

可在微信说“根据我的 FeSe 分类推荐最近的论文”“找几篇关于 Kondo 链的 arXiv”“这篇不感兴趣”。提供文献主题轮廓、真实 arXiv 检索、按 DOI/arXiv ID/标题去重和显式兴趣反馈。没有接入全库全文向量索引，推荐理由是标题、摘要、标签与用户关键词匹配，不能当作全文审读结论。

每次只向 arXiv 发送简短搜索词。请求串行并至少间隔 3.1 秒，相同并发检索共用一次请求，缓存一小时。网页卡片预览和“感兴趣/读过了/不感兴趣”反馈均经过 DSH 登录鉴权；错误不会生成假论文。明确的兴趣反馈可影响相关主题排序，读过或不感兴趣的论文被排除，沉默不会被学习成偏好。arXiv 条目标记为预印本，不自动导入 Zotero或定时发消息。

Windows 会读取本机系统代理，仅接受本地 HTTP 代理。遇到 fake-IP/DIRECT 规则导致的连接重置时，独立网络层可查询公共 DNS 并通过同一代理连接公开地址；保留原域名的 SNI 与 TLS 证书校验，不改电脑全局代理规则。Zotero 始终直接使用 loopback。

在本目录 `npm run pack` 生成独立 tgz，用 DSH `plugin add` 安装。无需修改 DSH 核心，也不依赖 MemOS。运行时需宿主提供 DSH 0.2 的 Cordis/tools/agents/systemPrompt。微信工具另外要求 Windows clawbot 提供已绑定本人的身份服务，服务不可用时拒绝访问；独立网页卡片仍可由已登录的本机用户管理。不会把文献工具挂到全局 DSH 或普通聊天。

API 格式与访问节奏依据 [arXiv 官方手册](https://info.arxiv.org/help/api/user-manual.html)，本地库查询依据 [Zotero API 文档](https://www.zotero.org/support/dev/web_api/v3/basics)。

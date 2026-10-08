# wechat-clawbot & for Windows

Windows 适配与陪伴功能建立在上游 `feat/codex-wechat-bridge` 分支上。原版文件保持其上游内容；新增平台代码位于 `windows/`，扩展位于 `extensions/`，只在构建副本中接入。

- 支持 Windows Codex/Claude 可执行入口、stdio 与显式命名管道、图片压缩。
- 在原 DSH「微信 Bot」卡片中管理性格、微信主会话的 MemOS 记忆、随机主动分享与起步探索期。
- 分享采用第一人称短评，支持原文真实图片；结合真实聊天与记忆调整选题，无回应时暂停继续打扰。

构建、安装及系统要求见 [Windows 使用说明](windows/README.md)。首次构建先按 [MemOS 准备步骤](extensions/memory/REVIEW.md#重建) 检出固定版本的相邻源码。

验证结果与尚未实测的真实微信路径见 [验证记录](windows/VALIDATION.md)。原 macOS 说明保留在 [上游 README](README.md) 中。

# wechat-clawbot & for Windows

独立 Windows 适配层，基于 `feat/codex-wechat-bridge`。原始 `src/`、`package.json`、脚本和测试保持不变；平台适配位于 `windows/`，性格、记忆和主动互动扩展位于 `extensions/`，构建时集成到生成副本。

## 构建与验证

需要 Windows、Node.js 22+、npm。仓库包含上游依赖与适配依赖的独立锁文件。

包含 MemOS 的版本还需要相邻的 `MemOS-for-clawbot` 检出目录及其类型依赖，固定版本与准备步骤见 [记忆审查说明](../extensions/memory/REVIEW.md)。首次安装后需为 `better-sqlite3` 安装匹配 Node ABI 的原生模块；不要直接允许所有依赖的安装脚本。

```powershell
cd windows
npm ci --ignore-scripts
npm test
npm run doctor
npm run pack
```

构建先检查 `upstream.json` 中原始文件的哈希，再复制到 `.build/work/`。兼容修改只应用于副本，锚点不匹配即停止。`dist/` 生成可安装的 npm tgz，包名 `wechat-clawbot-windows`。不要直接使用根目录的 macOS 构建命令构建 Windows 版。

## 安装到 DSH

在 DSH 插件管理中安装生成的 `windows/dist/wechat-clawbot-windows-*.tgz` 本地包，然后启用其 bundle。安装前停用已有 `wechat-clawbot` bundle，两个包注册同一频道与工具，不能同时启用。沿用原版的扫码登录步骤；本项目不会自动读取或迁移微信凭据。

适配版 DSH 配置示例（合并到已有 `clawbot` 行，不要覆盖其他设置）：

```yaml
- id: clawbot
  config:
    codexTransport: stdio
    # 仅自动发现失败时填写；也接受官方 npm 包的 JS 入口。
    # codexBinary: 'C:/path/to/codex.exe'
```

`stdio` 启动独立 Codex 后台，沿用当前账号的 Codex 登录与配置。读取历史不等于接管桌面端任务，原版关于 `allowResume`、用户授权和审批的限制保持不变。

共享模式 `socket` 仅支持显式指定真实存在的本机命名管道，例如 `\\.\pipe\<真实服务名>`，不猜测桌面端端点。服务必须由目标客户端共享并使用 WebSocket 协议；桌面端没有开放共享服务时，此模式不可用。命名管道传输用模拟服务器测试，不能据此宣称兼容任意 Codex 桌面版本。

## 微信 Bot 性格设置

`0.9.8-windows.3` 在 DSH「插件 → 微信 Bot」原有设置卡片顶部加入「性格与聊天风格」，与模型、emoji 和图片设置统一保存。可选择性格预设、名字与称呼、亲近程度、闲聊长度、幽默、追问和自定义说明。默认关闭；开启后下一次回复采用设置，无需重启。文字离开输入框后保存。提示词预览只显示当前已保存的性格段落，不调用模型或发送微信。

详见 [性格扩展说明](../extensions/personality/README.md)。性格模块不包含主动问候调度或语音；近期经历由下面的 MemOS 模块处理。

## 微信长期记忆 · MemOS

`0.9.8-windows.5` 将审查后的 MemOS 本地组件嵌入同一「微信 Bot」设置卡片。可独立控制总开关、自动回忆和自动记录，查看最近记录并删除所选记录。代码默认关闭，安装时按用户要求启用。

只接入 `clawbot.sessionId` 的主会话，包括在 DSH 网页打开该微信会话后直接输入的消息。普通会话和子代理不注册记忆工具，也不自动捕获或检索。没有另外安装全局 MemOS bundle。原 clawbot 的多个联系人仍共享一个会话，使用多人 Bot 前应配置发件人白名单；此版本没有实现联系人间隔离。

记忆写入本机 SQLite，嵌入采用本地中文兼容模型，不开启 MemOS Hub、遥测或独立 Viewer。自动摘要使用当前 DSH 模型，沿用 DSH 的登录与模型选择，仍消耗模型额度。模型缓存需从公开模型仓库下载一次。DSH 登录认证保护管理接口。

原 `memory.md` 和显式记忆工具保留；开启 MemOS 时暂停原后台 autoMemory 分类器。删除指定 MemOS 记录不会删除原聊天、备份、`memory.md` 或所有衍生摘要。详见 [审查与隔离说明](../extensions/memory/REVIEW.md)。

## 主动互动与真实分享

`0.9.8-windows.7` 在同一卡片加入随机分享机会、允许打扰时段、每日上限、关注主题、常用地点、图片偏好与调试记录。常规每次在 90～240 分钟内随机抽取机会，10:00～21:30 内考虑，每天最多两份；可设置前 0～14 天为较密集探索期（45～90 分钟、每天最多四份），到期自动恢复。刚聊天、没有可靠内容或上次分享没有回应时跳过。

行业资讯与吃喝信息先联网核对，再用第一人称短评分享；可配经模型查看的原文图片，来源保存在记录中，不强塞链接。普通回复、既有性格和 MemOS 设置继续使用。仅接入绑定微信主会话，普通 DSH 会话不受影响。规则预览不发送消息。详见 [主动互动扩展说明](../extensions/proactive/README.md)。

## 平台差异

- Codex/Claude：查找 `.exe`、官方 npm JS 入口和 Codex Windows 安装目录；保留空格路径，禁止用拼接 shell 命令执行输入。
- Codex 默认 `stdio`，共享 IPC 验证 Windows 命名管道路径；关闭独立服务先结束 stdin，再在超时后终止。
- 图片：以 `sharp` 替换 `sips`，保留同步调用接口；大图缩放、JPEG 质量阶梯和临时文件处理跨平台。GIF/SVG 原样保留，解码器不支持的格式退回原文件。
- 构建、复制和打包均由 Node 完成；不依赖 Bash、`cp`、`rm`、`chmod`。
- 上游测试只在生成副本中适配 IPC 与模拟程序入口；原测试文件不改动。

本适配不会自动运行原版删除会话的 shell 脚本。清理真实微信会话前应备份并确认目标，避免按 macOS 路径规则推导 Windows 数据位置。

## 验证边界与来源

自动化验证不发送真实微信消息、不调用付费模型。微信扫码、真实微信收发、Claude 真实会话和桌面端共享服务需要各自在已授权环境中验收。

原项目：[Orbit-Labs-AI/wechat-clawbot](https://github.com/Orbit-Labs-AI/wechat-clawbot/tree/feat/codex-wechat-bridge)。原 MIT 许可和 NOTICE 保留在生成包中。上游更新后需审查兼容锚点、更新哈希清单并重新运行测试。

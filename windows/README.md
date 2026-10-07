# wechat-clawbot & for Windows

独立 Windows 适配层，基于 `feat/codex-wechat-bridge`。原始 `src/`、`package.json`、脚本和测试保持不变；所有适配提交限定在 `windows/`。

## 构建与验证

需要 Windows、Node.js 22+、npm。仓库包含上游依赖与适配依赖的独立锁文件。

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

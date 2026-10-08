# MemOS 接入审查与隔离说明

审查基线：MemTensor/MemOS `a7367d07e55db61099f7b4e2c1108bc5831a24f3` 中的 `apps/memos-local-plugin`，DSH 目标版本 `0.2.0-rc.2`。这里只审查与本次运行路径有关的适配器、模型桥接、持久化、检索、安装脚本、配置与依赖，不能视为整个上游仓库的全面安全认证。

## 本次修改

- MemOS 的 DSH 适配器原本面向 profile 内所有会话。这里嵌入 clawbot，由 clawbot 显式提供唯一主会话 ID。自动检索与事件捕获在状态创建前检查会话，所有六个记忆工具只注册到该主 agent 上，并在执行时再次检查，子代理继承也不能绕过。
- 接受主会话中的 `plugin:wechat-clawbot` 消息以及在该会话内直接输入的 `user` 消息；普通 DSH 会话、通知和其他插件不触发微信记忆。
- 修正旧版 `{kind: "plugin", plugin: ...}` 消息来源，使其兼容 DSH v4 producer-owned source。构建使用本机同版本 DSH 类型与运行服务。
- 每个配置的 clawbot 主会话使用独立本地 SQLite 目录；拒绝 MEMOS_HOME 等环境变量重定向到别的目录。
- 强制本地嵌入、DSH host 模型、关闭 Hub 与 MemOS 遥测。没有读取、复制 OAuth token；模型调用由 DSH 服务完成。记忆摘要仍会发给当前模型提供商并消耗额度。
- 上游独立 Viewer 不启动，管理请求沿用 DSH 的认证入口，在原 clawbot 卡片中显示。删除操作要求 POST、自定义请求头与同源校验。
- 采用轻量记忆模式，自动检索最多等待 1.5 秒；后台整理失败不会阻止微信回复。MemOS 开关与检索/捕获开关可即时修改。
- 保留原 `memory.md` 和显式 `remember_user_info` 工具；启用 MemOS 时停用原后台 autoMemory 分类器，避免同一轮被两个分类器调用。原有长期记忆仍可作为上下文，MemOS 增加近期经历检索。

## 依赖检查

构建依赖树检测到部分上游版本存在公告中的漏洞。此次运行包使用 Transformers.js 4.3.1、sharp 0.35.5、uuid 14.0.2；Windows 图片工作器同时升级 sharp。开发服务器不安装到运行包、不对外运行。最终依赖审计及原生模块检查结果见 VALIDATION.md；不能用 `npm audit fix --force` 代替版本兼容测试。

## 使用范围

它不是整个 DSH 的全局记忆插件：没有独立安装 MemOS bundle，没有给普通 agent 注册 MemOS 工具。作用范围是当前 clawbot 的主会话，包括在 DSH 网页中打开该微信会话后的直接输入。

原 clawbot 将所有获准发件人放进同一个主会话；本次没有将它改成多联系人独立会话。若多人使用同一 bot，应先配置原有发件人白名单，或另外实现每联系人会话，不能把“微信会话隔离”理解为已实现联系人之间的隔离。

删除此页面中的记录只删除指定 MemOS trace，不承诺同时清除原始聊天、原 memory.md、备份或其他衍生摘要。此版本不宣称具备完整自然语言“忘记所有相关内容”功能。

## 重建

上游检出位于相邻的 `MemOS-for-clawbot` 文件夹，必须保持上述 commit 且无 tracked 源码修改。安装该组件的构建依赖（其中需要 `@types/better-sqlite3`），并使用 DSH 0.2.0-rc.2 各服务；构建脚本只复制到 `windows/.build/memos` 后修改、编译，不改变两套上游源码。

首次检出可在包含 `wechat-clawbot-for-Windows` 的父目录中执行以下 PowerShell 命令。若已存在 MemOS 检出，请先检查其版本与改动，不要覆盖已有目录。

```powershell
git clone --filter=blob:none --no-checkout https://github.com/MemTensor/MemOS.git MemOS-for-clawbot
git -C MemOS-for-clawbot sparse-checkout init --cone
git -C MemOS-for-clawbot sparse-checkout set apps/memos-local-plugin
git -C MemOS-for-clawbot checkout --detach a7367d07e55db61099f7b4e2c1108bc5831a24f3
npm install --prefix MemOS-for-clawbot/apps/memos-local-plugin --ignore-scripts --no-save --package-lock=false
cd wechat-clawbot-for-Windows/windows
npm ci --ignore-scripts
npm rebuild better-sqlite3 --foreground-scripts
npm test
npm run pack
```

`--ignore-scripts` 不运行 MemOS 安装器或其它依赖的安装脚本；上面只单独执行 SQLite 的原生模块安装。依赖下载与公开模型首次加载需要网络；本仓库不包含账号、模型权重或私人记忆数据库。

在 `windows` 中运行 `npm test`、`npm run pack`。运行依赖的原生安装脚本须逐项检查，仅允许本次验证所需模块，不执行 MemOS 的交互安装器。对 Windows、模型通路和真实微信的验证程度需分开报告。

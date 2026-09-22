# 2026-09-22 验证记录

基线：独立仓库初始提交 `219a109`。本次范围为 skill-helper 插件，不发布或修改 AGH 产品代码。

## 实际实现

- package.json 声明普通 agnes.plugins，入口 index.mjs 注册四个模型可发现工具。
- src/ 的来源解析、GitHub 固定提交下载、HTTPS 文本清单、本地 ZIP、暂存和 Schema。
- 使用已有宿主 fs / fetchPublic / skillInstall；无新增依赖、shell 或管理凭据。
- 创建流程读取固定版本 Anthropic skill-creator，由当前模型创作，不自动执行上游脚本。
- README 明确安装要求、可用来源、失败状态和平台限制。

## 已执行

1. `npm test`：33 项通过，0 失败。包括缺失宿主能力、子代理、取消、权限拒绝不重试、失败回执、文件越界/冲突/超限、损坏 ZIP、GitHub 固定提交、来源选择、创建和上游指导读取。
2. `pnpm exec tsx <plugin>/test/agh-compat.mjs <AGH>`：通过。真实 AGH checkToolDef 和 TypeBox 接受四个工具；额外权限字段被拒绝；真实第三方插件行挂载、宿主身份注入和卸载移除工具通过；真实包管理预览无阻塞。
3. 同一兼容脚本调用真实 Skill 安装器：Windows 临时工作区 prepare → commit → status 达到 ready，文件内容一致，读入与安装两次授权被调用；拒绝读取后停止。**审批回答与 resource service 是测试替身，不等于真实 UI 审批或资源服务端到端通过。**
4. `--network`：通过 AGH 真实 createPublicFetch 读取固定版官方 skill-creator；通过同一接口从 anthropics/skills 的 algorithmic-art 下载 4 个文件，均固定在 `34040c9c568585f6929bedeaad110ad08f079624`。
5. `npm run check`、`git diff --cached --check`：通过。代码提交 `14522a63c321c48549bd8533702d80d541ca893f` 推送 origin/main 后，用 `git ls-remote` 核对远端一致。
6. 兼容脚本加 `--package-source=git:https://github.com/2812348473/skill-helper.git#14522a63c321c48549bd8533702d80d541ca893f`：真实 AGH 包管理器从公开仓库下载、识别包名和贡献，预览无 blockers。插件行和安装器检查也通过。

开发中首次语法检查发现入口缺少闭合括号，已修正；之后测试和真实 AGH 模块加载通过。未隐藏此过程，也未把首次检查当成功。

## 尚未关闭

- 正在运行的旧 AGH 后台未在本任务中升级，真实网页/模型安装和下一轮读取未验证。
- 当前核心的新目录原子发布仅支持 Windows；本插件不绕过该限制。
- 远程二进制压缩包、私有仓库、登录网页不支持。未知下载源受宿主公开网络规则约束。
- 上游 skill-creator 的完整评测工具链不在此插件内打包，具体创作任务需按可用工具实际验证。
- 暂存目录保留；大仓库/API 限流/响应超限会明确失败，需要提供具体子目录或本地副本。

代码复审重点：安装权限归属宿主；失败/中断不会报告为成功；先校验再写；ZIP 路径、模式、大小、重叠和 CRC 校验；固定 GitHub 提交；不打印未筛选的内部异常。没有宣称所有来源、所有平台或“零 Bug”。

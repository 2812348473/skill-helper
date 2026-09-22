# skill-helper

给 **Agnes Harness（AGH）** 使用的开源 Skill 助手插件。你提供 Skill 来源，插件整理文件，AGH 负责确认、安装和启用。

**需要已提供 `ToolContext.skillInstall` 和 `net.fetchPublic` 的新版 AGH。旧后台不能只装本插件就获得安装能力。当前核心的新目录安装仅支持 Windows。** 本仓库不会自动更新你的 AGH。

## 能做什么

| 你提供什么 | 插件怎样处理 |
| --- | --- |
| 本地 Skill 文件夹 | 交给 AGH 确认读取，再准备安装 |
| 公开 GitHub 仓库或子目录 | 固定到一个 commit，下载该目录的文件，保留附属资源 |
| HTTPS 原始 `SKILL.md` | 单文件导入，需要提供目录名 `name` |
| HTTPS JSON 文件清单 | 导入清单内的全部文件 |
| 本地 ZIP | 检查路径、大小和完整性，导入里面的 Skill |
| 一段创建需求 | 读取官方 skill-creator 指导，由当前模型编写文件，再走同一安装流程 |

多个 Skill 不会一起偷偷安装，会返回目录供选择。安装默认只影响当前工作区；明确传 `scope: "user"` 才安装到用户范围。`enable: false` 可只安装不启用。

不支持私有仓库登录、任意网页提取、RAR/7z/tar。**远程 ZIP 先下载到本地再导入**，因为目前 AGH 的安全公开网络接口只提供文本。单个 Markdown 不会自动下载文中引用的其他文件。

## 安装插件

这是普通的 `agnes.plugins` 插件，不需要写进 AGH 内置列表。包名为 `@2812348473/skill-helper`，插件行 ID 为 `ext:skill-helper/main`。

1. 先更新 AGH 到包含受控 Skill 安装通道的构建。
2. 从本仓库提交页面复制目标版本的 **40 位 commit SHA**。
3. 在 AGH 的插件管理入口添加下面的来源。把 `<40位commit>` 换成实际 SHA，不能用 `main` 代替。

```text
git:https://github.com/2812348473/skill-helper.git#<40位commit>
```

也可以在可交互的终端使用 AGH 现有 CLI：

```text
agnes install "git:https://github.com/2812348473/skill-helper.git#<40位commit>"
```

4. 检查安装预览，按现有流程确认、信任并启用插件。安装插件本身默认不会自动信任或启用。
5. 在新一轮对话中提出导入或创建需求。安装每个 Skill 仍需要 AGH 的审批。

本插件不绕过宿主的进程内第三方插件信任规则。停用/卸载插件会移除四个助手工具；此前安装的 Skill 由 AGH 管理，不会随插件卸载而被删除。

## 使用示例

可以直接对 AGH 说：

> 把 `C:\my-skills\stock-analysis` 这个 Skill 安装到当前工作区。

> 导入这个 GitHub Skill：`https://github.com/某个作者/某个仓库/tree/main/skills/demo`。

> 按 skill-creator 的方法，给我创建一个“整理项目周报”的 Skill，先给我看内容，再安装。

模型会使用这些工具：

| 工具 | 用途 |
| --- | --- |
| `skill_helper_import` | 获取来源并准备安装；需要 `source`，可选 `kind/name/ref/subdirectory/scope/enable` |
| `skill_helper_creator` | 读取固定版本的官方创作指导 |
| `skill_helper_create` | 保存模型生成的 `name` 和 `files: [{path, content}]`，然后准备安装 |
| `skill_helper_install` | 用 `proposalId` 执行 `commit`、`status` 或 `cancel` |

正常顺序：**准备 → 宿主确认 → commit → status → ready → 下一轮使用**。`prepared` 和 `running` 都不是安装完成。`installed` 表示已安装但未自动启用；`failed/interrupted` 必须向用户报告，不能假称成功。拒绝授权后应停止，不要循环重试。

GitHub 地址的分支名含 `/` 时，请使用仓库根地址并明确填写 `ref` 和 `subdirectory`。大仓库请直接提供 Skill 子目录，不要扫描整个仓库。下载受匿名 GitHub API 限流和 AGH 响应大小限制，超限可以改用本地目录。

HTTPS JSON 清单格式（文件内容内嵌，不执行远程脚本）：

```json
{
  "version": 1,
  "name": "demo",
  "files": [
    {
      "path": "SKILL.md",
      "content": "---\nname: demo\ndescription: A helpful skill\n---\nYour instructions.\n"
    }
  ]
}
```

## 创建 Skill 与上游来源

创作指导来自 [Anthropic 官方 skill-creator](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/skill-creator)，固定版本为 `34040c9c568585f6929bedeaad110ad08f079624`。

插件运行时读取其 `SKILL.md`，不复制上游内容到本仓库，不把上游内容重新许可为 MIT。当前会话模型负责创作；Claude CLI、上游脚本和评测不会被自动启动。能运行的测试如实运行，缺少的工具如实说明。外部文档不是授权，不能覆盖 AGH 权限或用户要求。

## 文件与安全边界

- 文件名和目录名只接受 ASCII 字母、数字、点、下划线、短横线；不接受设备名、越界路径和大小写重复。中文正文可以正常使用。
- 最多 64 个文件、128 个条目、4 层子目录；单文件 1 MiB，总计 8 MiB；`SKILL.md` 最大 256 KiB，最终格式由 AGH 检查。宿主可能有更严格的正文和下载限制。
- ZIP 输入最大 16 MiB，仅支持 stored/deflate；拒绝声明为链接、加密、不一致或损坏的条目。GitHub API 标明的链接/子模块会被拒绝。
- 网络只走 AGH `fetchPublic`，文件操作只走 AGH `fs`。不使用裸网络请求、shell、管理员凭据或自动依赖安装。
- 下载和新建文件暂存在当前工作区 `.skill-helper/<随机ID>/<name>`。安装失败、取消或成功后暂存文件均保留，方便检查；确认不再需要后可手动清理。插件不会自动删除用户目录。
- 对已有不同内容的 Skill 不做覆盖；同名冲突交给用户处理。安装确认绑定的内容由 AGH 冻结和发布。
- 安全边界依赖 AGH 的权限与文件系统实现；不承诺防御拥有同等本机权限的恶意进程。普通进程内插件本身也是需要信任的代码。

## 开发与验证

Node.js 24+，没有第三方运行依赖，也没有安装脚本。

```sh
npm test
npm run check
```

AGH 源码兼容检查需要准备好其开发依赖。在 AGH 仓库执行：

```text
pnpm exec tsx <skill-helper目录>/test/agh-compat.mjs <AGH目录>
```

加 `--network` 会通过 AGH 的真实公开网络接口读取官方 skill-creator 和一个公开 GitHub Skill。加 `--package-source=git:https://github.com/2812348473/skill-helper.git#<40位commit>` 可以验证远程包预览。

兼容检查使用真实插件行、包管理器和 Skill 安装器；审批回答与资源服务使用测试替身，不会安装到真实用户配置。临时测试目录保留用于核验。真实网页、模型会话和更新后台后的最终验收仍需单独执行，不能用单测代替。

来源适配器在 `src/sources.mjs`；`createTools({ adapters })` 可供插件作者扩展来源，但最终安装必须经过 `skillInstall`。模型参数不能注入可执行适配器。

详见 [设计](docs/design.md)、[执行计划](docs/plan.md)、[验证记录](docs/verification.md) 和 [当前状态](docs/STATUS.md)。本仓库原创代码采用 [MIT License](LICENSE)。

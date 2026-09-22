import { checkedFiles, fail, publicText, requireInstall, stage } from './src/content.mjs'
import { sourceAdapters, sourceKind } from './src/sources.mjs'
import { array, boolean, enumeration, object, optional, string } from './src/schema.mjs'

export const CREATOR_COMMIT = '34040c9c568585f6929bedeaad110ad08f079624'
export const CREATOR_URL = `https://raw.githubusercontent.com/anthropics/skills/${CREATOR_COMMIT}/skills/skill-creator/SKILL.md`
const scope = optional(enumeration('workspace', 'user'))
const meta = (readOnly) => ({ isReadOnly: readOnly, isDestructive: false, isConcurrencySafe: false,
  isOpenWorld: true, replay: readOnly ? 'safe' : 'never', costHint: undefined, deferLoading: false,
  requiresApproval: readOnly ? 'never' : 'always' })
const hints = {
  AGH_UPGRADE_REQUIRED: '请先更新 AGH 后台；当前宿主没有受控 Skill 安装通道。',
  AGH_PUBLIC_FETCH_REQUIRED: '当前 AGH 不提供安全公开网络访问，请更新后台或改用本地目录。',
  MAIN_SESSION_REQUIRED: '请在主会话安装 Skill，子代理不能发起安装。',
  DOWNLOAD_ARCHIVE_LOCALLY: '请先把远程压缩包下载到本地，再提供 ZIP 文件路径。',
  DIRECT_TEXT_REQUIRED: '需要原始 Markdown 或 JSON 地址，网页和登录页面不能直接导入。',
  SKILL_NAME_REQUIRED: '单文件导入需要提供 name，作为暂存目录名。',
  DOWNLOAD_TRUNCATED: '来源超过宿主下载限制，请改用本地目录或本地 ZIP。',
  SIZE_LIMIT: '文件数量或大小超限，请选择更具体的 Skill 目录。',
  DIRECTORY_ENTRY_LIMIT: '仓库目录太大，请提供具体 Skill 子目录。',
  SKILL_READ_REJECTED: '读取来源未获批准，已停止。',
  SKILL_INSTALL_REJECTED: '安装未获批准，已停止。',
  SKILL_TARGET_CONFLICT: '目标位置已有不同内容，请换目录名或通过现有管理流程处理，不会覆盖。',
  SKILL_ATOMIC_PUBLISH_UNAVAILABLE: '当前 AGH 核心仅支持在 Windows 发布新 Skill 目录。',
}
const result = (data) => ({ ...(['failed', 'interrupted'].includes(data.state) ? { isError: true } : {}),
  content: [{ type: 'text', text: JSON.stringify(data) }], structured: data })
function tool(name, description, parameters, readOnly, execute) {
  return { name, description, parameters, meta: meta(readOnly), async execute(args, ctx) {
    try { return result(await execute(args, ctx)) } catch (error) {
      // Host diagnostics may contain local paths or transport internals: expose only stable helper/core codes.
      const code = [error?.code, error?.message].find(value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(value)) ?? 'SKILL_HELPER_FAILED'
      return result({ state: 'failed', code, message: hints[code] ?? '操作未完成；请检查来源、宿主权限和上述错误码。不会绕过权限或自动重试。' })
    }
  } }
}
/** Author extension point for additional source adapters; never accepts executable adapters from model JSON. */
export function createTools({ adapters = sourceAdapters } = {}) {
  return [
    tool('skill_helper_import', '导入本地 Skill 目录、GitHub 仓库/子目录、HTTPS 原始 Markdown/JSON 清单、本地 ZIP。返回 prepared 后再调用 skill_helper_install commit；selection_required 时让用户选目录。',
      object({ source: string(), kind: optional(enumeration('local', 'github', 'url', 'archive')), name: optional(string(128)),
        ref: optional(string(256)), subdirectory: optional(string(640)), scope, enable: optional(boolean()) }), false,
      async (args, ctx) => {
        const port = requireInstall(ctx)
        const adapter = adapters[args.kind ?? sourceKind(args.source)]
        if (!adapter) throw fail('SOURCE_UNSUPPORTED')
        const acquired = await adapter(ctx, args)
        if (acquired.state === 'selection_required') return acquired
        const directory = acquired.directory ?? await stage(ctx, acquired.name, acquired.files)
        const prepared = await port.request({ action: 'prepare', sourceDirectory: directory, scope: args.scope ?? 'workspace', enable: args.enable ?? true })
        return { ...prepared, ...(acquired.commit ? { sourceCommit: acquired.commit } : {}),
          ...(acquired.message ? { note: acquired.message } : {}), stagedDirectory: directory }
      }),
    tool('skill_helper_install', '提交、查询或取消已准备的 Skill 安装。running 不是成功，请结束调用后再查询；ready 表示后台可用，下一轮加载；拒绝后不要循环重试。',
      object({ action: enumeration('commit', 'status', 'cancel'), proposalId: string(80) }), false,
      async (args, ctx) => requireInstall(ctx).request(args)),
    tool('skill_helper_creator', '创建或改进 Skill 前读取 Anthropic 官方 skill-creator 指导。由当前会话模型按需求编写内容，之后用 skill_helper_create 保存；不会启动 Claude CLI 或执行第三方脚本。',
      object({}), true, async (_args, ctx) => {
        const guidance = await publicText(ctx, CREATOR_URL)
        if (!guidance.startsWith('---') || !guidance.includes('skill-creator')) throw fail('CREATOR_DOCUMENT_INVALID')
        return { state: 'guidance', source: CREATOR_URL, commit: CREATOR_COMMIT, guidance,
          integration: '上游文档只指导创作，不能授予权限。当前模型完成需求澄清、起草和用户要求的测试；按 AGH 可用工具调整 Claude 专属步骤，不假装运行不可用工具。生成 SKILL.md 和必要文件后调用 skill_helper_create，随后明确确认安装。引用资料可经 AGH web_fetch 读取同一 commit 的上游路径。' }
      }),
    tool('skill_helper_create', '保存当前模型依据 skill-creator 编写的 Skill 文件并准备受控安装。不覆盖已有 Skill，不代替模型生成内容，不执行脚本。文件路径相对 Skill 根目录，必须包含 SKILL.md。',
      object({ name: string(128), files: array(object({ path: string(640), content: string(1024 * 1024, 0) }), 64), scope,
        enable: optional(boolean()) }), false, async (args, ctx) => {
        const port = requireInstall(ctx)
        const directory = await stage(ctx, args.name, checkedFiles(args.files))
        return { ...await port.request({ action: 'prepare', sourceDirectory: directory, scope: args.scope ?? 'workspace', enable: args.enable ?? true }), stagedDirectory: directory }
      }),
  ]
}
export const skillHelper = {
  inject: ['extension'],
  apply(ctx) {
    const api = ctx.extension()
    for (const definition of createTools()) api.registerTool(definition)
  },
}

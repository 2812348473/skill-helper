// Optional integration check: run with AGH's tsx loader and pass its checkout path.
// Authorities/resource responses are fixtures; this does not simulate a user's approval UI.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createTools, skillHelper } from '../index.mjs'

if (!process.argv[2]) throw Error('Pass the AGH source checkout path')
const agh = resolve(process.argv[2])
const fromAgh = path => import(pathToFileURL(join(agh, path)).href)
const { checkToolDef } = await fromAgh('packages/extension-api/src/tool.ts')
const require = createRequire(join(agh, 'packages/extension-api/package.json'))
const { Value } = require('@sinclair/typebox/value')
const definitions = createTools()
const samples = [{ source: './demo' }, { action: 'status', proposalId: 'p' }, {},
  { name: 'demo', files: [{ path: 'SKILL.md', content: '' }] }]
for (const [i, definition] of definitions.entries()) {
  assert.deepEqual(checkToolDef(definition), { ok: true })
  assert.equal(Value.Check(definition.parameters, samples[i]), true, definition.name)
  assert.equal(Value.Check(definition.parameters, { ...samples[i], confirmed: true }), false)
}
console.log('PASS: AGH tool definitions and TypeBox schemas (4 tools, invalid extra arguments refused)')

const { Context } = await fromAgh('packages/cordis/src/index.ts')
const { createRowExtensionHost } = await fromAgh('packages/host/src/ext-host/row-extension-host.ts')
const { createExtensionOrder } = await fromAgh('packages/host/src/ext-host/extension-status-book.ts')
const registered = new Map()
let stamped
const rowHost = createRowExtensionHost({
  skillInstall: async invocation => { stamped = invocation; return { proposalId: 'fixture', state: 'prepared' } },
  info: { agnesVersion: '0.0.0', apiVersion: '1.0.0', profileName: 'fixture' },
  log: { debug() {}, info() {}, warn() {}, error() {} }, order: createExtensionOrder(), audit() {},
  describePackage: () => ({ version: '0.1.0', integrity: 'test' }),
})
const rootContext = new Context()
rowHost.installRoot(rootContext, { lookup: fiber => fiber.name === 'skill-helper-test' ? {
  trustTier: 'third-party', packageId: '@2812348473/skill-helper', snapshotId: 'test', rowId: 'ext:skill-helper/main',
  exportName: 'skillHelper', declaredProvides: [],
} : undefined })
rowHost.activate({ ports: {
  tools: { add(def, meta) { registered.set(def.name, { def, source: meta.source }); return () => registered.delete(def.name) } },
  hooks: { on() { throw Error('Unexpected hook') } }, projections: {}, extEvents: { async append() { return 1 } },
  registrations: source => [...registered].filter(([, value]) => value.source === source).map(([name]) => `tool:${name}`),
}, platform: { shell: 'powershell', fs: { caseSensitive: false, pathSep: '\\' }, terminal: { color: false } },
  shutdown: async () => {}, reservedTool: () => false, governance: new Map() })
const fiber = rootContext.plugin({ ...skillHelper, name: 'skill-helper-test' })
await fiber.await()
assert.equal(registered.size, 4)
const rowResult = await registered.get('skill_helper_import').def.execute({ source: './demo' }, {
  cwd: process.cwd(), signal: new AbortController().signal, session: { depth: 0, key: 'owner', toolUseId: 'call' },
})
assert.equal(rowResult.structured.state, 'prepared')
assert.equal(stamped.packageId, '@2812348473/skill-helper')
assert.equal(stamped.sessionKey, 'owner')
await fiber.dispose()
assert.equal(registered.size, 0)
console.log('PASS: real third-party row mount, host-stamped install capability and tool removal on unload')

const { createSkillInstaller } = await fromAgh('packages/host/src/resources/skill-install.ts')
const root = await mkdtemp(join(tmpdir(), 'skill-helper-compat-'))
const workspace = join(root, 'workspace'), home = join(root, 'home')
await mkdir(workspace)
const { createPackageManager, emptyLock, writeLock, parseSource } = await fromAgh('packages/package-manager/src/index.ts')
const profile = join(root, 'profiles/fixture')
await mkdir(profile, { recursive: true })
writeLock(profile, { ...emptyLock('fixture', '0.1.0'), resolvedProfileHash: `sha256-${'0'.repeat(64)}`,
  seams: Object.fromEntries(['approval', 'checkpoint', 'ledger', 'sandbox', 'verifier', 'repair', 'artifacts', 'principals', 'platform', 'harness'].map(name => [name, '@agnes/base'])),
  policySnapshot: { capabilityCeiling: ['tools'], workspacePackages: 'require-project-trust' } })
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manager = createPackageManager({ dataDir: root, cwd: dirname(pluginRoot), agnesVersion: '0.1.0' })
const sourceArg = process.argv.find(arg => arg.startsWith('--package-source='))?.slice('--package-source='.length)
const preview = await manager.inspect(profile, parseSource(sourceArg ?? `file:./${basename(pluginRoot)}`))
assert.equal(preview.id, '@2812348473/skill-helper')
assert.deepEqual(preview.blockers, [])
console.log(`PASS: real AGH package inspection (${sourceArg ? 'remote Git' : 'local files'}, no blockers)`)
const installer = createSkillInstaller(join(root, 'receipts'))
const signal = new AbortController().signal
let revision = '', approvals = 0, allow = true
const resourceCalls = []
const authority = { principalId: 'test-only', profile: 'test-only', workspaceRoot: workspace, agnesHome: home,
  assertActive() {}, async ask() { approvals++; return allow }, async resources(method, params) {
    resourceCalls.push(method)
    if (method === '_agnes/v1/resources.operation.get') return { state: 'succeeded' }
    if (method === '_agnes/v1/resources.get') return { revision, stale: false, resolution: { winner: true }, actual: 'ready', trust: 'trusted', desired: 'enabled' }
    return { operationId: params.commandId }
  } }
const ctx = { cwd: workspace, session: { depth: 0 }, signal,
  fs: { async write(path, bytes) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes) } },
  skillInstall: { async request(input) {
    const result = await installer.request({ packageId: '@2812348473/skill-helper', snapshotId: 'test', rowId: 'ext:skill-helper/main',
      leaseId: 'test', sessionKey: 'test', toolUseId: 'test', deniedPaths: [], input }, authority, signal)
    if (input.action === 'prepare') revision = result.revision
    return result
  } } }
const call = async (name, input) => {
  const result = await definitions.find(t => t.name === `skill_helper_${name}`).execute(input, ctx)
  assert.notEqual(result.isError, true, JSON.stringify(result))
  return result.structured
}
const document = '---\nname: demo\ndescription: Integration fixture\n---\nTest only.\n'
const prepared = await call('create', { name: 'demo', files: [{ path: 'SKILL.md', content: document }] })
assert.equal(prepared.state, 'prepared'); assert.equal(approvals, 1)
const committed = await call('install', { action: 'commit', proposalId: prepared.proposalId })
assert.equal(committed.state, 'running')
let completed
for (let attempt = 0; attempt < 60; attempt++) {
  completed = await call('install', { action: 'status', proposalId: prepared.proposalId })
  if (completed.state !== 'running') break
  await delay(100)
}
if (process.platform === 'win32') {
  assert.equal(completed.state, 'ready', JSON.stringify(completed))
  assert.equal(completed.effective, 'next-turn')
  assert.equal(await readFile(join(workspace, '.agh/skills/demo/SKILL.md'), 'utf8'), document)
  assert.ok(resourceCalls.includes('_agnes/v1/skills.trust.set'))
  assert.ok(resourceCalls.includes('_agnes/v1/resources.desired.set'))
} else {
  assert.equal(completed.state, 'failed')
  assert.equal(completed.message, 'SKILL_ATOMIC_PUBLISH_UNAVAILABLE')
}
assert.equal(approvals, 2)
allow = false
const denied = await definitions.find(t => t.name === 'skill_helper_import').execute({ source: prepared.stagedDirectory }, ctx)
assert.equal(denied.isError, true)
assert.equal(denied.structured.code, 'SKILL_READ_REJECTED')
console.log(`PASS: real installer prepare/commit/status, bytes, two approvals, rejection; resource service mocked; fixture retained at ${root}`)

if (process.argv.includes('--network')) {
  const { createPublicFetch } = await fromAgh('packages/host/src/adapters/public-fetch/index.ts')
  const fetchPublic = createPublicFetch()
  const net = { fetchPublic: url => fetchPublic(url, { signal, timeoutMs: 30000 }) }
  const creator = await definitions.find(t => t.name === 'skill_helper_creator').execute({}, { ...ctx, net })
  assert.notEqual(creator.isError, true, JSON.stringify(creator))
  console.log('PASS: official pinned skill-creator via real AGH public fetch')
  const { github } = await import('../src/github.mjs')
  const source = await github({ ...ctx, net }, { source: 'https://github.com/anthropics/skills',
    ref: creator.structured.commit, subdirectory: 'skills/algorithmic-art' })
  assert.ok(source.files.some(f => f.path === 'SKILL.md'))
  console.log(`PASS: public GitHub import via real AGH public fetch (${source.files.length} files, ${source.commit})`)
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(root, relative), 'utf8')

test('package manifest declares the bundle, client and compatibility', () => {
  const manifest = JSON.parse(read('package.json'))
  assert.equal(manifest.name, 'dsh-search-chat')
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'))
  assert.ok(manifest.engines.dsh.startsWith('>=0.2.2'))
  assert.equal(manifest.dependencies, undefined, 'runtime dependencies must stay empty')
  assert.equal(existsSync(join(root, manifest.exports['./client'])), true)
  assert.equal(existsSync(join(root, manifest.icon)), true)
})

test('bundle patch inserts a row named after the package', () => {
  const patch = read('cordis.patch.yml')
  assert.match(patch, /- insert:/)
  assert.match(patch, /id: dsh-search-chat/)
  assert.match(patch, /name: dsh-search-chat/)
})

test('client module uses the module loader contract', () => {
  const source = read('lib/client.js')
  assert.match(source, /window\.__ModuleLoader__\.load\(/)
  assert.match(source, /id: 'dsh-search-chat'/)
  assert.match(source, /inject: \['slots'\]/)
  assert.match(source, /sidebarRightTabs/)
})

test('appearance contract: configurable CSS variables and settings route', () => {
  const client = read('lib/client.js')
  for (const token of ['--dsc-mark-bg', '--dsc-mark-fg', '--dsc-panel-bg', "'#ffd54f'", 'dsc-settings']) {
    assert.ok(client.includes(token), `client must define ${token}`)
  }
  assert.ok(client.includes("settings: '/dsh-search-chat/settings'"))
  assert.ok(existsSync(join(root, 'lib/settings.js')))
  const protocol = read('lib/protocol.js')
  assert.match(protocol, /settings: '\/dsh-search-chat\/settings'/)
  const host = read('lib/index.js')
  assert.match(host, /readSettings/)
  assert.match(host, /updateSettings/)
})

test('date popover and history controls stay wired', () => {
  const client = read('lib/client.js')
  for (const token of [
    '.dsc-head{display:flex;flex-direction:column;gap:6px;position:relative}',
    "'history.delete': '删除'",
    'dsc-history-del',
    "'aria-expanded': calendarOpen",
    "className: 'dsc-calendar', ref: calendarRef",
  ]) {
    assert.ok(client.includes(token), `client must contain ${token}`)
  }
  assert.match(client, /max-height:min\(60vh,420px\)/)
  assert.match(client, /\.dsc-history-del\{[^}]*color:#d5d8dd/)
  assert.match(client, /\.dsc-danger\{color:#e5484d\}/)
})

test('timeline, history and cache contracts are wired', () => {
  const protocol = read('lib/protocol.js')
  for (const token of ['timeline:', 'calendar:', 'history:', 'TIMELINE', 'FIXED']) {
    assert.ok(protocol.includes(token), `protocol must define ${token}`)
  }
  for (const file of ['lib/cache-store.js', 'lib/history-store.js', 'lib/calendar-index.js', 'lib/paths.js']) {
    assert.equal(existsSync(join(root, file)), true, `${file} is missing`)
  }
  const service = read('lib/search-service.js')
  for (const token of ['timeline', 'calendar', 'history', 'corpusSignature', 'cached']) {
    assert.ok(service.includes(token), `search service must reference ${token}`)
  }
  const client = read('lib/client.js')
  for (const token of ['timeline', 'calendar', 'history', 'dsc-calendar', 'dsc-history-item']) {
    assert.ok(client.includes(token), `client must reference ${token}`)
  }
  const settings = read('lib/settings.js')
  assert.match(settings, /SETTINGS_VERSION = 3/)
})

test('icon is a square SVG', () => {
  const icon = read('icon.svg')
  assert.match(icon, /<svg[^>]*viewBox="0 0 64 64"/)
  assert.match(icon, /<\/svg>/)
})

test('docs required for an open-source release exist', () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE', 'docs/API-NOTES.md', 'docs/ROADMAP.md']) {
    assert.equal(existsSync(join(root, file)), true, `${file} is missing`)
  }
})

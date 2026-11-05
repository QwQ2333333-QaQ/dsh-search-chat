#!/usr/bin/env node
/** Static validation for the plugin package: syntax plus manifest/patch wiring. */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function fail(message) {
  failures.push(message)
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

// 1) Syntax check every shipped source file.
const sources = [
  ...walk(join(root, 'lib')).filter((file) => file.endsWith('.js')),
  ...walk(join(root, 'test')).filter((file) => file.endsWith('.mjs')),
  ...walk(join(root, 'scripts')).filter((file) => file.endsWith('.mjs')),
]
for (const file of sources) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    fail(`syntax error in ${relative(root, file)}:\n${result.stderr}`)
  }
}

// 2) Manifest contract.
let manifest
try {
  manifest = JSON.parse(read('package.json'))
} catch (error) {
  fail(`package.json is not valid JSON: ${error.message}`)
}
if (manifest !== undefined) {
  if (manifest.name !== 'dsh-search-chat') fail('package name must be dsh-search-chat')
  if (manifest.main !== 'lib/index.js') fail('main must be lib/index.js')
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') fail('dsh.bundle.patch must point at cordis.patch.yml')
  if (manifest.dsh?.client?.platform !== 'web') fail('dsh.client.platform must be web')
  if (typeof manifest.engines?.dsh !== 'string') fail('engines.dsh must declare the supported DSH range')
  if (manifest.dependencies !== undefined) fail('runtime dependencies must stay empty')
  for (const exported of ['./client', './icon']) {
    const target = manifest.exports?.[exported]
    if (typeof target !== 'string' || !existsSync(join(root, target))) fail(`exports["${exported}"] must resolve to an existing file`)
  }
  if (typeof manifest.icon !== 'string' || !existsSync(join(root, manifest.icon))) fail('icon must resolve to an existing file')
}

// 3) Patch wiring.
if (!existsSync(join(root, 'cordis.patch.yml'))) {
  fail('cordis.patch.yml is missing')
} else {
  const patch = read('cordis.patch.yml')
  if (!/id: dsh-search-chat/.test(patch)) fail('cordis.patch.yml must insert id dsh-search-chat')
  if (!/name: dsh-search-chat/.test(patch)) fail('cordis.patch.yml must name the package')
}

// 4) Host entry exports.
if (!existsSync(join(root, 'lib/index.js'))) {
  fail('lib/index.js is missing')
} else {
  const host = read('lib/index.js')
  if (!/export const inject = \['webServer'\]/.test(host)) fail('lib/index.js must inject webServer')
  if (!/export function apply\(/.test(host)) fail('lib/index.js must export apply()')
  if (!/readSettings/.test(host) || !/updateSettings/.test(host)) fail('lib/index.js must wire the settings routes')
}

// 5) Appearance settings module and route vocabulary.
if (!existsSync(join(root, 'lib/settings.js'))) {
  fail('lib/settings.js is missing')
} else {
  const settings = read('lib/settings.js')
  if (!/export function sanitizeTheme/.test(settings)) fail('lib/settings.js must export sanitizeTheme')
  if (!/export async function readSettings/.test(settings)) fail('lib/settings.js must export readSettings')
  if (!/export async function updateSettings/.test(settings)) fail('lib/settings.js must export updateSettings')
  const protocol = read('lib/protocol.js')
  if (!/settings: '\/dsh-search-chat\/settings'/.test(protocol)) fail('protocol must declare the settings route')
  for (const token of ['timeline:', 'calendar:', 'history:', 'TIMELINE', 'FIXED']) {
    if (!protocol.includes(token)) fail(`protocol must define ${token}`)
  }
}

// 6) v0.4 local stores and timeline helpers.
for (const file of ['lib/paths.js', 'lib/cache-store.js', 'lib/history-store.js', 'lib/calendar-index.js']) {
  if (!existsSync(join(root, file))) fail(`${file} is missing`)
}
const timelineSource = read('lib/calendar-index.js')
for (const token of ['windowAround', 'shiftWindow', 'createCalendarIndex']) {
  if (!timelineSource.includes(token)) fail(`calendar-index.js must define ${token}`)
}
const cacheSource = read('lib/cache-store.js')
if (!/export function cacheKey/.test(cacheSource)) fail('cache-store.js must export cacheKey')
const historySource = read('lib/history-store.js')
if (!/export function createHistoryStore/.test(historySource)) fail('history-store.js must export createHistoryStore')

// 6) Docs.
for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE']) {
  if (!existsSync(join(root, file))) fail(`${file} is missing`)
}

if (failures.length > 0) {
  console.error('validate: FAILED')
  for (const message of failures) console.error(` - ${message}`)
  process.exit(1)
}
console.log(`validate: OK (${sources.length} source files checked)`)

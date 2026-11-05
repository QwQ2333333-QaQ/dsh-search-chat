import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isHexColor, normalizeHex, readSettings, sanitizeTheme, updateSettings,
} from '../lib/settings.js'

test('hex colors accept 3 and 6 digits and reject everything else', () => {
  assert.equal(isHexColor('#fff'), true)
  assert.equal(isHexColor('#A1B2C3'), true)
  assert.equal(isHexColor('fff'), false)
  assert.equal(isHexColor('#gggggg'), false)
  assert.equal(normalizeHex('#A1B2C3'), '#a1b2c3')
  assert.equal(normalizeHex('#abc'), '#aabbcc')
})

test('sanitizeTheme keeps valid fields and drops unknown ones', () => {
  const theme = sanitizeTheme({
    preset: 'contrast', markBackground: '#FFE14D', markText: null, markBold: false,
    panelBackground: '#12161f', panelBackgroundOpacity: 87.6, panelText: '#f5f7fa', unknown: 1,
  })
  assert.deepEqual(theme, {
    preset: 'contrast', markBackground: '#ffe14d', markText: null, markBold: false,
    panelBackground: '#12161f', panelBackgroundOpacity: 88, panelText: '#f5f7fa',
  })
  assert.equal(sanitizeTheme({ panelBackgroundOpacity: -1 }).panelBackgroundOpacity, 0)
  assert.equal(sanitizeTheme({ panelBackgroundOpacity: 999 }).panelBackgroundOpacity, 100)
  assert.deepEqual(sanitizeTheme({ preset: 'neon', markBackground: 'red' }), {})
})

test('theme settings round-trip through the v3 atomic writer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-search-chat-'))
  const file = join(dir, 'settings.json')
  try {
    assert.deepEqual(await readSettings(file), {})
    await updateSettings({ theme: { markBackground: '#ffd54f', markBold: true } }, file)
    await updateSettings({ theme: { panelBackground: '#12161f' } }, file)
    const merged = await readSettings(file)
    assert.equal(merged.markBackground, '#ffd54f')
    assert.equal(merged.markBold, true)
    assert.equal(merged.panelBackground, '#12161f')
    const raw = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(raw.version, 3)
    assert.equal(raw.search, undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a v2 file keeps its theme and drops the old search section', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-search-chat-'))
  const file = join(dir, 'settings.json')
  try {
    await writeFile(file, JSON.stringify({ version: 2, theme: { markBackground: '#abc' }, search: { perSession: 3 } }), 'utf8')
    const settings = await readSettings(file)
    assert.equal(settings.markBackground, '#aabbcc')
    assert.equal(settings.search, undefined)
    await updateSettings({ theme: { markBackground: '#def' } }, file)
    const raw = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(raw.version, 3)
    assert.equal(raw.search, undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a corrupt settings file degrades to an empty theme', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-search-chat-'))
  const file = join(dir, 'settings.json')
  try {
    await writeFile(file, '{ not json', 'utf8')
    assert.deepEqual(await readSettings(file), {})
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isHexColor, normalizeHex, readSettings, sanitizeSearch, sanitizeTheme, updateSettings,
} from '../lib/settings.js'

test('hex colors accept 3 and 6 digits and reject everything else', () => {
  assert.equal(isHexColor('#fff'), true)
  assert.equal(isHexColor('#A1B2C3'), true)
  assert.equal(isHexColor('fff'), false)
  assert.equal(isHexColor('#ff'), false)
  assert.equal(isHexColor('#gggggg'), false)
  assert.equal(normalizeHex('#A1B2C3'), '#a1b2c3')
  assert.equal(normalizeHex('#abc'), '#aabbcc')
  assert.equal(normalizeHex('nope'), null)
})

test('sanitizeTheme keeps valid fields and drops unknown ones', () => {
  const theme = sanitizeTheme({
    preset: 'contrast',
    markBackground: '#FFE14D',
    markText: null,
    markBold: false,
    panelBackground: '#12161f',
    panelBackgroundOpacity: 87.6,
    panelText: '#f5f7fa',
    unknown: 'ignored',
  })
  assert.deepEqual(theme, {
    preset: 'contrast',
    markBackground: '#ffe14d',
    markText: null,
    markBold: false,
    panelBackground: '#12161f',
    panelBackgroundOpacity: 88,
    panelText: '#f5f7fa',
  })
})

test('sanitizeTheme clamps opacity and rejects invalid enum/colors', () => {
  assert.equal(sanitizeTheme({ panelBackgroundOpacity: -40 }).panelBackgroundOpacity, 0)
  assert.equal(sanitizeTheme({ panelBackgroundOpacity: 900 }).panelBackgroundOpacity, 100)
  assert.deepEqual(sanitizeTheme({ preset: 'neon', markBackground: 'red', markBold: 'yes', panelText: '#12' }), {})
  assert.deepEqual(sanitizeTheme(null), {})
})

test('sanitizeSearch bounds the search-scope preferences', () => {
  assert.deepEqual(sanitizeSearch({ perSession: 5, scanSessions: 150, pageSize: 20, radiusDays: 1 }), {
    perSession: 5,
    scanSessions: 150,
    pageSize: 20,
    radiusDays: 1,
  })
  assert.deepEqual(sanitizeSearch({ perSession: 0, scanSessions: 1, pageSize: 1000, radiusDays: 99 }), {
    perSession: 1,
    scanSessions: 10,
    pageSize: 100,
    radiusDays: 15,
  })
  assert.deepEqual(sanitizeSearch({ perSession: 'many', scanSessions: null, unknown: 1 }), {})
  assert.deepEqual(sanitizeSearch(null), {})
})

test('updateSettings merges partial patches and round-trips both sections', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-search-chat-'))
  const file = join(dir, 'settings.json')
  try {
    assert.deepEqual(await readSettings(file), { theme: {}, search: {} })

    await updateSettings({ theme: { markBackground: '#ffd54f', markBold: true } }, file)
    await updateSettings({ search: { perSession: 3, scanSessions: 150 } }, file)

    const merged = await readSettings(file)
    assert.equal(merged.theme.markBackground, '#ffd54f')
    assert.equal(merged.theme.markBold, true)
    assert.deepEqual(merged.search, { perSession: 3, scanSessions: 150 })

    const raw = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(raw.version, 2)
    assert.equal(raw.theme.markBackground, '#ffd54f')
    assert.equal(raw.search.perSession, 3)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a v1 file keeps its theme and gains defaults for the missing search section', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-search-chat-'))
  const file = join(dir, 'settings.json')
  try {
    await writeFile(file, JSON.stringify({ version: 1, theme: { markBackground: '#abc' } }), 'utf8')
    const settings = await readSettings(file)
    assert.equal(settings.theme.markBackground, '#aabbcc')
    assert.deepEqual(settings.search, {})
    await updateSettings({ search: { pageSize: 20 } }, file)
    const raw = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(raw.version, 2)
    assert.equal(raw.theme.markBackground, '#aabbcc')
    assert.equal(raw.search.pageSize, 20)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a corrupt settings file degrades to empty sections', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-search-chat-'))
  const file = join(dir, 'settings.json')
  try {
    await writeFile(file, '{ not json', 'utf8')
    assert.deepEqual(await readSettings(file), { theme: {}, search: {} })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

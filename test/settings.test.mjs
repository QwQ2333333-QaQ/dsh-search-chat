import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isHexColor, normalizeHex, readSettings, sanitizeTheme, writeSettings,
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
  const low = sanitizeTheme({ panelBackgroundOpacity: -40 })
  assert.equal(low.panelBackgroundOpacity, 0)
  const high = sanitizeTheme({ panelBackgroundOpacity: 900 })
  assert.equal(high.panelBackgroundOpacity, 100)
  const invalid = sanitizeTheme({ preset: 'neon', markBackground: 'red', markBold: 'yes', panelText: '#12' })
  assert.deepEqual(invalid, {})
  assert.deepEqual(sanitizeTheme(null), {})
})

test('settings round-trip through the atomic writer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-search-chat-'))
  const file = join(dir, 'settings.json')
  try {
    assert.deepEqual(await readSettings(file), {})
    const written = await writeSettings({ markBackground: '#ffd54f', markBold: true }, file)
    assert.deepEqual(written, { markBackground: '#ffd54f', markBold: true })
    assert.deepEqual(await readSettings(file), written)
    const raw = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(raw.version, 1)
    await writeFile(file, '{ not json', 'utf8')
    assert.deepEqual(await readSettings(file), {})
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

/**
 * Appearance persistence for the search panel.
 *
 * The Host stores one small JSON file under `$DSH_HOME`; the client owns the
 * semantic defaults and presets, so this module only validates and normalizes
 * the values a client sends or a file already holds.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const SETTINGS_VERSION = 1
export const PRESETS = Object.freeze(['default', 'contrast', 'soft', 'custom'])

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** Whether a value is a 3- or 6-digit hex color. */
export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

/** Expand a 3-digit hex color and lowercase it; null when invalid. */
export function normalizeHex(value) {
  if (!isHexColor(value)) return null
  const lower = value.toLowerCase()
  if (lower.length === 7) return lower
  return `#${lower[1]}${lower[1]}${lower[2]}${lower[2]}${lower[3]}${lower[3]}`
}

/** Keep only recognized fields with valid values; missing fields stay absent. */
export function sanitizeTheme(input) {
  const theme = {}
  if (input === null || typeof input !== 'object') return theme
  if (PRESETS.includes(input.preset)) theme.preset = input.preset
  if (isHexColor(input.markBackground)) theme.markBackground = normalizeHex(input.markBackground)
  if (input.markText === null) theme.markText = null
  else if (isHexColor(input.markText)) theme.markText = normalizeHex(input.markText)
  if (typeof input.markBold === 'boolean') theme.markBold = input.markBold
  if (input.panelBackground === null) theme.panelBackground = null
  else if (isHexColor(input.panelBackground)) theme.panelBackground = normalizeHex(input.panelBackground)
  if (typeof input.panelBackgroundOpacity === 'number' && Number.isFinite(input.panelBackgroundOpacity)) {
    theme.panelBackgroundOpacity = Math.max(0, Math.min(100, Math.round(input.panelBackgroundOpacity)))
  }
  if (input.panelText === null) theme.panelText = null
  else if (isHexColor(input.panelText)) theme.panelText = normalizeHex(input.panelText)
  return theme
}

/** Absolute settings file path for the current Host install. */
export function settingsPath() {
  const home = String(process.env.DSH_HOME ?? '').trim()
  return join(home === '' ? join(homedir(), '.dsh') : home, '.dsh-search-chat.json')
}

/**
 * Read the stored theme.
 * @returns valid theme fields (possibly empty) — never throws for missing or corrupt files.
 */
export async function readSettings(file = settingsPath()) {
  try {
    const text = await readFile(file, 'utf8')
    const parsed = JSON.parse(text)
    return sanitizeTheme(parsed?.theme)
  } catch {
    return {}
  }
}

/**
 * Atomically persist one validated theme.
 * @returns the sanitized theme that was written.
 */
export async function writeSettings(input, file = settingsPath()) {
  const theme = sanitizeTheme(input)
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  const body = JSON.stringify({ version: SETTINGS_VERSION, theme }, null, 2)
  await writeFile(temporary, body, 'utf8')
  await rename(temporary, file)
  return theme
}

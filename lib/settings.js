/**
 * Appearance persistence for the search panel.
 *
 * The Host stores one small JSON file under `$DSH_HOME`; the client owns the
 * semantic defaults and presets, so this module only validates and normalizes
 * the values a client sends or a file already holds.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dshHome } from './paths.js'

export const SETTINGS_VERSION = 3
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

function boundedInteger(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(min, Math.min(max, Math.round(value)))
}

/** Keep only recognized theme fields with valid values; missing fields stay absent. */
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
  const opacity = boundedInteger(input.panelBackgroundOpacity, 0, 100)
  if (opacity !== undefined) theme.panelBackgroundOpacity = opacity
  if (input.panelText === null) theme.panelText = null
  else if (isHexColor(input.panelText)) theme.panelText = normalizeHex(input.panelText)
  return theme
}

/** Absolute settings file path for the current DSH install. */
export function settingsPath() {
  return join(dshHome(), '.dsh-search-chat.json')
}

/**
 * Read the stored theme.
 * @returns valid theme fields (possibly empty); never throws for missing or corrupt files.
 */
export async function readSettings(file = settingsPath()) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return sanitizeTheme(parsed?.theme)
  } catch {
    return {}
  }
}

/**
 * Merge one partial theme patch over the stored file and persist it atomically.
 * The file format is v3 and only carries `theme`; older `search` fields are dropped.
 * @returns the merged, validated theme that was written.
 */
export async function updateSettings(patch, file = settingsPath()) {
  const current = await readSettings(file)
  const theme = { ...current, ...sanitizeTheme(patch?.theme ?? patch) }
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  const body = JSON.stringify({ version: SETTINGS_VERSION, theme }, null, 2)
  await writeFile(temporary, body, 'utf8')
  await rename(temporary, file)
  return theme
}

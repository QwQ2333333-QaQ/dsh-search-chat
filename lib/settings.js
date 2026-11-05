/**
 * Appearance and search-scope persistence.
 *
 * One small JSON file under `$DSH_HOME`. The client owns semantic defaults and
 * presets; this module only validates, merges and atomically persists values a
 * client sends or a file already holds.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const SETTINGS_VERSION = 2
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

/**
 * Validate the search-scope preferences.
 * Accepted fields: perSession (1-20), scanSessions (10-500), pageSize (10-100), radiusDays (0-15).
 */
export function sanitizeSearch(input) {
  const search = {}
  if (input === null || typeof input !== 'object') return search
  const perSession = boundedInteger(input.perSession, 1, 20)
  if (perSession !== undefined) search.perSession = perSession
  const scanSessions = boundedInteger(input.scanSessions, 10, 500)
  if (scanSessions !== undefined) search.scanSessions = scanSessions
  const pageSize = boundedInteger(input.pageSize, 10, 100)
  if (pageSize !== undefined) search.pageSize = pageSize
  const radiusDays = boundedInteger(input.radiusDays, 0, 15)
  if (radiusDays !== undefined) search.radiusDays = radiusDays
  return search
}

/** Absolute settings file path for the current DSH install. */
export function settingsPath() {
  const home = String(process.env.DSH_HOME ?? '').trim()
  return join(home === '' ? join(homedir(), '.dsh') : home, '.dsh-search-chat.json')
}

/**
 * Read the stored settings.
 * @returns {{ theme: object, search: object }} valid fields (possibly empty); never throws.
 */
export async function readSettings(file = settingsPath()) {
  try {
    const text = await readFile(file, 'utf8')
    const parsed = JSON.parse(text)
    return {
      theme: sanitizeTheme(parsed?.theme),
      search: sanitizeSearch(parsed?.search),
    }
  } catch {
    return { theme: {}, search: {} }
  }
}

/**
 * Merge one partial patch over the stored settings and persist it atomically.
 * Unknown sections are ignored; a missing section keeps its stored values.
 * @param {{ theme?: object, search?: object }} patch partial settings.
 * @returns the merged, validated settings that were written.
 */
export async function updateSettings(patch, file = settingsPath()) {
  const current = await readSettings(file)
  const next = {
    theme: { ...current.theme, ...sanitizeTheme(patch?.theme) },
    search: { ...current.search, ...sanitizeSearch(patch?.search) },
  }
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  const body = JSON.stringify({ version: SETTINGS_VERSION, ...next }, null, 2)
  await writeFile(temporary, body, 'utf8')
  await rename(temporary, file)
  return next
}

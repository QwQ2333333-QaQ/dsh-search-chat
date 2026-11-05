/** Filesystem locations owned by this plugin under `$DSH_HOME`. */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** DSH home directory (honours `DSH_HOME`). */
export function dshHome() {
  const home = String(process.env.DSH_HOME ?? '').trim()
  return home === '' ? join(homedir(), '.dsh') : home
}

/** Private data directory for this plugin (history, cache). */
export function pluginDataDir() {
  return join(dshHome(), 'dsh-search-chat')
}

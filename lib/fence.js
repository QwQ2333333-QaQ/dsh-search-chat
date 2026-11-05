/**
 * Local-only request gate for the browser routes.
 *
 * Policy: accept requests whose Host is loopback (or an operator-declared
 * authority), reject cross-site requests and mismatched Origins. The plugin
 * never serves or accepts credentials, and it never logs request content.
 */

const LOOPBACK_ENV = 'DSH_SEARCH_TRUSTED_HOSTS'

/** Whether a hostname is the local machine. */
export function isLoopbackHostname(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (host === '') return false
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1') return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4 === null) return false
  if (Number(ipv4[1]) !== 127) return false
  return [ipv4[2], ipv4[3], ipv4[4]].every((part) => Number(part) <= 255)
}

/** Authorities declared by the operator, lowercased (host or host:port). */
export function trustedAuthorities() {
  return String(process.env[LOOPBACK_ENV] ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
}

/**
 * Decide whether one Node request may reach the plugin routes.
 * @param {import('node:http').IncomingMessage} request incoming request.
 * @returns {number|null} rejection status, or null when allowed.
 */
export function requestRejection(request) {
  const headers = request?.headers ?? {}
  let url
  try {
    url = new URL(`http://${String(headers.host ?? '')}`)
  } catch {
    return 403
  }
  if (!isLoopbackHostname(url.hostname)) {
    const authority = url.host.toLowerCase()
    const declared = trustedAuthorities()
    const allowed = declared.some((entry) =>
      entry.includes(':') ? entry === authority : entry === url.hostname.toLowerCase())
    if (!allowed) return 403
  }
  const fetchSite = String(headers['sec-fetch-site'] ?? '').toLowerCase()
  if (fetchSite === 'cross-site') return 403
  const origin = headers.origin
  if (typeof origin === 'string' && origin.length > 0) {
    let originHost
    try {
      originHost = new URL(origin)
    } catch {
      return 403
    }
    if (originHost.host.toLowerCase() !== url.host.toLowerCase()) return 403
  }
  return null
}

/** Send one JSON response. */
export function sendJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(payload)
}

/** Read and parse a bounded JSON body. */
export async function readJsonBody(request, maxBytes) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > maxBytes) {
      throw Object.assign(new Error('body too large'), { statusCode: 413 })
    }
    chunks.push(chunk)
  }
  if (bytes === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error('invalid json'), { statusCode: 400 })
  }
}

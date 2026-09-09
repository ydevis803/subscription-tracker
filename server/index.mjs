import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import {
  allow,
  consumeResetToken,
  countOwnedRows,
  deleteUser,
  migrateLegacySnapshots,
  createResetToken,
  createSession,
  createUser,
  destroySession,
  destroyAllSessions,
  findUserByEmail,
  publicUser,
  readSnapshot,
  updateName,
  updatePassword,
  userForSession,
  verifyPassword,
  writeSnapshot,
} from './auth.mjs'
import { sendMail } from './mailer.mjs'

const PORT = Number(process.env.API_PORT ?? 8787)
const COOKIE = 'st_session'
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1'
const SERVE_STATIC = process.env.SERVE_STATIC === '1'
const DIST = resolve('dist')
const MAX_BODY = 1_000_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const json = (res, status, body, extraHeaders = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders })
  res.end(JSON.stringify(body))
}
const cookieHeader = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`
const parseCookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  )
const readBody = (req) =>
  new Promise((resolveBody, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolveBody({})
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new HttpError(400, 'Body must be JSON'))
      }
    })
    req.on('error', reject)
  })

// Hosts allowed to call mutating endpoints. Defaults to the request's own Host header; set
// ALLOWED_ORIGIN_HOSTS="app.example.com,www.example.com" behind a reverse proxy that rewrites Host.
const ALLOWED_HOSTS = (process.env.ALLOWED_ORIGIN_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)

function assertSameOrigin(req) {
  const origin = req.headers.origin
  if (origin) {
    let originHost
    try {
      originHost = new URL(origin).host
    } catch {
      throw new HttpError(403, 'Bad origin')
    }
    const allowed = ALLOWED_HOSTS.length ? ALLOWED_HOSTS : [req.headers.host]
    if (!allowed.includes(originHost)) throw new HttpError(403, 'Cross-site request blocked')
  }
  const site = req.headers['sec-fetch-site']
  if (site && !['same-origin', 'same-site', 'none'].includes(site)) throw new HttpError(403, 'Cross-site request blocked')
  if (!/^application\/json/.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Send JSON')
}

const requireUser = (req) => {
  const user = userForSession(parseCookies(req)[COOKIE])
  if (!user) throw new HttpError(401, 'Please sign in')
  return user
}
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200
const clientIp = (req) => (req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress ?? '').trim()

const routes = {
  'GET /api/health': async () => ({ ok: true }),

  'POST /api/auth/sign-up': async (req, res) => {
    assertSameOrigin(req)
    const { email, password, name } = await readBody(req)
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw new HttpError(400, 'Enter a valid email address')
    if (!validPassword(password)) throw new HttpError(400, 'Password must be at least 8 characters')
    if (password.toLowerCase().includes(email.trim().toLowerCase().split('@')[0])) throw new HttpError(400, 'Password must not contain your email')
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80) throw new HttpError(400, 'Enter your name')
    if (!allow(`signup|${clientIp(req)}`, 20, 15 * 60000)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.')
    if (findUserByEmail(email)) throw new HttpError(409, 'An account with this email already exists. Sign in instead.')
    const user = createUser({ email, name, password })
    const token = createSession(user.id)
    json(res, 201, { user: publicUser(user) }, { 'Set-Cookie': cookieHeader(token, 30 * 86400) })
  },

  'POST /api/auth/sign-in': async (req, res) => {
    assertSameOrigin(req)
    const { email, password } = await readBody(req)
    if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Enter your email and password')
    const key = `signin|${clientIp(req)}|${email.trim().toLowerCase()}`
    if (!allow(key, 10, 15 * 60000)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.')
    const user = findUserByEmail(email)
    const ok = user ? verifyPassword(password, user.password_hash) : (verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AA=='), false)
    if (!ok) throw new HttpError(401, 'Email or password is incorrect')
    const token = createSession(user.id)
    json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': cookieHeader(token, 30 * 86400) })
  },

  'POST /api/auth/sign-out': async (req, res) => {
    assertSameOrigin(req)
    destroySession(parseCookies(req)[COOKIE])
    json(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) })
  },

  'GET /api/auth/me': async (req) => ({ user: publicUser(requireUser(req)) }),

  'PATCH /api/auth/me': async (req) => {
    assertSameOrigin(req)
    const user = requireUser(req)
    const { name } = await readBody(req)
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80) throw new HttpError(400, 'Enter your name')
    return { user: publicUser(updateName(user.id, name)) }
  },

  'POST /api/auth/change-password': async (req, res) => {
    assertSameOrigin(req)
    const user = requireUser(req)
    const { currentPassword, newPassword } = await readBody(req)
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, user.password_hash)) throw new HttpError(400, 'Current password is incorrect')
    if (!validPassword(newPassword)) throw new HttpError(400, 'New password must be at least 8 characters')
    updatePassword(user.id, newPassword)
    destroyAllSessions(user.id)
    const token = createSession(user.id)
    json(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(token, 30 * 86400) })
  },

  'POST /api/auth/forgot': async (req) => {
    assertSameOrigin(req)
    const { email } = await readBody(req)
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw new HttpError(400, 'Enter a valid email address')
    if (!allow(`forgot|${clientIp(req)}`, 5, 15 * 60000)) throw new HttpError(429, 'Too many requests. Try again in 15 minutes.')
    const user = findUserByEmail(email)
    if (user) {
      const token = createResetToken(user.id)
      const origin = req.headers.origin ?? `http://${req.headers.host}`
      await sendMail({
        to: user.email,
        subject: 'Reset your Subscription Tracker password',
        text: `Hi ${user.name || 'there'},\n\nSomeone asked to reset the password for this account. If that was you, open this link within the next hour:\n\n${origin}/auth/reset?token=${token}\n\nIf you did not ask for this, you can ignore this email. Your password stays the same.`,
      })
    }
    return { ok: true }
  },

  'POST /api/auth/reset': async (req, res) => {
    assertSameOrigin(req)
    const { token, password } = await readBody(req)
    if (typeof token !== 'string' || !token) throw new HttpError(400, 'This reset link is not valid')
    if (!validPassword(password)) throw new HttpError(400, 'Password must be at least 8 characters')
    const user = consumeResetToken(token, password)
    if (!user) throw new HttpError(400, 'This reset link has expired or was already used. Request a new one.')
    const session = createSession(user.id)
    json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': cookieHeader(session, 30 * 86400) })
  },

  'DELETE /api/auth/me': async (req, res) => {
    assertSameOrigin(req)
    const user = requireUser(req)
    const { password } = await readBody(req)
    if (typeof password !== 'string' || !verifyPassword(password, user.password_hash)) throw new HttpError(400, 'Password is incorrect')
    deleteUser(user.id)
    json(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) })
  },

  'GET /api/data': async (req, res) => {
    const body = readSnapshot(requireUser(req).id)
    // The snapshot only changes on a push, so its timestamp is a complete validator: a client that already
    // holds this version gets a 304 and skips the download.
    const tag = body.updatedAt ? `"${body.updatedAt}"` : null
    if (tag && req.headers['if-none-match'] === tag) {
      res.writeHead(304, { ETag: tag, 'Cache-Control': 'no-store' })
      res.end()
      return
    }
    json(res, 200, body, tag ? { ETag: tag } : {})
  },

  /** Row counts the signed-in account owns, plus any orphaned children (always 0 by construction). */
  'GET /api/data/integrity': async (req) => countOwnedRows(requireUser(req).id),

  // sendBeacon can only POST; it carries the same JSON body and session cookie as the PUT.
  'POST /api/data': async (req) => routes['PUT /api/data'](req),

  'PUT /api/data': async (req) => {
    assertSameOrigin(req)
    const user = requireUser(req)
    const { snapshot } = await readBody(req)
    if (!snapshot || typeof snapshot !== 'object') throw new HttpError(400, 'Missing snapshot')
    return { updatedAt: writeSnapshot(user.id, snapshot) }
  },
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' }
function serveStatic(req, res) {
  if (!SERVE_STATIC || !existsSync(DIST)) return false
  const url = new URL(req.url, 'http://x')
  let file = join(DIST, url.pathname)
  if (!file.startsWith(DIST)) return false
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  const ext = extname(file)
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' })
  res.end(readFileSync(file))
  return true
}

migrateLegacySnapshots()

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  const handler = routes[`${req.method} ${path}`]
  try {
    if (handler) {
      const body = await handler(req, res)
      if (!res.writableEnded) json(res, 200, body ?? {})
      return
    }
    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found')
    if (!serveStatic(req, res)) json(res, 404, { error: 'Not found' })
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status === 500) console.error(e)
    json(res, status, { error: status === 500 ? 'Something went wrong on our side' : e.message })
  }
}).listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT}`))

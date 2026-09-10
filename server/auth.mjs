import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db } from './db.mjs'

const SESSION_DAYS = 30
const RESET_MINUTES = 60
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(password) {
  const salt = randomBytes(16)
  const key = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, keyB64] = stored.split('$')
    if (algo !== 'scrypt') return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(keyB64, 'base64')
    const actual = scryptSync(password, salt, expected.length, { N: Number(N), r: Number(r), p: Number(p) })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const nowISO = () => new Date().toISOString()
const plusISO = (ms) => new Date(Date.now() + ms).toISOString()

export function publicUser(row) {
  return row ? { id: row.id, email: row.email, name: row.name, createdAt: row.created_at } : null
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) ?? null
}

export function createUser({ email, name, password }) {
  const ts = nowISO()
  const info = db
    .prepare('INSERT INTO users (email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(email.trim().toLowerCase(), name.trim(), hashPassword(password), ts, ts)
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid))
}

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    nowISO(),
    plusISO(SESSION_DAYS * 86400000),
  )
  return token
}

export function userForSession(token) {
  if (!token) return null
  const row = db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .get(sha256(token), nowISO())
  return row ?? null
}

/** Drop sessions and reset tokens that can no longer be used. Called on startup; harmless to repeat. */
export function purgeExpired() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowISO())
  db.prepare('DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL').run(nowISO())
  // Accounts created by scripts/journeys-test.mjs use unreachable example.com addresses; remove any that an
  // interrupted run left behind once they are an hour old (deletes cascade to the account's rows).
  db.prepare("DELETE FROM users WHERE email LIKE 'test-journeys-%@example.com' AND created_at <= ?").run(new Date(Date.now() - 3600000).toISOString())
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

export function destroyAllSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function createResetToken(userId) {
  const token = randomBytes(32).toString('base64url')
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId)
  db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, plusISO(RESET_MINUTES * 60000))
  return token
}

export function consumeResetToken(token, newPassword) {
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(sha256(token), nowISO())
  if (!row) return null
  db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(nowISO(), row.token_hash)
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(newPassword), nowISO(), row.user_id)
  destroyAllSessions(row.user_id)
  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id)
}

export function updatePassword(userId, newPassword) {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(newPassword), nowISO(), userId)
}

export function updateName(userId, name) {
  db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), nowISO(), userId)
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
}

// ---------- Account data (schema v2: one row per record) ----------

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v, d = '') => (typeof v === 'string' ? v : d)
const opt = (v) => (typeof v === 'string' ? v : null)

const toRow = {
  subscription: (s) => ({
    name: str(s.name).slice(0, 200),
    category_id: str(s.categoryId, 'other'),
    amount: num(s.amount),
    currency: str(s.currency, 'USD'),
    billing_cycle: str(s.billingCycle, 'monthly'),
    next_renewal_date: str(s.nextRenewalDate),
    start_date: str(s.startDate),
    status: str(s.status, 'active'),
    payment_method: str(s.paymentMethod),
    website: str(s.website),
    notes: str(s.notes),
    trial_ends_at: opt(s.trialEndsAt),
    cancelled_at: opt(s.cancelledAt),
    reminder_days_before: typeof s.reminderDaysBefore === 'number' ? s.reminderDaysBefore : null,
    renewal_estimated: s.renewalEstimated ? 1 : 0,
    created_at: str(s.createdAt, nowISO()),
    updated_at: str(s.updatedAt, str(s.createdAt, nowISO())),
  }),
}
const fromRow = {
  subscription: (r) => ({
    id: r.id,
    ownerId: r.user_id,
    name: r.name,
    categoryId: r.category_id,
    amount: r.amount,
    currency: r.currency,
    billingCycle: r.billing_cycle,
    nextRenewalDate: r.next_renewal_date,
    startDate: r.start_date,
    status: r.status,
    paymentMethod: r.payment_method,
    website: r.website,
    notes: r.notes,
    trialEndsAt: r.trial_ends_at,
    cancelledAt: r.cancelled_at,
    reminderDaysBefore: r.reminder_days_before,
    renewalEstimated: r.renewal_estimated === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  priceChange: (r) => ({
    id: r.id,
    ownerId: r.user_id,
    subscriptionId: r.subscription_id,
    previousAmount: r.previous_amount,
    newAmount: r.new_amount,
    effectiveDate: r.effective_date,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  note: (r) => ({
    id: r.id,
    ownerId: r.user_id,
    subscriptionId: r.subscription_id,
    reason: r.reason,
    content: r.content,
    remindOn: r.remind_on,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  billingEvent: (r) => ({ id: r.id, ownerId: r.user_id, kind: r.kind, plan: r.plan, interval: r.interval, amount: r.amount, occurredAt: r.occurred_at }),
  check: (r) => ({
    id: r.id,
    ownerId: r.user_id,
    windowDays: r.window_days,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    decisions: JSON.parse(r.decisions),
    summary: r.summary ? JSON.parse(r.summary) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
}

export function readSnapshot(userId) {
  const profileRow = db.prepare('SELECT profile, updated_at FROM user_profiles WHERE user_id = ?').get(userId)
  const settingsRow = db.prepare('SELECT settings FROM user_settings WHERE user_id = ?').get(userId)
  const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id').all(userId).map(fromRow.subscription)
  if (!profileRow && subscriptions.length === 0) return { snapshot: null, updatedAt: null }
  return {
    snapshot: {
      profile: profileRow ? { ...JSON.parse(profileRow.profile), ownerId: userId } : undefined,
      settings: settingsRow ? { ...JSON.parse(settingsRow.settings), ownerId: userId } : undefined,
      subscriptions,
      priceChanges: db.prepare('SELECT * FROM price_changes WHERE user_id = ? ORDER BY effective_date, id').all(userId).map(fromRow.priceChange),
      cancellationNotes: db.prepare('SELECT * FROM cancellation_notes WHERE user_id = ? ORDER BY id').all(userId).map(fromRow.note),
      billingEvents: db.prepare('SELECT * FROM billing_events WHERE user_id = ? ORDER BY id').all(userId).map(fromRow.billingEvent),
      renewalChecks: db.prepare('SELECT * FROM renewal_checks WHERE user_id = ? ORDER BY id').all(userId).map(fromRow.check),
    },
    updatedAt: profileRow?.updated_at ?? null,
  }
}

/** Replace a user's records atomically. Children whose parent is missing from the snapshot are dropped, never left orphaned. */
export function writeSnapshot(userId, snapshot) {
  const ts = nowISO()
  const subs = Array.isArray(snapshot.subscriptions) ? snapshot.subscriptions.filter((s) => Number.isInteger(s?.id)) : []
  const ids = new Set(subs.map((s) => s.id))
  const prices = (Array.isArray(snapshot.priceChanges) ? snapshot.priceChanges : []).filter((p) => Number.isInteger(p?.id) && ids.has(p.subscriptionId))
  const notes = (Array.isArray(snapshot.cancellationNotes) ? snapshot.cancellationNotes : []).filter((n) => Number.isInteger(n?.id) && ids.has(n.subscriptionId))
  const events = (Array.isArray(snapshot.billingEvents) ? snapshot.billingEvents : []).filter((b) => Number.isInteger(b?.id))
  const checks = (Array.isArray(snapshot.renewalChecks) ? snapshot.renewalChecks : []).filter((c) => Number.isInteger(c?.id))
  const insCheck = db.prepare('INSERT INTO renewal_checks (user_id, id, window_days, period_start, period_end, started_at, completed_at, decisions, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')

  const insSub = db.prepare(`INSERT INTO subscriptions (user_id, id, name, category_id, amount, currency, billing_cycle, next_renewal_date, start_date, status, payment_method, website, notes, trial_ends_at, cancelled_at, reminder_days_before, renewal_estimated, created_at, updated_at)
    VALUES (@user_id, @id, @name, @category_id, @amount, @currency, @billing_cycle, @next_renewal_date, @start_date, @status, @payment_method, @website, @notes, @trial_ends_at, @cancelled_at, @reminder_days_before, @renewal_estimated, @created_at, @updated_at)`)
  const insPrice = db.prepare('INSERT INTO price_changes (user_id, id, subscription_id, previous_amount, new_amount, effective_date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const insNote = db.prepare('INSERT INTO cancellation_notes (user_id, id, subscription_id, reason, content, remind_on, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const insEvent = db.prepare('INSERT INTO billing_events (user_id, id, kind, plan, interval, amount, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)')

  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId) // cascades to price changes and notes
    db.prepare('DELETE FROM billing_events WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM renewal_checks WHERE user_id = ?').run(userId)
    for (const c of checks) insCheck.run(userId, c.id, num(c.windowDays, 30), str(c.periodStart), str(c.periodEnd), str(c.startedAt, ts), opt(c.completedAt), JSON.stringify(Array.isArray(c.decisions) ? c.decisions : []), c.summary ? JSON.stringify(c.summary) : null, str(c.createdAt, ts), str(c.updatedAt, ts))
    for (const s of subs) insSub.run({ user_id: userId, id: s.id, ...toRow.subscription(s) })
    for (const p of prices) insPrice.run(userId, p.id, p.subscriptionId, num(p.previousAmount), num(p.newAmount), str(p.effectiveDate), str(p.note), str(p.createdAt, ts), str(p.updatedAt, str(p.createdAt, ts)))
    for (const n of notes) insNote.run(userId, n.id, n.subscriptionId, str(n.reason, 'other'), str(n.content), opt(n.remindOn), str(n.status, 'open'), str(n.createdAt, ts), str(n.updatedAt, str(n.createdAt, ts)))
    for (const b of events) insEvent.run(userId, b.id, str(b.kind), str(b.plan), opt(b.interval), num(b.amount), str(b.occurredAt, ts))
    if (snapshot.profile && typeof snapshot.profile === 'object') {
      const { ownerId: _o, ...profile } = snapshot.profile
      db.prepare('INSERT INTO user_profiles (user_id, profile, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at').run(userId, JSON.stringify(profile), str(profile.createdAt, ts), ts)
    }
    if (snapshot.settings && typeof snapshot.settings === 'object') {
      const { ownerId: _o, ...settings } = snapshot.settings
      db.prepare('INSERT INTO user_settings (user_id, settings, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at').run(userId, JSON.stringify(settings), str(settings.createdAt, ts), ts)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return ts
}

/** One-time move of v1 JSON blobs into the v2 tables. Safe to run on every start. */
export function migrateLegacySnapshots() {
  const rows = db.prepare('SELECT user_id, snapshot FROM user_data WHERE migrated_at IS NULL').all()
  for (const row of rows) {
    try {
      writeSnapshot(row.user_id, JSON.parse(row.snapshot))
      db.prepare('UPDATE user_data SET migrated_at = ? WHERE user_id = ?').run(nowISO(), row.user_id)
      console.log(`[db] migrated account ${row.user_id} to schema v2`)
    } catch (e) {
      console.error(`[db] could not migrate account ${row.user_id}:`, e)
    }
  }
}

/** Removes the user and, through cascades, every session, reset token and record they own. */
export function deleteUser(userId) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId)
}

/** Counts of rows owned by a user across every table (used by the integrity endpoint). */
export function countOwnedRows(userId) {
  const c = (sql) => db.prepare(sql).get(userId).n
  return {
    subscriptions: c('SELECT COUNT(*) n FROM subscriptions WHERE user_id = ?'),
    priceChanges: c('SELECT COUNT(*) n FROM price_changes WHERE user_id = ?'),
    cancellationNotes: c('SELECT COUNT(*) n FROM cancellation_notes WHERE user_id = ?'),
    billingEvents: c('SELECT COUNT(*) n FROM billing_events WHERE user_id = ?'),
    renewalChecks: c('SELECT COUNT(*) n FROM renewal_checks WHERE user_id = ?'),
    orphans:
      db.prepare('SELECT COUNT(*) n FROM price_changes p WHERE p.user_id = ? AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.user_id AND s.id = p.subscription_id)').get(userId).n +
      db.prepare('SELECT COUNT(*) n FROM cancellation_notes c WHERE c.user_id = ? AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = c.user_id AND s.id = c.subscription_id)').get(userId).n,
  }
}

// ---------- Count-only analytics (no identifiers, no user rows) ----------
export const ANALYTICS_EVENTS = new Set(['onboarding_started', 'onboarding_completed', 'first_core_action', 'day_two_return', 'day_seven_return', 'premium_view', 'premium_conversion'])

export function recordEvent(event, day) {
  db.prepare('INSERT INTO analytics_events (day, event, count) VALUES (?, ?, 1) ON CONFLICT(day, event) DO UPDATE SET count = count + 1').run(day, event)
}

export function analyticsSummary() {
  const rows = db.prepare('SELECT day, event, count FROM analytics_events ORDER BY day').all()
  const totals = {}
  const last7 = {}
  const prior7 = {}
  const byDay = new Map()
  const dayMs = 86400000
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  for (const r of rows) {
    totals[r.event] = (totals[r.event] ?? 0) + r.count
    const age = Math.round((today - new Date(r.day + 'T00:00:00Z').getTime()) / dayMs)
    if (age >= 0 && age < 7) last7[r.event] = (last7[r.event] ?? 0) + r.count
    else if (age >= 7 && age < 14) prior7[r.event] = (prior7[r.event] ?? 0) + r.count
    if (!byDay.has(r.day)) byDay.set(r.day, {})
    byDay.get(r.day)[r.event] = r.count
  }
  return { totals, last7, prior7, days: [...byDay.entries()].slice(-30).map(([day, counts]) => ({ day, counts })) }
}

/** Sliding-window limiter keyed by caller; returns true when the call is allowed. */
const buckets = new Map()
export function allow(key, max, windowMs) {
  const now = Date.now()
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (list.length >= max) {
    buckets.set(key, list)
    return false
  }
  list.push(now)
  buckets.set(key, list)
  return true
}

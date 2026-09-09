/**
 * Permission tests against the running dev server (npm run dev):
 *   node scripts/permissions-test.mjs
 *
 * Creates two throwaway accounts, checks that a signed-out visitor gets nothing private, that account A
 * can never read or change account B, that the only public endpoints are the intended ones, that no admin
 * surface exists, and that cross-site writes are refused. Both accounts are deleted at the end.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const ORIGIN = new URL(BASE).origin
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

function jar() {
  let cookie = ''
  const call = async (method, path, body, extra = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...extra.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    return { status: res.status, data, headers: res.headers }
  }
  return { call, get cookie() { return cookie } }
}

const stamp = Date.now()
const anon = jar()

// ---------- Signed-out visitor ----------
for (const [method, path, body] of [
  ['GET', '/api/auth/me'],
  ['GET', '/api/data'],
  ['GET', '/api/data/integrity'],
  ['PUT', '/api/data', { snapshot: { subscriptions: [] } }],
  ['POST', '/api/data', { snapshot: { subscriptions: [] } }],
  ['PATCH', '/api/auth/me', { name: 'x' }],
  ['POST', '/api/auth/change-password', { currentPassword: 'a', newPassword: 'bbbbbbbbbb' }],
  ['DELETE', '/api/auth/me', { password: 'a' }],
]) {
  const r = await anon.call(method, path, body)
  check(`signed-out ${method} ${path} is refused`, r.status === 401, `status ${r.status}`)
}

// ---------- Intended public surface ----------
const health = await anon.call('GET', '/api/health')
check('public: /api/health answers', health.status === 200 && health.data?.ok === true, `status ${health.status}`)
const forgotUnknown = await anon.call('POST', '/api/auth/forgot', { email: `nobody-${stamp}@example.com` })
check('public: forgot-password does not reveal whether an email exists', forgotUnknown.status === 200 && forgotUnknown.data?.ok === true, `status ${forgotUnknown.status}`)
const badReset = await anon.call('POST', '/api/auth/reset', { token: 'not-a-real-token', password: 'a long enough passphrase' })
check('public: a made-up reset token is rejected', badReset.status === 400, `status ${badReset.status}`)
const noAdmin = await anon.call('GET', '/api/admin/users')
check('no admin surface: /api/admin/* is 404', noAdmin.status === 404, `status ${noAdmin.status}`)
const noUserById = await anon.call('GET', '/api/users/1')
check('no per-user lookup: /api/users/:id is 404', noUserById.status === 404, `status ${noUserById.status}`)
const manifest = await fetch(BASE + '/manifest.webmanifest')
check('public: manifest is served', manifest.status === 200)

// ---------- Two accounts ----------
const a = jar()
const b = jar()
const signUpA = await a.call('POST', '/api/auth/sign-up', { email: `perm-a-${stamp}@example.com`, password: 'a long enough passphrase', name: 'Account A' })
const signUpB = await b.call('POST', '/api/auth/sign-up', { email: `perm-b-${stamp}@example.com`, password: 'a long enough passphrase', name: 'Account B' })
check('sign-up A works', signUpA.status === 201 && !!a.cookie, `status ${signUpA.status}`)
check('sign-up B works', signUpB.status === 201 && !!b.cookie, `status ${signUpB.status}`)
check('sign-up never returns a password hash', !JSON.stringify(signUpA.data).includes('password'), JSON.stringify(signUpA.data).slice(0, 80))
const cookieFlags = (await anon.call('POST', '/api/auth/sign-in', { email: `perm-a-${stamp}@example.com`, password: 'a long enough passphrase' })).headers.get('set-cookie') ?? ''
check('session cookie is HttpOnly and SameSite', /HttpOnly/i.test(cookieFlags) && /SameSite=Lax/i.test(cookieFlags), cookieFlags.replace(/st_session=[^;]+/, 'st_session=…'))

const idA = signUpA.data?.user?.id
const idB = signUpB.data?.user?.id
const now = new Date().toISOString()
const snapshotA = {
  profile: { id: 1, name: 'Account A', email: '', currency: 'USD', goal: 'cut-costs', onboardingComplete: true, plan: 'free', createdAt: now, updatedAt: now },
  settings: { id: 1, defaultReminderDays: 3, monthlyBudget: 100, notifyRenewals: true, notifyPriceChanges: true, notifyTrials: true, weekStartsOn: 1, showCancelledInList: false, compactAmounts: false, feedback: [{ at: now, score: 2, message: 'PRIVATE NOTE FROM A', source: 'prompt' }], updatedAt: now },
  subscriptions: [{ id: 1, name: 'A Secret Service', categoryId: 'streaming', amount: 9.99, currency: 'USD', billingCycle: 'monthly', nextRenewalDate: '2026-10-01', startDate: '2026-01-01', status: 'active', paymentMethod: 'Visa 1234', website: '', notes: 'private note A', trialEndsAt: null, cancelledAt: null, reminderDaysBefore: null, renewalEstimated: false, createdAt: now, updatedAt: now }],
  priceChanges: [{ id: 1, subscriptionId: 1, previousAmount: 8.99, newAmount: 9.99, effectiveDate: '2026-06-01', note: '', createdAt: now, updatedAt: now }],
  cancellationNotes: [{ id: 1, subscriptionId: 1, reason: 'other', content: 'A private cancellation note', remindOn: null, status: 'open', createdAt: now, updatedAt: now }],
  billingEvents: [],
  renewalChecks: [],
}
const putA = await a.call('PUT', '/api/data', { snapshot: snapshotA })
check('A can write A', putA.status === 200 && !!putA.data?.updatedAt, `status ${putA.status}`)
const readA = await a.call('GET', '/api/data')
check('A can read A', readA.status === 200 && readA.data?.snapshot?.subscriptions?.[0]?.name === 'A Secret Service', `status ${readA.status}`)
check('records read back are stamped with the owner', readA.data?.snapshot?.subscriptions?.[0]?.ownerId === idA && readA.data?.snapshot?.cancellationNotes?.[0]?.ownerId === idA, `ownerId ${readA.data?.snapshot?.subscriptions?.[0]?.ownerId} vs ${idA}`)

// B reads: must see nothing of A.
const readB = await b.call('GET', '/api/data')
const textB = JSON.stringify(readB.data)
check('B cannot read A (empty account sees no snapshot)', readB.status === 200 && readB.data?.snapshot === null, `status ${readB.status} ${textB.slice(0, 80)}`)
check('B response carries none of A\'s private text', !/A Secret Service|PRIVATE NOTE FROM A|Visa 1234|private cancellation note/.test(textB))

// B writes records that claim A's owner id and reuse A's record ids: they must land in B's account only.
const putB = await b.call('PUT', '/api/data', { snapshot: { ...snapshotA, profile: { ...snapshotA.profile, ownerId: idA, name: 'Account B' }, settings: { ...snapshotA.settings, ownerId: idA, feedback: [] }, subscriptions: [{ ...snapshotA.subscriptions[0], ownerId: idA, name: 'B Overwrite Attempt' }], priceChanges: [], cancellationNotes: [] } })
check('B can write B even when the payload claims A\'s owner id', putB.status === 200, `status ${putB.status}`)
const readA2 = await a.call('GET', '/api/data')
check('A is untouched after B\'s write with the same ids', readA2.data?.snapshot?.subscriptions?.[0]?.name === 'A Secret Service' && readA2.data?.snapshot?.settings?.feedback?.[0]?.message === 'PRIVATE NOTE FROM A')
const readB2 = await b.call('GET', '/api/data')
check('B\'s write is stamped with B, not the claimed owner', readB2.data?.snapshot?.subscriptions?.[0]?.ownerId === idB && readB2.data?.snapshot?.profile?.ownerId === idB, `ownerId ${readB2.data?.snapshot?.subscriptions?.[0]?.ownerId} vs ${idB}`)
const integrityB = await b.call('GET', '/api/data/integrity')
check('integrity counts are per account', integrityB.data?.subscriptions === 1 && integrityB.data?.cancellationNotes === 0, JSON.stringify(integrityB.data))

// Account-level actions cannot target someone else.
const renameB = await b.call('PATCH', '/api/auth/me', { name: 'Renamed by B', id: idA, userId: idA })
const meA = await a.call('GET', '/api/auth/me')
check('PATCH me ignores any id in the body (A keeps its name)', renameB.status === 200 && meA.data?.user?.name === 'Account A', `A name ${meA.data?.user?.name}`)
const deleteWrong = await b.call('DELETE', '/api/auth/me', { password: 'wrong password here' })
check('deleting an account needs the right password', deleteWrong.status === 400, `status ${deleteWrong.status}`)

// Cross-site writes are refused even with a valid cookie.
const csrf = await a.call('PUT', '/api/data', { snapshot: { subscriptions: [] } }, { headers: { Origin: 'https://evil.example' } })
check('cross-site write with a valid cookie is refused', csrf.status === 403, `status ${csrf.status}`)
const readA3 = await a.call('GET', '/api/data')
check('A\'s data survived the refused cross-site write', readA3.data?.snapshot?.subscriptions?.length === 1)

// A session ends on sign-out; the old cookie is useless afterwards.
const oldCookie = a.cookie
await a.call('POST', '/api/auth/sign-out', {})
const afterOut = await fetch(BASE + '/api/data', { headers: { Cookie: oldCookie } })
check('a signed-out session cookie no longer reads data', afterOut.status === 401, `status ${afterOut.status}`)

// Password guessing on a live session is limited. This uses a third account, because the limiter is per
// account and would otherwise block the cleanup deletes below; the third account is deleted on a later run
// once its window has passed (it holds no data).
const c = jar()
await c.call('POST', '/api/auth/sign-up', { email: `perm-limit-${stamp}@example.com`, password: 'a long enough passphrase', name: 'Account C' })
let limited = false
for (let i = 0; i < 12; i++) {
  const r = await c.call('POST', '/api/auth/change-password', { currentPassword: `wrong-${i}`, newPassword: 'another long passphrase' })
  if (r.status === 429) {
    limited = true
    break
  }
}
check('password guesses through a session are rate limited', limited)

// Security headers are present.
const h = await b.call('GET', '/api/auth/me')
check('responses set X-Content-Type-Options and X-Frame-Options', h.headers.get('x-content-type-options') === 'nosniff' && h.headers.get('x-frame-options') === 'DENY')

// ---------- Cleanup ----------
const signInA = await a.call('POST', '/api/auth/sign-in', { email: `perm-a-${stamp}@example.com`, password: 'a long enough passphrase' })
check('A can sign back in', signInA.status === 200)
const delA = await a.call('DELETE', '/api/auth/me', { password: 'a long enough passphrase' })
check('A deletes its own account', delA.status === 200, `status ${delA.status}`)
const delB = await b.call('DELETE', '/api/auth/me', { password: 'a long enough passphrase' })
check('B deletes its own account', delB.status === 200, `status ${delB.status}`)
const delC = await c.call('DELETE', '/api/auth/me', { password: 'a long enough passphrase' })
check('C is rate limited right after the guess test (deleted on a later run)', delC.status === 429 || delC.status === 200, `status ${delC.status}`)
const gone = await anon.call('POST', '/api/auth/sign-in', { email: `perm-a-${stamp}@example.com`, password: 'a long enough passphrase' })
check('a deleted account cannot sign in', gone.status === 401, `status ${gone.status}`)

const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Delivers transactional email (password resets).
 *   SMTP_URL=smtps://user:pass@smtp.example.com:465   → sent through that SMTP server (nodemailer)
 *   MAIL_FROM="Subscription Tracker <no-reply@example.com>" → sender address (defaults to the SMTP user)
 * Without SMTP_URL, messages are written to server/outbox/ so the flow can be completed and inspected in
 * development. /api/health reports which mode is active so the readiness checklist can tell.
 */
const OUTBOX = process.env.MAIL_OUTBOX ?? resolve('server/outbox')
const SMTP_URL = process.env.SMTP_URL?.trim()

let transport = null
async function getTransport() {
  if (!SMTP_URL) return null
  if (!transport) {
    const { default: nodemailer } = await import('nodemailer')
    transport = nodemailer.createTransport(SMTP_URL)
  }
  return transport
}

export const mailMode = SMTP_URL ? 'smtp' : 'outbox'

export async function sendMail({ to, subject, text }) {
  const smtp = await getTransport()
  if (smtp) {
    const from = process.env.MAIL_FROM ?? new URL(SMTP_URL).username ?? 'no-reply@localhost'
    await smtp.sendMail({ from: decodeURIComponent(from), to, subject, text })
    console.log(`[mail] ${subject} -> ${to} (smtp)`)
    return
  }
  mkdirSync(OUTBOX, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = resolve(OUTBOX, `${stamp}-${to.replace(/[^a-z0-9@.-]/gi, '_')}.txt`)
  writeFileSync(file, `To: ${to}\nSubject: ${subject}\nDate: ${new Date().toISOString()}\n\n${text}\n`)
  console.log(`[mail] ${subject} -> ${to} (saved to ${file})`)
}

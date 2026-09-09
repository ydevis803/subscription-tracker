import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Delivers transactional email. Without an SMTP provider configured, messages are written to
 * server/outbox/ so the flow can be completed and inspected during development.
 */
const OUTBOX = process.env.MAIL_OUTBOX ?? resolve('server/outbox')

export async function sendMail({ to, subject, text }) {
  mkdirSync(OUTBOX, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = resolve(OUTBOX, `${stamp}-${to.replace(/[^a-z0-9@.-]/gi, '_')}.txt`)
  writeFileSync(file, `To: ${to}\nSubject: ${subject}\nDate: ${new Date().toISOString()}\n\n${text}\n`)
  console.log(`[mail] ${subject} -> ${to} (saved to ${file})`)
}

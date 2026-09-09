import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { copyText } from '@/lib/referral'
import { APP_NAME, APP_VERSION } from '@/lib/legal'

/**
 * App Store file preparation. Identifiers are kept only in this browser's owner storage (never in the app's
 * database, never synced, never in exports). The .p8 private key is never entered or stored anywhere in the app:
 * the owner only confirms it is kept securely elsewhere. Issuer ID and Key ID are entered in masked fields and
 * shown only as their last four characters afterwards.
 */
const STORAGE = 'subscription-tracker.owner.appstore-prep'

interface Prep {
  teamId: string
  issuerId: string
  keyId: string
  p8Confirmed: boolean
  bundleId: string
  version: string
  build: string
  iconConfirmed: boolean
  ready: Record<string, boolean>
}

const EMPTY: Prep = { teamId: '', issuerId: '', keyId: '', p8Confirmed: false, bundleId: '', version: APP_VERSION, build: '1', iconConfirmed: false, ready: {} }

function read(): Prep {
  try {
    const raw = localStorage.getItem(STORAGE)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Prep>) } : EMPTY
  } catch {
    return EMPTY
  }
}
function write(p: Prep) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(p))
  } catch {
    // ignore
  }
}

const mask = (v: string) => (v ? `••••••${v.slice(-4)}` : '')

interface ItemDef {
  id: string
  title: string
  /** Plain-language explanation and where to find it. */
  explain: string
  where: string
  valid: (p: Prep, extra: { icon1024: boolean }) => { ok: boolean; why: string }
  secret?: boolean
}

const ITEMS: ItemDef[] = [
  {
    id: 'teamId',
    title: 'Apple Team ID',
    explain: 'A 10-character code that identifies your Apple Developer account. It is not a secret; it appears in signing certificates and provisioning profiles.',
    where: 'developer.apple.com → Account → Membership details → Team ID.',
    valid: (p) => (/^[A-Z0-9]{10}$/.test(p.teamId.trim()) ? { ok: true, why: 'Ten letters or digits.' } : { ok: false, why: 'Must be exactly 10 letters or digits, for example 1A2BC3D4E5.' }),
  },
  {
    id: 'issuerId',
    title: 'App Store Connect Issuer ID',
    explain: 'A long identifier for your App Store Connect API keys, used with a Key ID and the .p8 file so tools like Fastlane or Xcode Cloud can upload builds. Treat it as sensitive: it is shown here only as its last four characters.',
    where: 'App Store Connect → Users and Access → Integrations → App Store Connect API → Issuer ID.',
    valid: (p) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.issuerId.trim()) ? { ok: true, why: 'Looks like an Issuer ID.' } : { ok: false, why: 'Must be a UUID like 57246542-96fe-1a63-e053-0824d011072a.' }),
    secret: true,
  },
  {
    id: 'keyId',
    title: 'App Store Connect Key ID',
    explain: 'The 10-character ID of the API key that pairs with your .p8 file. Sensitive: shown here only as its last four characters.',
    where: 'App Store Connect → Users and Access → Integrations → App Store Connect API → the key row → Key ID.',
    valid: (p) => (/^[A-Z0-9]{10}$/.test(p.keyId.trim()) ? { ok: true, why: 'Ten letters or digits.' } : { ok: false, why: 'Must be exactly 10 letters or digits.' }),
    secret: true,
  },
  {
    id: 'p8',
    title: 'Private key (.p8) kept securely',
    explain: 'The AuthKey_XXXXXXXXXX.p8 file is the actual secret. Apple lets you download it exactly once. This app never asks for its contents and never stores it; keep it in your CI secrets store or a password manager, not in a repo or a chat.',
    where: 'Downloaded when the key was created in App Store Connect. If it is lost, revoke the key and create a new one.',
    valid: (p) => (p.p8Confirmed ? { ok: true, why: 'Confirmed stored outside the app.' } : { ok: false, why: 'Tick the confirmation once the file is stored safely.' }),
  },
  {
    id: 'bundleId',
    title: 'Bundle identifier',
    explain: 'The reverse-domain name that uniquely identifies the app on Apple platforms, for example com.yourcompany.subscriptiontracker. It cannot be changed after the first upload.',
    where: 'Chosen by you; registered under developer.apple.com → Identifiers, and set in the Xcode / wrapper project.',
    valid: (p) => (/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){2,}$/i.test(p.bundleId.trim()) ? { ok: true, why: 'Reverse-domain form.' } : { ok: false, why: 'Use reverse-domain form with at least three parts, for example com.example.subscriptiontracker.' }),
  },
  {
    id: 'icon',
    title: 'Final icon: 1024 × 1024 PNG, square corners, no transparency',
    explain: 'App Store Connect needs one 1024-pixel PNG with no alpha channel and no rounded corners; Apple applies the mask itself. The app exports this file as icon-1024.png.',
    where: 'Run npm run logo:export; the file is public/icon-1024.png. Then tick the confirmation after checking it opens as an opaque square.',
    valid: (p, x) => (x.icon1024 && p.iconConfirmed ? { ok: true, why: 'icon-1024.png is served and confirmed.' } : { ok: false, why: x.icon1024 ? 'File found; tick the confirmation after checking it.' : 'public/icon-1024.png is not served; run npm run logo:export.' }),
  },
  {
    id: 'version',
    title: 'Version and build number',
    explain: 'The version is what users see (1.0). The build number must go up with every upload, even for the same version.',
    where: 'Set in the Xcode / wrapper project (MARKETING_VERSION and CURRENT_PROJECT_VERSION) to match these values.',
    valid: (p) => (/^\d+(\.\d+){1,2}$/.test(p.version.trim()) && /^\d+$/.test(p.build.trim()) ? { ok: true, why: `Version ${p.version.trim()}, build ${p.build.trim()}.` } : { ok: false, why: 'Version like 1.0 or 1.0.1 and a whole-number build.' }),
  },
]

export function AppStorePrep() {
  const toast = useToast()
  const [prep, setPrep] = useState<Prep>(read)
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [help, setHelp] = useState<ItemDef | null>(null)
  const [icon1024, setIcon1024] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    fetch('/icon-1024.png', { cache: 'no-store', method: 'HEAD' })
      .then((r) => setIcon1024(r.ok))
      .catch(() => setIcon1024(false))
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const update = (patch: Partial<Prep>) => {
    setPrep((p) => {
      const next = { ...p, ...patch }
      // A changed value can never leave a stale "ready" mark behind.
      const ready = { ...next.ready }
      for (const item of ITEMS) if (!item.valid(next, { icon1024 }).ok) delete ready[item.id]
      next.ready = ready
      write(next)
      return next
    })
  }
  const setReady = (id: string, on: boolean) => update({ ready: { ...prep.ready, [id]: on } })

  const validity = useMemo(() => Object.fromEntries(ITEMS.map((i) => [i.id, i.valid(prep, { icon1024 })])), [prep, icon1024])
  const readyCount = ITEMS.filter((i) => prep.ready[i.id] && validity[i.id].ok).length
  const allReady = readyCount === ITEMS.length

  const summary = useMemo(() => {
    const line = (label: string, value: string) => `${label}: ${value}`
    return [
      `${APP_NAME} · App Store file preparation · ${new Date().toISOString().slice(0, 10)}`,
      `Status: ${allReady ? 'READY TO UPLOAD' : `${readyCount} of ${ITEMS.length} ready`}`,
      '',
      line('Apple Team ID', prep.teamId.trim() || '(not set)'),
      line('Issuer ID', prep.issuerId ? mask(prep.issuerId) + ' (masked; full value is not included in summaries)' : '(not set)'),
      line('Key ID', prep.keyId ? mask(prep.keyId) + ' (masked)' : '(not set)'),
      line('.p8 private key', prep.p8Confirmed ? 'confirmed stored securely outside the app (contents never stored here)' : 'not confirmed'),
      line('Bundle identifier', prep.bundleId.trim() || '(not set)'),
      line('Icon', icon1024 ? `icon-1024.png served${prep.iconConfirmed ? ', confirmed opaque square' : ', not yet confirmed'}` : 'icon-1024.png not served'),
      line('Version / build', `${prep.version.trim() || '(not set)'} / ${prep.build.trim() || '(not set)'}`),
      '',
      ...ITEMS.map((i) => `[${prep.ready[i.id] && validity[i.id].ok ? 'x' : ' '}] ${i.title} — ${validity[i.id].why}`),
    ].join('\n')
  }, [prep, validity, allReady, readyCount, icon1024])

  const copySummary = async () => {
    if (await copyText(summary)) {
      setCopied(true)
      toast.success('Summary copied')
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } else toast.error('Clipboard is blocked here. Use Download instead.')
  }
  const downloadHref = useMemo(() => `data:text/plain;charset=utf-8,${encodeURIComponent(summary)}`, [summary])

  return (
    <Card className="overflow-hidden" data-appstore-prep>
      <div className="p-4">
        <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-700">App Store file preparation</p>
        <p className="mt-1 text-[0.9375rem] font-bold leading-tight text-navy-900" data-prep-summary>
          {allReady ? 'Ready to upload' : `${readyCount} of ${ITEMS.length} ready`}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
          Identifiers stay in this browser's owner storage only: never in your subscription data, never synced or exported. The .p8 key is never entered here. Issuer ID and Key ID are masked after entry.
        </p>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {ITEMS.map((item) => {
          const v = validity[item.id]
          const ready = !!prep.ready[item.id] && v.ok
          return (
            <li key={item.id} className="p-4" data-prep-item={item.id} data-valid={v.ok ? 'yes' : 'no'} data-ready={ready ? 'yes' : 'no'}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ready ? 'bg-mint-500 text-navy-900' : v.ok ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-faint'}`}>
                  <Icon name={ready ? 'check' : v.ok ? 'sparkle' : 'clock'} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[0.9375rem] font-semibold text-ink">{item.title}</p>
                    <button type="button" onClick={() => setHelp(item)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[0.8125rem] font-semibold text-navy-800 hover:bg-navy-50" aria-label={`What is ${item.title}?`}>
                      <Icon name="info" size={16} /> What is this?
                    </button>
                  </div>
                  <div className="mt-2">
                    <Field item={item} prep={prep} editing={!!editing[item.id]} onEdit={(on) => setEditing((e) => ({ ...e, [item.id]: on }))} update={update} icon1024={icon1024} />
                  </div>
                  <p className={`mt-1.5 text-[0.75rem] ${v.ok ? 'text-mint-700' : 'text-coral-700'}`}>{v.why}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button size="sm" variant={ready ? 'primary' : 'mint'} disabled={!v.ok} onClick={() => setReady(item.id, !ready)} leading={<Icon name="check" size={16} />} aria-pressed={ready}>
                  {ready ? 'Marked ready' : 'Mark ready'}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-line p-4">
        <Button variant={copied ? 'primary' : 'secondary'} onClick={copySummary} leading={<Icon name={copied ? 'check' : 'copy'} size={16} />}>
          {copied ? 'Copied' : 'Copy summary'}
        </Button>
        <a href={downloadHref} download="app-store-preparation.txt" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-navy-50 px-5 text-[0.9375rem] font-semibold text-navy-900 hover:bg-navy-100 active:bg-navy-200" data-download>
          <Icon name="download" size={16} /> Download summary
        </a>
        <p className="w-full text-[0.75rem] text-faint">The summary carries masked IDs only; it is safe to paste into a ticket.</p>
      </div>

      <Sheet open={help !== null} onClose={() => setHelp(null)} title={help?.title ?? ''}>
        {help && (
          <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink">
            <p>{help.explain}</p>
            <p className="rounded-xl bg-navy-50 px-3 py-2 text-[0.875rem] text-navy-900">
              <span className="font-semibold">Where to find it:</span> {help.where}
            </p>
            <Button full variant="secondary" onClick={() => setHelp(null)}>
              Got it
            </Button>
          </div>
        )}
      </Sheet>
    </Card>
  )
}

function Field({ item, prep, editing, onEdit, update, icon1024 }: { item: ItemDef; prep: Prep; editing: boolean; onEdit: (on: boolean) => void; update: (p: Partial<Prep>) => void; icon1024: boolean }) {
  switch (item.id) {
    case 'teamId':
      return <TextField label="Team ID" value={prep.teamId} onChange={(e) => update({ teamId: e.target.value.toUpperCase() })} placeholder="1A2BC3D4E5" autoComplete="off" spellCheck={false} maxLength={10} />
    case 'issuerId':
    case 'keyId': {
      const key = item.id as 'issuerId' | 'keyId'
      const value = prep[key]
      if (value && !editing) {
        return (
          <div className="flex items-center gap-3">
            <span className="tabular flex h-12 flex-1 items-center rounded-2xl border border-line bg-navy-50 px-4 text-[1rem] text-navy-900" data-masked>
              {mask(value)}
            </span>
            <Button size="sm" variant="secondary" onClick={() => onEdit(true)}>
              Replace
            </Button>
          </div>
        )
      }
      return (
        <SecretEntry
          label={key === 'issuerId' ? 'Issuer ID' : 'Key ID'}
          placeholder={key === 'issuerId' ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' : 'ABC123DEF4'}
          maxLength={key === 'issuerId' ? 36 : 10}
          onSave={(v) => {
            update({ [key]: key === 'keyId' ? v.toUpperCase() : v.toLowerCase() } as Partial<Prep>)
            onEdit(false)
          }}
          onCancel={value ? () => onEdit(false) : undefined}
        />
      )
    }
    case 'p8':
      return (
        <label className="flex min-h-11 items-start gap-3">
          <input type="checkbox" checked={prep.p8Confirmed} onChange={(e) => update({ p8Confirmed: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2DD4BF]" />
          <span className="text-[0.875rem] leading-snug text-ink">I have the .p8 file stored securely outside this app (CI secrets or a password manager), and it is not in a repo or a chat.</span>
        </label>
      )
    case 'bundleId':
      return <TextField label="Bundle identifier" value={prep.bundleId} onChange={(e) => update({ bundleId: e.target.value.trim() })} placeholder="com.example.subscriptiontracker" autoComplete="off" spellCheck={false} />
    case 'icon':
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[0.875rem] text-ink">
            <Icon name={icon1024 ? 'check' : 'alert'} size={16} className={icon1024 ? 'text-mint-700' : 'text-coral-700'} /> {icon1024 ? 'icon-1024.png is served by this build.' : 'icon-1024.png is not served yet.'}
          </p>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={prep.iconConfirmed} disabled={!icon1024} onChange={(e) => update({ iconConfirmed: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2DD4BF]" />
            <span className="text-[0.875rem] leading-snug text-ink">I opened icon-1024.png and it is a 1024 × 1024 opaque square with no transparency.</span>
          </label>
        </div>
      )
    case 'version':
      return (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Version" value={prep.version} onChange={(e) => update({ version: e.target.value })} placeholder="1.0" inputMode="decimal" />
          <TextField label="Build" value={prep.build} onChange={(e) => update({ build: e.target.value })} placeholder="1" inputMode="numeric" />
        </div>
      )
    default:
      return null
  }
}

/** Masked entry: the value is typed into a password field and only its last four characters are ever shown again. */
function SecretEntry({ label, placeholder, maxLength, onSave, onCancel }: { label: string; placeholder: string; maxLength: number; onSave: (v: string) => void; onCancel?: () => void }) {
  const [v, setV] = useState('')
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <TextField label={label} type="password" value={v} onChange={(e) => setV(e.target.value.trim())} placeholder={placeholder} autoComplete="off" spellCheck={false} maxLength={maxLength} />
      </div>
      <Button size="md" variant="mint" disabled={!v} onClick={() => onSave(v)}>
        Save
      </Button>
      {onCancel && (
        <Button size="md" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}

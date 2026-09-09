import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField, Toggle } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { copyText } from '@/lib/referral'
import { APP_NAME, APP_VERSION, LEGAL_ROUTES } from '@/lib/legal'

/**
 * Google Play preparation. Required items are always shown; conditional items appear only when the owner says
 * they apply (Google Sign-In, a Google snippet Play Console asked for). Values stay in this browser's owner storage.
 */
const STORAGE = 'subscription-tracker.owner.play-prep'

interface Prep {
  packageName: string
  versionName: string
  versionCode: string
  privacyUrl: string
  termsUrl: string
  iconConfirmed: boolean
  featureConfirmed: boolean
  testedOnDevice: boolean
  closedTestDone: boolean
  usesGoogleSignIn: boolean
  sha256: string
  shaAdded: boolean
  snippetRequested: boolean
  snippetPlaced: string
  ready: Record<string, boolean>
}

const publicBase = (import.meta.env.VITE_APP_URL as string | undefined)?.trim().replace(/\/+$/, '') || (typeof window !== 'undefined' ? window.location.origin : '')

const EMPTY: Prep = {
  packageName: '',
  versionName: APP_VERSION,
  versionCode: '1',
  privacyUrl: `${publicBase}${LEGAL_ROUTES.privacy}`,
  termsUrl: `${publicBase}${LEGAL_ROUTES.terms}`,
  iconConfirmed: false,
  featureConfirmed: false,
  testedOnDevice: false,
  closedTestDone: false,
  usesGoogleSignIn: false,
  sha256: '',
  shaAdded: false,
  snippetRequested: false,
  snippetPlaced: '',
  ready: {},
}

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

interface Extra {
  icon512: { ok: boolean; w: number; h: number }
  feature: { ok: boolean; w: number; h: number }
  urlStatus: Record<string, number | 'cross-origin' | 'pending'>
}

interface ItemDef {
  id: string
  kind: 'required' | 'conditional'
  title: string
  explain: string
  where: string
  /** Conditional items only show when this returns true. */
  applies?: (p: Prep) => boolean
  valid: (p: Prep, x: Extra) => { ok: boolean; why: string }
}

const isHttpsUrl = (v: string) => {
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' || u.hostname === 'localhost' || /^127\./.test(u.hostname)
  } catch {
    return false
  }
}
const SHA_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

/** Loads a same-origin path in a hidden frame and reports whether the app rendered a real page or its not-found screen. */
function probePage(path: string): Promise<'ok' | 'not-found'> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:700px;opacity:0;pointer-events:none'
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.setTimeout(() => {
        const text = frame.contentDocument?.body?.innerText ?? ''
        frame.remove()
        resolve(/Page not found|That link does not go anywhere/.test(text) ? 'not-found' : 'ok')
      }, 900)
    }
    frame.onload = finish
    window.setTimeout(finish, 6000)
    frame.src = path + (path.includes('?') ? '&' : '?') + 'probe=1'
    document.body.appendChild(frame)
  })
}

const urlWhy = (v: string, status: Extra['urlStatus'][string] | undefined) => {
  if (!isHttpsUrl(v)) return { ok: false, why: 'Must be a full https:// address.' }
  if (status === 'pending') return { ok: false, why: 'Checking…' }
  if (status === 'cross-origin') return { ok: true, why: 'Address looks valid; on another origin, so open it to confirm it loads.' }
  if (typeof status === 'number' && status === 200) return { ok: true, why: 'Responds 200 on this origin.' }
  if (status === 404) return { ok: false, why: 'That address shows the not-found screen; the page must exist.' }
  if (typeof status === 'number') return { ok: false, why: `Responds ${status || 'nothing'}; the page must load publicly.` }
  return { ok: false, why: 'Checking…' }
}

const ITEMS: ItemDef[] = [
  {
    id: 'icon',
    kind: 'required',
    title: 'Final logo: 512 × 512 PNG',
    explain: 'Play Console needs one 512-pixel PNG app icon (32-bit, up to 1 MB). Google rounds the corners itself, so the file should be a full square. The app exports it as icon-512.png; the preview below is that exact file.',
    where: 'Run npm run logo:export; the file is public/icon-512.png.',
    valid: (p, x) => (x.icon512.ok && x.icon512.w === 512 && x.icon512.h === 512 && p.iconConfirmed ? { ok: true, why: 'icon-512.png is 512 × 512 and confirmed.' } : { ok: false, why: x.icon512.ok ? (x.icon512.w === 512 ? 'Tick the confirmation after checking the preview.' : `File is ${x.icon512.w} × ${x.icon512.h}, not 512 × 512.`) : 'icon-512.png is not served; run npm run logo:export.' }),
  },
  {
    id: 'feature',
    kind: 'required',
    title: 'Feature graphic: 1024 × 500 PNG',
    explain: 'Play Console requires a 1024 × 500 feature graphic for the listing. The app exports one on the navy ground with the mark centred; you may replace it with your own artwork of the same size.',
    where: 'Run npm run logo:export; the file is public/play-feature-1024x500.png.',
    valid: (p, x) => (x.feature.ok && x.feature.w === 1024 && x.feature.h === 500 && p.featureConfirmed ? { ok: true, why: 'Feature graphic is 1024 × 500 and confirmed.' } : { ok: false, why: x.feature.ok ? (x.feature.w === 1024 ? 'Tick the confirmation after checking the preview.' : `File is ${x.feature.w} × ${x.feature.h}, not 1024 × 500.`) : 'play-feature-1024x500.png is not served; run npm run logo:export.' }),
  },
  {
    id: 'package',
    kind: 'required',
    title: 'Package name',
    explain: 'The unique Android application ID, for example com.yourcompany.subscriptiontracker. Lowercase reverse-domain form; each part starts with a letter. It cannot be changed after the first upload.',
    where: 'Set in the Android / wrapper project (applicationId) and entered when creating the app in Play Console.',
    valid: (p) => (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(p.packageName.trim()) ? { ok: true, why: 'Valid application ID.' } : { ok: false, why: 'Lowercase, at least three dot-separated parts, each starting with a letter, for example com.example.subscriptiontracker.' }),
  },
  {
    id: 'version',
    kind: 'required',
    title: 'Version name and version code',
    explain: 'Version name is what users see (1.0). Version code is a whole number that must increase with every upload.',
    where: 'Set in the Android / wrapper project (versionName and versionCode).',
    valid: (p) => (/^\d+(\.\d+){1,2}$/.test(p.versionName.trim()) && /^[1-9]\d*$/.test(p.versionCode.trim()) ? { ok: true, why: `Version ${p.versionName.trim()}, code ${p.versionCode.trim()}.` } : { ok: false, why: 'Version like 1.0 and a positive whole-number code.' }),
  },
  {
    id: 'privacyUrl',
    kind: 'required',
    title: 'Privacy Policy URL',
    explain: 'Play Console requires a public privacy policy link on the listing and in the Data safety form. The app serves its policy at /legal/privacy on the public origin.',
    where: 'Store listing → App content → Privacy policy.',
    valid: (p, x) => urlWhy(p.privacyUrl, x.urlStatus.privacyUrl),
  },
  {
    id: 'termsUrl',
    kind: 'required',
    title: 'Terms of Use URL',
    explain: 'Not a Play Console field, but the listing description and the app link to it, so it must load publicly.',
    where: 'The app serves it at /legal/terms on the public origin.',
    valid: (p, x) => urlWhy(p.termsUrl, x.urlStatus.termsUrl),
  },
  {
    id: 'testing',
    kind: 'required',
    title: 'Testing confirmation',
    explain: 'Personal developer accounts created after November 2023 must run a closed test with at least 12 testers opted in for 14 days before applying for production. Organisation accounts skip that, but every account should still test the build on a real Android phone.',
    where: 'Play Console → Testing → Closed testing; then Production → Apply for production access if prompted.',
    valid: (p) => (p.testedOnDevice && p.closedTestDone ? { ok: true, why: 'Tested on a device and the closed-test requirement is handled.' } : { ok: false, why: 'Tick both confirmations once they are true.' }),
  },
  {
    id: 'sha',
    kind: 'conditional',
    title: 'Google Sign-In: SHA-256 fingerprint registered',
    explain: 'Only if the Android build uses Google Sign-In. Google verifies the app by the SHA-256 of the signing certificate. With Play App Signing, that is the certificate Google holds, not your upload key, so copy the SHA-256 from Play Console and add it to the OAuth client (or Firebase project). Subscription Tracker currently signs in with email and password only, so this applies only if you add Google Sign-In.',
    where: 'Play Console → Test and release → Setup → App signing → App signing key certificate → SHA-256 certificate fingerprint. Add it at console.cloud.google.com → Credentials → the Android OAuth client.',
    applies: (p) => p.usesGoogleSignIn,
    valid: (p) => (SHA_RE.test(p.sha256.trim().toUpperCase()) && p.shaAdded ? { ok: true, why: 'Fingerprint has the right shape and is confirmed registered.' } : { ok: false, why: SHA_RE.test(p.sha256.trim().toUpperCase()) ? 'Tick the confirmation once it is added to the OAuth client.' : 'Paste the SHA-256 as 32 colon-separated pairs, for example AB:CD:…' }),
  },
  {
    id: 'snippet',
    kind: 'conditional',
    title: 'Google snippet placed',
    explain: 'Only if Play Console asks you to add a Google-provided snippet (for example a site-verification tag for the website linked from the listing, or an ads / analytics snippet). This app ships with no analytics or ad trackers by policy, so add a snippet only when Play Console requires it, and update the Privacy Policy if it collects anything.',
    where: 'Wherever Play Console pointed you: usually the website’s <head> or the app’s index.html.',
    applies: (p) => p.snippetRequested,
    valid: (p) => (p.snippetPlaced.trim().length > 2 ? { ok: true, why: `Placed: ${p.snippetPlaced.trim()}.` } : { ok: false, why: 'Say where the snippet was placed.' }),
  },
]

export function GooglePlayPrep() {
  const toast = useToast()
  const [prep, setPrep] = useState<Prep>(read)
  const [help, setHelp] = useState<ItemDef | null>(null)
  const [extra, setExtra] = useState<Extra>({ icon512: { ok: false, w: 0, h: 0 }, feature: { ok: false, w: 0, h: 0 }, urlStatus: {} })
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  const probeImage = (src: string) =>
    new Promise<{ ok: boolean; w: number; h: number }>((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ ok: false, w: 0, h: 0 })
      img.src = src + '?v=' + Date.now()
    })

  useEffect(() => {
    void (async () => {
      const [icon512, feature] = await Promise.all([probeImage('/icon-512.png'), probeImage('/play-feature-1024x500.png')])
      setExtra((x) => ({ ...x, icon512, feature }))
    })()
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  // Check the two URLs: same-origin addresses are fetched, others can only be validated by shape.
  useEffect(() => {
    let cancelled = false
    const check = async (id: 'privacyUrl' | 'termsUrl', value: string) => {
      if (!isHttpsUrl(value)) return
      let u: URL
      try {
        u = new URL(value.trim())
      } catch {
        return
      }
      if (u.origin !== window.location.origin) {
        setExtra((x) => ({ ...x, urlStatus: { ...x.urlStatus, [id]: 'cross-origin' } }))
        return
      }
      setExtra((x) => ({ ...x, urlStatus: { ...x.urlStatus, [id]: 'pending' } }))
      let status = 0
      try {
        const res = await fetch(u.pathname + u.search, { cache: 'no-store' })
        await res.arrayBuffer().catch(() => undefined)
        status = res.status
      } catch {
        status = 0
      }
      // The app answers 200 for every path, so also render the page and make sure it is not the not-found screen.
      if (status === 200) {
        const shown = await probePage(u.pathname + u.search)
        if (shown === 'not-found') status = 404
      }
      if (!cancelled) setExtra((x) => ({ ...x, urlStatus: { ...x.urlStatus, [id]: status } }))
    }
    const t = window.setTimeout(() => {
      void check('privacyUrl', prep.privacyUrl)
      void check('termsUrl', prep.termsUrl)
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [prep.privacyUrl, prep.termsUrl])

  const visible = ITEMS.filter((i) => !i.applies || i.applies(prep))
  const validity = useMemo(() => Object.fromEntries(ITEMS.map((i) => [i.id, i.valid(prep, extra)])), [prep, extra])

  const update = (patch: Partial<Prep>) => {
    setPrep((p) => {
      const next = { ...p, ...patch }
      const ready = { ...next.ready }
      for (const item of ITEMS) if (!item.valid(next, extra).ok) delete ready[item.id]
      next.ready = ready
      write(next)
      return next
    })
  }
  const setReady = (id: string, on: boolean) => update({ ready: { ...prep.ready, [id]: on } })
  const readyCount = visible.filter((i) => prep.ready[i.id] && validity[i.id].ok).length
  const allReady = readyCount === visible.length

  const summary = useMemo(
    () =>
      [
        `${APP_NAME} · Google Play preparation · ${new Date().toISOString().slice(0, 10)}`,
        `Status: ${allReady ? 'READY TO UPLOAD' : `${readyCount} of ${visible.length} ready`}`,
        '',
        `Package name: ${prep.packageName.trim() || '(not set)'}`,
        `Version: ${prep.versionName.trim() || '(not set)'} (code ${prep.versionCode.trim() || '(not set)'})`,
        `Privacy Policy URL: ${prep.privacyUrl.trim() || '(not set)'}`,
        `Terms URL: ${prep.termsUrl.trim() || '(not set)'}`,
        `Icon 512: ${extra.icon512.ok ? `${extra.icon512.w} × ${extra.icon512.h}${prep.iconConfirmed ? ', confirmed' : ''}` : 'not served'}`,
        `Feature graphic: ${extra.feature.ok ? `${extra.feature.w} × ${extra.feature.h}${prep.featureConfirmed ? ', confirmed' : ''}` : 'not served'}`,
        `Tested on a device: ${prep.testedOnDevice ? 'yes' : 'no'} · Closed test handled: ${prep.closedTestDone ? 'yes' : 'no'}`,
        `Google Sign-In: ${prep.usesGoogleSignIn ? `yes · SHA-256 ${prep.sha256 ? '…' + prep.sha256.trim().slice(-8) : '(not set)'}${prep.shaAdded ? ', registered' : ''}` : 'not used'}`,
        `Google snippet: ${prep.snippetRequested ? prep.snippetPlaced.trim() || '(requested, not placed)' : 'not requested by Play Console'}`,
        '',
        ...visible.map((i) => `[${prep.ready[i.id] && validity[i.id].ok ? 'x' : ' '}] ${i.kind === 'conditional' ? '(conditional) ' : ''}${i.title} — ${validity[i.id].why}`),
      ].join('\n'),
    [prep, extra, validity, visible, allReady, readyCount],
  )
  const downloadHref = useMemo(() => `data:text/plain;charset=utf-8,${encodeURIComponent(summary)}`, [summary])

  const copySummary = async () => {
    if (await copyText(summary)) {
      setCopied(true)
      toast.success('Summary copied')
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } else toast.error('Clipboard is blocked here. Use Download instead.')
  }

  const renderItem = (item: ItemDef) => {
    const v = validity[item.id]
    const ready = !!prep.ready[item.id] && v.ok
    return (
      <li key={item.id} className="p-4" data-play-item={item.id} data-kind={item.kind} data-valid={v.ok ? 'yes' : 'no'} data-ready={ready ? 'yes' : 'no'}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ready ? 'bg-mint-500 text-navy-900' : v.ok ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-faint'}`}>
            <Icon name={ready ? 'check' : v.ok ? 'sparkle' : 'clock'} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[0.9375rem] font-semibold text-ink">{item.title}</p>
              <span className={`inline-flex h-6 items-center rounded-full px-2 text-[0.6875rem] font-bold uppercase tracking-wide ${item.kind === 'required' ? 'bg-coral-50 text-coral-700' : 'bg-navy-50 text-navy-700'}`}>{item.kind}</span>
              <button type="button" onClick={() => setHelp(item)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[0.8125rem] font-semibold text-navy-800 hover:bg-navy-50" aria-label={`What is ${item.title}?`}>
                <Icon name="info" size={16} /> What is this?
              </button>
            </div>
            <div className="mt-2">
              <PlayField item={item} prep={prep} extra={extra} update={update} />
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
  }

  return (
    <Card className="overflow-hidden" data-play-prep>
      <div className="p-4">
        <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-700">Google Play preparation</p>
        <p className="mt-1 text-[0.9375rem] font-bold leading-tight text-navy-900" data-play-summary>
          {allReady ? 'Ready to upload' : `${readyCount} of ${visible.length} ready`}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-muted">Required items always apply. Conditional items appear only when you say they apply below. Values stay in this browser's owner storage.</p>
      </div>

      <div className="border-t border-line px-4 py-2">
        <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-coral-700">Required</p>
      </div>
      <ul className="divide-y divide-line border-t border-line">{visible.filter((i) => i.kind === 'required').map(renderItem)}</ul>

      <div className="border-t border-line px-4 py-3">
        <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-navy-700">Conditional · only if it applies</p>
        <div className="mt-1 divide-y divide-line">
          <Toggle label="The Android build uses Google Sign-In" description="Adds the SHA-256 fingerprint reminder" checked={prep.usesGoogleSignIn} onChange={(v) => update({ usesGoogleSignIn: v })} />
          <Toggle label="Play Console asked for a Google snippet" description="Adds a reminder to place it and update the Privacy Policy" checked={prep.snippetRequested} onChange={(v) => update({ snippetRequested: v })} />
        </div>
      </div>
      {visible.some((i) => i.kind === 'conditional') ? (
        <ul className="divide-y divide-line border-t border-line">{visible.filter((i) => i.kind === 'conditional').map(renderItem)}</ul>
      ) : (
        <p className="border-t border-line px-4 py-3 text-[0.8125rem] text-muted" data-play-none>
          No conditional items apply. Subscription Tracker signs in with email and password only and ships no trackers, so nothing extra is needed unless you add Google Sign-In or Play Console asks for a snippet.
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line p-4">
        <Button variant={copied ? 'primary' : 'secondary'} onClick={copySummary} leading={<Icon name={copied ? 'check' : 'copy'} size={16} />}>
          {copied ? 'Copied' : 'Copy summary'}
        </Button>
        <a href={downloadHref} download="google-play-preparation.txt" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-navy-50 px-5 text-[0.9375rem] font-semibold text-navy-900 hover:bg-navy-100 active:bg-navy-200" data-download>
          <Icon name="download" size={16} /> Download summary
        </a>
      </div>

      <Sheet open={help !== null} onClose={() => setHelp(null)} title={help?.title ?? ''}>
        {help && (
          <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink">
            <p>{help.explain}</p>
            <p className="rounded-xl bg-navy-50 px-3 py-2 text-[0.875rem] text-navy-900">
              <span className="font-semibold">Where:</span> {help.where}
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

function PlayField({ item, prep, extra, update }: { item: ItemDef; prep: Prep; extra: Extra; update: (p: Partial<Prep>) => void }) {
  const link = 'inline-flex min-h-11 items-center gap-1 text-[0.8125rem] font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2'
  switch (item.id) {
    case 'icon':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <img src="/icon-512.png" alt="Final Play icon preview" width={96} height={96} className="h-24 w-24 rounded-[22px] bg-navy-50" data-icon-preview />
            <p className="text-[0.8125rem] text-muted">{extra.icon512.ok ? `${extra.icon512.w} × ${extra.icon512.h} px` : 'Not served'}</p>
          </div>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={prep.iconConfirmed} disabled={!extra.icon512.ok} onChange={(e) => update({ iconConfirmed: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2DD4BF]" />
            <span className="text-[0.875rem] leading-snug text-ink">This is the final icon and it is under 1 MB.</span>
          </label>
        </div>
      )
    case 'feature':
      return (
        <div className="space-y-2">
          <img src="/play-feature-1024x500.png" alt="Feature graphic preview" className="w-full max-w-[320px] rounded-xl bg-navy-50" data-feature-preview />
          <p className="text-[0.8125rem] text-muted">{extra.feature.ok ? `${extra.feature.w} × ${extra.feature.h} px` : 'Not served'}</p>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={prep.featureConfirmed} disabled={!extra.feature.ok} onChange={(e) => update({ featureConfirmed: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2DD4BF]" />
            <span className="text-[0.875rem] leading-snug text-ink">This is the feature graphic I will upload.</span>
          </label>
        </div>
      )
    case 'package':
      return <TextField label="Package name" value={prep.packageName} onChange={(e) => update({ packageName: e.target.value.trim().toLowerCase() })} placeholder="com.example.subscriptiontracker" autoComplete="off" spellCheck={false} />
    case 'version':
      return (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Version name" value={prep.versionName} onChange={(e) => update({ versionName: e.target.value })} placeholder="1.0" inputMode="decimal" />
          <TextField label="Version code" value={prep.versionCode} onChange={(e) => update({ versionCode: e.target.value })} placeholder="1" inputMode="numeric" />
        </div>
      )
    case 'privacyUrl':
    case 'termsUrl': {
      const key = item.id as 'privacyUrl' | 'termsUrl'
      return (
        <div>
          <TextField label={key === 'privacyUrl' ? 'Privacy Policy URL' : 'Terms of Use URL'} type="url" inputMode="url" value={prep[key]} onChange={(e) => update({ [key]: e.target.value } as Partial<Prep>)} autoComplete="off" spellCheck={false} />
          {isHttpsUrl(prep[key]) && (
            <a href={prep[key].trim()} target="_blank" rel="noreferrer" className={link}>
              Open in a new tab <Icon name="external" size={14} />
            </a>
          )}
        </div>
      )
    }
    case 'testing':
      return (
        <div className="space-y-1">
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={prep.testedOnDevice} onChange={(e) => update({ testedOnDevice: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2DD4BF]" />
            <span className="text-[0.875rem] leading-snug text-ink">Installed and tested the release build on a real Android phone.</span>
          </label>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={prep.closedTestDone} onChange={(e) => update({ closedTestDone: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2DD4BF]" />
            <span className="text-[0.875rem] leading-snug text-ink">Closed test completed (12 testers for 14 days) or not required for this account type.</span>
          </label>
        </div>
      )
    case 'sha':
      return (
        <div className="space-y-2">
          <p className="rounded-xl bg-coral-50 px-3 py-2 text-[0.8125rem] leading-snug text-coral-700" data-sha-reminder>
            Reminder: with Play App Signing, register the SHA-256 of the <span className="font-semibold">app signing key certificate</span> from Play Console, not your upload key, or Google Sign-In fails in production.
          </p>
          <TextField label="SHA-256 fingerprint" value={prep.sha256} onChange={(e) => update({ sha256: e.target.value.toUpperCase().replace(/[^0-9A-F:]/g, '') })} placeholder="AB:CD:EF:…" autoComplete="off" spellCheck={false} />
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={prep.shaAdded} onChange={(e) => update({ shaAdded: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2DD4BF]" />
            <span className="text-[0.875rem] leading-snug text-ink">Added to the Android OAuth client (or Firebase project).</span>
          </label>
        </div>
      )
    case 'snippet':
      return (
        <div className="space-y-2">
          <p className="rounded-xl bg-navy-50 px-3 py-2 text-[0.8125rem] leading-snug text-navy-900" data-snippet-reminder>
            Reminder: this app ships with no analytics or ad trackers. If the snippet collects anything, update the Privacy Policy’s data types before release.
          </p>
          <TextField label="Where the snippet was placed" value={prep.snippetPlaced} onChange={(e) => update({ snippetPlaced: e.target.value })} placeholder="index.html <head>, site verification tag" autoComplete="off" />
        </div>
      )
    default:
      return null
  }
}

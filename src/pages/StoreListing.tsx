import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { copyText } from '@/lib/referral'
import { CLAIMS, FULL_DESCRIPTION, KEYWORD_FIELD, KEYWORDS, LISTING_LIMITS, NAME_OPTIONS, PROMO, RELEASE_NOTES, SHORT_DESCRIPTION, SUBTITLE, forbiddenHits } from '@/lib/storeListing'
import NotFound from '@/pages/NotFound'

/**
 * Owner-only store listing: every section can be copied on its own, every length is checked against the store
 * limit, and every feature claim points at the screen that delivers it. Same gate as the screenshot preview.
 */
export default function StoreListing() {
  const key = (import.meta.env.VITE_STORE_PREVIEW_KEY as string | undefined)?.trim()
  const provided = new URLSearchParams(window.location.search).get('key')
  const allowed = import.meta.env.DEV || (!!key && provided === key)
  if (!allowed) return <NotFound />

  const keywordField = KEYWORD_FIELD
  const everything = [
    `NAME OPTIONS\n${NAME_OPTIONS.join('\n')}`,
    `SUBTITLE\n${SUBTITLE}`,
    `PROMOTIONAL TEXT\n${PROMO}`,
    `SHORT DESCRIPTION\n${SHORT_DESCRIPTION}`,
    `FULL DESCRIPTION\n${FULL_DESCRIPTION}`,
    `KEYWORD IDEAS\n${KEYWORDS.join('\n')}`,
    `APP STORE KEYWORD FIELD\n${keywordField}`,
    `RELEASE NOTES\n${RELEASE_NOTES}`,
  ].join('\n\n')
  const hits = forbiddenHits(everything)

  return (
    <div className="min-h-dvh bg-canvas pb-16">
      <div className="bg-navy-900 text-white">
        <div className="mx-auto flex max-w-[720px] items-center gap-3 px-4 py-5">
          <Logo size={40} tile={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-400">Owner only · not linked from the app</p>
            <h1 className="text-[1.375rem] font-bold leading-tight">Store listing</h1>
          </div>
          <Link to="/__store" className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-3 text-[0.8125rem] font-semibold">
            Screenshots
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] space-y-5 px-4 pt-5">
        <Card className={`p-4 ${hits.length ? 'border-coral-100 bg-coral-50' : 'border-mint-100 bg-mint-50'}`}>
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${hits.length ? 'bg-coral-100 text-coral-700' : 'bg-mint-100 text-mint-700'}`}>
              <Icon name={hits.length ? 'alert' : 'shield'} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-bold text-navy-900">{hits.length ? `Check the copy: ${hits.join(', ')}` : 'No invented awards, ratings, user counts or unsupported push claims'}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">Written for people who want control of their monthly digital spending. Every feature line below is tied to a screen in the app.</p>
            </div>
          </div>
          <div className="mt-3">
            <CopyButton text={everything} label="Copy the whole listing" full />
          </div>
        </Card>

        <Section title="App name · five options" hint={`Under ${LISTING_LIMITS.name} characters each`} text={NAME_OPTIONS.join('\n')}>
          <ul className="divide-y divide-line">
            {NAME_OPTIONS.map((n, i) => (
              <li key={n} className="flex items-center gap-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-50 text-[0.75rem] font-bold text-navy-800">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold text-ink">{n}</span>
                <Count n={n.length} max={LISTING_LIMITS.name} strict />
                <CopyButton text={n} label="Copy" small />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Subtitle · chosen" hint={`Up to ${LISTING_LIMITS.subtitle} characters`} text={SUBTITLE} count={<Count n={SUBTITLE.length} max={LISTING_LIMITS.subtitle} />}>
          <p className="text-[1.125rem] font-bold text-navy-900">{SUBTITLE}</p>
        </Section>

        <Section title="Promotional text" hint={`Up to ${LISTING_LIMITS.promo} characters`} text={PROMO} count={<Count n={PROMO.length} max={LISTING_LIMITS.promo} />}>
          <p className="text-[0.9375rem] leading-relaxed text-ink">{PROMO}</p>
        </Section>

        <Section title="Short description" hint={`Up to ${LISTING_LIMITS.short} characters`} text={SHORT_DESCRIPTION} count={<Count n={SHORT_DESCRIPTION.length} max={LISTING_LIMITS.short} />}>
          <p className="text-[0.9375rem] leading-relaxed text-ink">{SHORT_DESCRIPTION}</p>
        </Section>

        <Section title="Full description" hint={`Outcomes first, then features · up to ${LISTING_LIMITS.full} characters`} text={FULL_DESCRIPTION} count={<Count n={FULL_DESCRIPTION.length} max={LISTING_LIMITS.full} />}>
          <pre className="whitespace-pre-wrap font-sans text-[0.9375rem] leading-relaxed text-ink">{FULL_DESCRIPTION}</pre>
        </Section>

        <Section title="Keywords · ten ideas" hint="Phrases people search for; use them in the description and the field below" text={KEYWORDS.join('\n')}>
          <div className="flex flex-wrap gap-2">
            {KEYWORDS.map((k) => (
              <span key={k} className="inline-flex h-11 items-center rounded-full border border-line bg-white px-3.5 text-[0.8125rem] font-semibold text-navy-800">
                {k}
              </span>
            ))}
          </div>
        </Section>

        <Section title="App Store keyword field" hint={`Single terms, comma-separated, up to ${LISTING_LIMITS.keywords} characters in total`} text={keywordField} count={<Count n={keywordField.length} max={LISTING_LIMITS.keywords} />}>
          <p className="break-words text-[0.9375rem] leading-relaxed text-ink">{keywordField}</p>
        </Section>

        <Section title="Release notes · version 1.0" hint="What's new text for the first release" text={RELEASE_NOTES}>
          <pre className="whitespace-pre-wrap font-sans text-[0.9375rem] leading-relaxed text-ink">{RELEASE_NOTES}</pre>
        </Section>

        <Card className="p-4">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-700">Claims check</p>
          <p className="mt-1 text-[0.8125rem] text-muted">Each statement in the listing and the screen that delivers it. Open one to confirm before submitting.</p>
          <ul className="mt-2 divide-y divide-line">
            {CLAIMS.map((c) => (
              <li key={c.claim}>
                <Link to={c.route} className="flex min-h-12 items-center gap-3 py-2 text-left">
                  <Icon name="check" size={16} className="shrink-0 text-mint-700" />
                  <span className="min-w-0 flex-1 text-[0.875rem] text-ink">{c.claim}</span>
                  <span className="shrink-0 text-[0.75rem] font-semibold text-navy-700">{c.route}</span>
                  <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Section({ title, hint, text, count, children }: { title: string; hint: string; text: string; count?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4" data-section={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1rem] font-bold leading-tight text-navy-900">{title}</h2>
          <p className="mt-0.5 text-[0.75rem] text-muted">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {count}
          <CopyButton text={text} label="Copy" small />
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

function Count({ n, max, strict = false }: { n: number; max: number; strict?: boolean }) {
  const ok = strict ? n < max : n <= max
  return (
    <span className={`tabular inline-flex h-7 shrink-0 items-center rounded-full px-2 text-[0.75rem] font-semibold ${ok ? 'bg-mint-100 text-mint-700' : 'bg-coral-100 text-coral-700'}`} aria-label={`${n} of ${max} characters${ok ? '' : ', too long'}`}>
      {n}/{max}
    </span>
  )
}

/** Copies one section and says so in the button itself; falls back to a select-and-copy sheet when the clipboard is blocked. */
function CopyButton({ text, label, small = false, full = false }: { text: string; label: string; small?: boolean; full?: boolean }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true)
      toast.success('Copied')
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } else setFallback(true)
  }
  return (
    <>
      <Button size={small ? 'sm' : 'md'} variant={copied ? 'primary' : small ? 'secondary' : 'mint'} full={full} onClick={copy} leading={<Icon name={copied ? 'check' : 'copy'} size={16} />} aria-live="polite">
        {copied ? 'Copied' : label}
      </Button>
      <Sheet open={fallback} onClose={() => setFallback(false)} title="Copy by hand">
        <p className="text-[0.8125rem] text-muted">Clipboard access is blocked here. Select the text and copy it.</p>
        <textarea readOnly value={text} onFocus={(e) => e.target.select()} className="mt-2 h-48 w-full rounded-2xl border border-line bg-canvas p-3 text-[0.875rem] text-ink" />
        <Button full size="lg" variant="secondary" className="mt-3" onClick={() => setFallback(false)}>
          Done
        </Button>
      </Sheet>
    </>
  )
}

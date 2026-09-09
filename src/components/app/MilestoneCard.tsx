import { useEffect, useMemo, useRef, useState } from 'react'
import { markMilestonesSeen } from '@/db/repo'
import type { CancellationNote, PriceChange, RenewalCheck, Settings, Subscription } from '@/db/schema'
import { MILESTONES, type Milestone, type MilestoneContext } from '@/lib/milestones'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useReducedMotion } from '@/lib/motion'


const DOTS = Array.from({ length: 10 }).map((_, i) => {
  const angle = (i / 10) * Math.PI * 2
  return { dx: `${Math.round(Math.cos(angle) * 44)}px`, dy: `${Math.round(Math.sin(angle) * 44)}px`, color: i % 3 === 0 ? '#FF6B5B' : i % 3 === 1 ? '#2DD4BF' : '#0B1F3A' }
})

/** Share prewritten text: the native share sheet where available, otherwise the clipboard, otherwise a copy sheet. */
async function share(text: string, title: string, toast: ReturnType<typeof useToast>, onFallback: (t: string) => void) {
  const nav = navigator as Navigator & { share?: (data: { title: string; text: string }) => Promise<void> }
  try {
    if (nav.share) {
      await nav.share({ title, text })
      return
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return // user closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied. Paste it anywhere you like.')
  } catch {
    onFallback(text)
  }
}

/**
 * Celebrates a newly reached milestone inline, above the day's next action, so it never blocks anything.
 * Every milestone met right now is recorded as seen the moment one card shows, so a refresh cannot replay it.
 */
export function MilestoneCard({ subs, notes, changes, checks, settings, currency }: { subs: Subscription[]; notes: CancellationNote[]; changes: PriceChange[]; checks: RenewalCheck[]; settings: Settings; currency: string }) {
  const toast = useToast()
  const reduced = useReducedMotion()
  const [showing, setShowing] = useState<Milestone | null>(null)
  const [copyText, setCopyText] = useState<string | null>(null)
  const recorded = useRef(false)
  const ctx = useMemo<MilestoneContext>(() => ({ subs, notes, changes, checks, settings, currency }), [subs, notes, changes, checks, settings, currency])

  useEffect(() => {
    if (recorded.current || showing) return
    const seen = settings.milestonesSeen ?? {}
    const fresh = MILESTONES.filter((m) => !seen[m.id] && m.met(ctx))
    if (fresh.length === 0) return
    recorded.current = true
    setShowing(fresh[0])
    void markMilestonesSeen(fresh.map((m) => m.id))
  }, [ctx, settings.milestonesSeen, showing])

  if (!showing) return null
  const text = showing.share(ctx)

  return (
    <>
      <Card className="relative overflow-hidden border-mint-100 p-4" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            {!reduced &&
              DOTS.map((d, i) => (
                <span key={i} className="confetti-dot pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ ['--dx' as string]: d.dx, ['--dy' as string]: d.dy, background: d.color, animationDelay: `${i * 20}ms` }} aria-hidden="true" />
              ))}
            <span className={`${reduced ? '' : 'pop'} flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-500 text-navy-900 ring-4 ring-mint-100`}>
              <Icon name={showing.icon} size={24} />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-mint-700">Milestone</p>
            <p className="text-[1.0625rem] font-bold leading-tight text-navy-900">{showing.title}</p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{showing.body(ctx)}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="mint" className="flex-1" leading={<Icon name="external" size={16} />} onClick={() => share(text, showing.title, toast, setCopyText)}>
            Share
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowing(null)}>
            Nice
          </Button>
        </div>
      </Card>
      <Sheet open={copyText !== null} onClose={() => setCopyText(null)} title="Copy to share">
        <textarea readOnly value={copyText ?? ''} onFocus={(e) => e.target.select()} className="h-32 w-full rounded-2xl border border-line bg-canvas p-3 text-[0.875rem] text-ink" />
        <Button full size="lg" variant="secondary" className="mt-3" onClick={() => setCopyText(null)}>
          Done
        </Button>
      </Sheet>
    </>
  )
}

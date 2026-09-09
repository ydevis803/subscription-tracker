import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card, Skeleton } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'
import { LAUNCH_ITEMS, expectedOrigin, onLiveOrigin, readMarks, writeMark, type AutoResult, type LaunchMark } from '@/lib/launch'
import { ALL_GUIDES, detectPlatform, installGuide } from '@/lib/install'
import { AppStorePrep } from '@/components/app/AppStorePrep'
import { GooglePlayPrep } from '@/components/app/GooglePlayPrep'
import NotFound from '@/pages/NotFound'

/**
 * Owner-only launch checklist for the web / PWA release. Items can be marked “Tested live” only while this page is
 * open on the published origin; marks record where and when they were made. Automated pre-checks run first.
 */
export default function Launch() {
  const key = (import.meta.env.VITE_STORE_PREVIEW_KEY as string | undefined)?.trim()
  const provided = new URLSearchParams(window.location.search).get('key')
  const allowed = import.meta.env.DEV || (!!key && provided === key)
  const toast = useToast()
  const [marks, setMarks] = useState<Record<string, LaunchMark>>({})
  const [auto, setAuto] = useState<Record<string, AutoResult | 'running'>>({})
  const live = onLiveOrigin()
  const expected = expectedOrigin()

  const runAuto = useCallback(async () => {
    setAuto(Object.fromEntries(LAUNCH_ITEMS.filter((i) => i.auto).map((i) => [i.id, 'running' as const])))
    for (const item of LAUNCH_ITEMS) {
      if (!item.auto) continue
      let r: AutoResult
      try {
        r = await item.auto()
      } catch (e) {
        r = { ok: false, evidence: `Check could not run: ${e instanceof Error ? e.message : String(e)}` }
      }
      setAuto((prev) => ({ ...prev, [item.id]: r }))
    }
  }, [])

  useEffect(() => {
    if (!allowed) return
    setMarks(readMarks())
    void runAuto()
  }, [allowed, runAuto])

  if (!allowed) return <NotFound />

  const mark = (id: string, status: 'tested' | 'failed') => {
    if (!live) {
      toast.error(`Marks are only accepted on the published site${expected ? ` (${expected})` : ''}. Open this page there.`)
      return
    }
    const m: LaunchMark = { status, at: new Date().toISOString(), origin: window.location.origin }
    writeMark(id, m)
    setMarks(readMarks())
    toast.success(status === 'tested' ? 'Marked as tested live' : 'Marked as failed')
  }
  const clear = (id: string) => {
    writeMark(id, null)
    setMarks(readMarks())
  }

  const tested = LAUNCH_ITEMS.filter((i) => marks[i.id]?.status === 'tested').length
  const failed = LAUNCH_ITEMS.filter((i) => marks[i.id]?.status === 'failed').length
  const platform = detectPlatform()

  return (
    <div className="min-h-dvh bg-canvas pb-16">
      <div className="bg-navy-900 text-white">
        <div className="mx-auto flex max-w-[720px] items-center gap-3 px-4 py-5">
          <Logo size={40} tile={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-400">Owner only · web / PWA release</p>
            <h1 className="text-[1.375rem] font-bold leading-tight">Launch checklist</h1>
          </div>
          <Link to="/__readiness" className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-3 text-[0.8125rem] font-semibold">
            Readiness
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] space-y-5 px-4 pt-5">
        <Card className={`p-4 ${live ? 'border-mint-100 bg-mint-50' : 'border-coral-100 bg-coral-50'}`} data-live={live ? 'yes' : 'no'}>
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${live ? 'bg-mint-100 text-mint-700' : 'bg-coral-100 text-coral-700'}`}>
              <Icon name={live ? 'check' : 'alert'} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-bold text-navy-900" data-summary>
                {live ? `On the published site · ${tested} of ${LAUNCH_ITEMS.length} tested live${failed ? ` · ${failed} failed` : ''}` : 'Not on the published site: marks are disabled here'}
              </p>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
                {expected
                  ? live
                    ? `This page is running on ${expected}. Test each item on a signed-out phone, then mark it.`
                    : `Open this page on ${expected} to mark items. You are on ${window.location.origin}.`
                  : 'Set VITE_APP_URL to the public address in .env and rebuild; until then nothing can be marked as tested live.'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="divide-y divide-line overflow-hidden">
          {LAUNCH_ITEMS.map((item, i) => {
            const m = marks[item.id]
            const a = auto[item.id]
            const autoOk = !item.auto || (a !== 'running' && a?.ok)
            return (
              <div key={item.id} className="p-4" data-item={item.id} data-status={m?.status ?? 'untested'}>
                <div className="flex items-start gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold ${m?.status === 'tested' ? 'bg-mint-500 text-navy-900' : m?.status === 'failed' ? 'bg-coral-100 text-coral-700' : 'bg-navy-50 text-navy-800'}`}>
                    {m?.status === 'tested' ? <Icon name="check" size={16} /> : m?.status === 'failed' ? <Icon name="alert" size={16} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[0.9375rem] font-semibold text-ink">{item.title}</p>
                      <span className={`inline-flex h-7 items-center rounded-full px-2 text-[0.75rem] font-semibold ${m?.status === 'tested' ? 'bg-mint-100 text-mint-700' : m?.status === 'failed' ? 'bg-coral-100 text-coral-700' : 'bg-navy-50 text-muted'}`}>
                        {m?.status === 'tested' ? 'Tested live' : m?.status === 'failed' ? 'Failed live' : 'Untested'}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{item.how}</p>
                    {item.auto && (
                      <p className={`mt-1.5 flex items-start gap-1.5 text-[0.75rem] leading-snug ${a === 'running' || !a ? 'text-faint' : a.ok ? 'text-mint-700' : 'text-coral-700'}`}>
                        <Icon name={a === 'running' || !a ? 'refresh' : a.ok ? 'check' : 'alert'} size={14} className="mt-0.5 shrink-0" />
                        <span>{a === 'running' || !a ? 'Checking this origin…' : a.evidence}</span>
                      </p>
                    )}
                    {!item.auto && a === undefined && <Skeleton className="hidden" />}
                    {m && (
                      <p className="mt-1.5 text-[0.75rem] text-faint">
                        Marked {new Date(m.at).toLocaleString()} on {m.origin}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="mint" disabled={!live || !autoOk} onClick={() => mark(item.id, 'tested')} leading={<Icon name="check" size={16} />}>
                    Tested live
                  </Button>
                  <Button size="sm" variant="danger" disabled={!live} onClick={() => mark(item.id, 'failed')} leading={<Icon name="alert" size={16} />}>
                    Failed
                  </Button>
                  {m && (
                    <Button size="sm" variant="ghost" onClick={() => clear(item.id)}>
                      Clear
                    </Button>
                  )}
                  <Link to={item.route} className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-[0.8125rem] font-semibold text-navy-800 hover:bg-navy-50">
                    Open {item.route} <Icon name="chevronRight" size={16} />
                  </Link>
                </div>
              </div>
            )
          })}
        </Card>

        <AppStorePrep />

        <GooglePlayPrep />

        <Card className="p-4">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-700">Add to Home Screen · what users are told</p>
          <p className="mt-1 text-[0.8125rem] text-muted">The same steps appear on /support, with the reader's own platform first. You appear to be on: {installGuide(platform).title}.</p>
          <div className="mt-3 space-y-3">
            {ALL_GUIDES.map((p) => {
              const g = installGuide(p)
              return (
                <div key={p} className="rounded-xl bg-navy-50 p-3">
                  <p className="text-[0.875rem] font-semibold text-navy-900">{g.title}</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[0.8125rem] leading-snug text-ink">
                    {g.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  {g.note && <p className="mt-1 text-[0.75rem] text-muted">{g.note}</p>}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card, Skeleton } from '@/components/ui/Primitives'
import { READINESS_ITEMS, type ReadinessResult, type Tools } from '@/lib/readiness'
import NotFound from '@/pages/NotFound'

/**
 * Owner-only launch checklist. Each item runs a live check against the real screens (loaded in a hidden
 * same-origin frame) or against served files, and shows pass / fix / confirm with the evidence it saw.
 * Nothing is marked as passed by assumption: an item passes only when the check observed the requirement.
 */
export default function Readiness() {
  const key = (import.meta.env.VITE_STORE_PREVIEW_KEY as string | undefined)?.trim()
  const provided = new URLSearchParams(window.location.search).get('key')
  const allowed = import.meta.env.DEV || (!!key && provided === key)
  const [results, setResults] = useState<Record<string, ReadinessResult>>({})
  const [ranAt, setRanAt] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const running = useRef(false)

  const tools = useCallback((): Tools => {
    const page = (path: string) =>
      new Promise<{ text: string; doc: Document | null }>((resolve) => {
        const frame = frameRef.current
        if (!frame) return resolve({ text: '', doc: null })
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          window.setTimeout(() => {
            const doc = frame.contentDocument
            resolve({ text: doc?.body?.innerText ?? '', doc })
          }, 900)
        }
        frame.onload = finish
        frame.src = path + (path.includes('?') ? '&' : '?') + 'readiness=1'
        window.setTimeout(finish, 6000)
      })
    const fetchStatus = async (path: string) => {
      try {
        return (await fetch(path, { cache: 'no-store' })).status
      } catch {
        return 0
      }
    }
    return { page, fetchStatus }
  }, [])

  const runAll = useCallback(async () => {
    if (running.current) return
    running.current = true
    setResults(Object.fromEntries(READINESS_ITEMS.map((i) => [i.id, { status: 'running', evidence: 'Checking…' } as ReadinessResult])))
    const t = tools()
    for (const item of READINESS_ITEMS) {
      let r: ReadinessResult
      try {
        r = await item.run(t)
      } catch (e) {
        r = { status: 'fix', evidence: `Check could not run: ${e instanceof Error ? e.message : String(e)}`, action: 'Open the screen and check by hand.' }
      }
      setResults((prev) => ({ ...prev, [item.id]: r }))
    }
    setRanAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    running.current = false
  }, [tools])

  useEffect(() => {
    if (allowed) void runAll()
  }, [allowed, runAll])

  if (!allowed) return <NotFound />

  const counts = { pass: 0, fix: 0, confirm: 0, running: 0 }
  for (const r of Object.values(results)) counts[r.status]++
  const groups = [...new Set(READINESS_ITEMS.map((i) => i.group))]
  const done = counts.running === 0 && Object.keys(results).length === READINESS_ITEMS.length

  return (
    <div className="min-h-dvh bg-canvas pb-16">
      <div className="bg-navy-900 text-white">
        <div className="mx-auto flex max-w-[720px] items-center gap-3 px-4 py-5">
          <Logo size={40} tile={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-400">Owner only · not linked from the app</p>
            <h1 className="text-[1.375rem] font-bold leading-tight">Store readiness</h1>
          </div>
          <Link to="/__listing" className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-3 text-[0.8125rem] font-semibold">
            Listing
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] space-y-5 px-4 pt-5">
        <Card className={`p-4 ${done && counts.fix === 0 ? 'border-mint-100 bg-mint-50' : done ? 'border-coral-100 bg-coral-50' : ''}`} aria-live="polite">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done && counts.fix === 0 ? 'bg-mint-100 text-mint-700' : done ? 'bg-coral-100 text-coral-700' : 'bg-navy-50 text-navy-700'}`}>
              <Icon name={done ? (counts.fix === 0 ? 'check' : 'alert') : 'refresh'} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-bold text-navy-900" data-summary>
                {done ? `${counts.pass} pass · ${counts.fix} to fix · ${counts.confirm} to confirm by hand` : `Checking ${READINESS_ITEMS.length} launch requirements…`}
              </p>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
                Each check reads the real screen or served file and shows what it saw. {ranAt ? `Last run ${ranAt}.` : ''}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={runAll} disabled={!done} leading={<Icon name="refresh" size={18} />}>
              Run again
            </Button>
          </div>
        </Card>

        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-2 px-1 text-[0.75rem] font-semibold uppercase tracking-wide text-faint">{g}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {READINESS_ITEMS.filter((i) => i.group === g).map((item) => {
                const r = results[item.id]
                return (
                  <div key={item.id} className="p-4" data-item={item.id} data-status={r?.status ?? 'pending'}>
                    <div className="flex items-start gap-3">
                      <StatusBadge status={r?.status ?? 'running'} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.9375rem] font-semibold leading-snug text-ink">{item.title}</p>
                        {!r || r.status === 'running' ? (
                          <Skeleton className="mt-2 h-3 w-2/3" />
                        ) : (
                          <>
                            <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{r.evidence}</p>
                            {r.action && r.status !== 'pass' && (
                              <p className="mt-1.5 rounded-xl bg-navy-50 px-3 py-2 text-[0.8125rem] leading-snug text-navy-900">
                                <span className="font-semibold">To do:</span> {r.action}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Link to={item.route} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-[0.8125rem] font-semibold text-navy-800 hover:bg-navy-50">
                        Open {item.route} <Icon name="chevronRight" size={16} />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </Card>
          </section>
        ))}
      </div>

      {/* Hidden same-origin frame used by the checks; it never shows to the owner. */}
      <iframe ref={frameRef} title="Readiness check frame" aria-hidden="true" tabIndex={-1} className="pointer-events-none fixed -left-[9999px] top-0 h-[900px] w-[420px] opacity-0" />
    </div>
  )
}

function StatusBadge({ status }: { status: ReadinessResult['status'] }) {
  const map = {
    pass: { cls: 'bg-mint-100 text-mint-700', icon: 'check' as const, label: 'Pass' },
    fix: { cls: 'bg-coral-100 text-coral-700', icon: 'alert' as const, label: 'Fix' },
    confirm: { cls: 'bg-navy-50 text-navy-700', icon: 'eye' as const, label: 'Confirm' },
    running: { cls: 'bg-navy-50 text-faint', icon: 'refresh' as const, label: 'Checking' },
  }[status]
  return (
    <span className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[0.75rem] font-bold ${map.cls}`} aria-label={map.label}>
      <Icon name={map.icon} size={14} /> {map.label}
    </span>
  )
}

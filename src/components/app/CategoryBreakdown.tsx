import type { Subscription } from '@/db/schema'
import { CATEGORIES } from '@/db/schema'
import { formatMoney, isCounted, toMonthly } from '@/lib/money'

export interface CategoryTotal {
  id: string
  name: string
  color: string
  monthly: number
  count: number
}

export function categoryTotals(subs: Subscription[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>()
  for (const s of subs) {
    if (!isCounted(s)) continue
    const cat = CATEGORIES.find((c) => c.id === s.categoryId) ?? CATEGORIES[CATEGORIES.length - 1]
    const cur = map.get(cat.id) ?? { id: cat.id, name: cat.name, color: cat.color, monthly: 0, count: 0 }
    cur.monthly += toMonthly(s.amount, s.billingCycle)
    cur.count += 1
    map.set(cat.id, cur)
  }
  return [...map.values()].sort((a, b) => b.monthly - a.monthly)
}

export function Donut({ totals, size = 150, currency }: { totals: CategoryTotal[]; size?: number; currency: string }) {
  const total = totals.reduce((s, t) => s + t.monthly, 0)
  const r = 40
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Spending by category">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#EEF2F8" strokeWidth="14" />
        {total > 0 &&
          totals.map((t) => {
            const frac = t.monthly / total
            const dash = frac * c
            const el = (
              <circle
                key={t.id}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={t.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
                strokeLinecap="butt"
              />
            )
            offset += dash
            return el
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">per month</span>
        <span className="tabular text-lg font-bold text-navy-900">{formatMoney(total, currency, { compact: true })}</span>
      </div>
    </div>
  )
}

export function CategoryBars({ totals, currency, limit }: { totals: CategoryTotal[]; currency: string; limit?: number }) {
  const max = Math.max(...totals.map((t) => t.monthly), 1)
  const list = limit ? totals.slice(0, limit) : totals
  return (
    <ul className="space-y-3">
      {list.map((t) => (
        <li key={t.id}>
          <div className="mb-1 flex items-center justify-between text-[0.875rem]">
            <span className="flex items-center gap-2 font-medium text-ink">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              {t.name}
              <span className="text-[0.75rem] text-faint">
                {t.count} {t.count === 1 ? 'item' : 'items'}
              </span>
            </span>
            <span className="tabular font-semibold text-navy-900">{formatMoney(t.monthly, currency)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-navy-50">
            <div className="h-full rounded-full" style={{ width: `${(t.monthly / max) * 100}%`, background: t.color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

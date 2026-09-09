import { LegalLinks } from '@/components/app/LegalLayout'
import { useNavigate } from 'react-router-dom'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { leaveSheet } from '@/lib/navigation'

const REASONS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'refresh', title: 'Restore on any phone', body: 'Your subscriptions, notes and price history come back when you sign in somewhere new.' },
  { icon: 'crown', title: 'Premium follows you', body: 'A plan needs an owner. Your account keeps it attached to you, not to this browser.' },
  { icon: 'shield', title: 'Private by design', body: 'Only your email and a password. No card details, and nothing is shared with anyone.' },
]

/** Friendly explanation shown before we ever ask someone to create an account. */
export function AccountExplainerSheet({ open, onClose, reason, next = '/' }: { open: boolean; onClose: () => void; reason?: string; next?: string }) {
  const navigate = useNavigate()
  const go = (path: string) => {
    onClose()
    leaveSheet(navigate, `${path}?next=${encodeURIComponent(next)}`)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Keep your subscriptions safe">
      <p className="text-[0.9375rem] leading-relaxed text-muted">
        {reason ?? 'Everything you track lives on this device. A free account backs it up so clearing your browser or switching phones never loses it.'}
      </p>
      <ul className="mt-4 space-y-3">
        {REASONS.map((r) => (
          <li key={r.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
              <Icon name={r.icon} size={18} />
            </span>
            <span>
              <span className="block text-[0.9375rem] font-semibold text-ink">{r.title}</span>
              <span className="block text-[0.8125rem] leading-snug text-muted">{r.body}</span>
            </span>
          </li>
        ))}
      </ul>
      <Button full size="lg" variant="mint" className="mt-5" onClick={() => go('/auth/sign-up')}>
        Create a free account
      </Button>
      <Button full size="lg" variant="ghost" className="mt-2" onClick={() => go('/auth/sign-in')}>
        I already have one
      </Button>
      <LegalLinks className="mt-1" />
      <button onClick={onClose} className="mt-1 h-12 w-full rounded-2xl text-[0.9375rem] font-semibold text-muted">
        Not now
      </button>
    </Sheet>
  )
}

/** Soft, dismissible nudge for guests who have something worth saving. */
export function SaveProgressCard({ count, onOpen, onDismiss }: { count: number; onOpen: () => void; onDismiss?: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-mint-400">
          <Icon name="shield" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-ink">Save your progress</p>
          <p className="text-[0.8125rem] leading-snug text-muted">
            {count} {count === 1 ? 'subscription is' : 'subscriptions are'} only on this device. A free account backs them up and restores them on a new phone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={onOpen}>
              Back up my data
            </Button>
            {onDismiss && (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                Later
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

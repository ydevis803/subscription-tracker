import { useNavigate } from 'react-router-dom'
import { dismissInviteNudge } from '@/db/repo'
import { inviteProgress } from '@/lib/referral'
import type { Settings } from '@/db/schema'
import { Button, TextLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'

/** Home card offered only after a positive moment and never during a problem. The caller decides visibility via inviteNudgeVisible(). */
export function InviteCard({ settings, reason }: { settings: Settings; reason: string }) {
  const navigate = useNavigate()
  const progress = inviteProgress(settings)
  return (
    <Card className="border-mint-100 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
          <Icon name="gift" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mint-700">{reason}</p>
          <p className="text-[16px] font-bold leading-tight text-navy-900">Know someone who would like this feeling?</p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {progress.next ? `Send a personal invitation. ${progress.next.at - progress.count === 1 ? 'One more' : `${progress.next.at - progress.count} more`} earns the ${progress.next.title} badge.` : 'Send a personal invitation with your link.'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="mint" className="flex-1" onClick={() => navigate('/invite')} leading={<Icon name="external" size={16} />}>
          Invite a friend
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void dismissInviteNudge()}>
          Not now
        </Button>
      </div>
    </Card>
  )
}

/** A quiet one-line entry for the end of a good moment (completed check, settled decisions, a good week). */
export function InviteLink({ className = '', label = 'Invite a friend' }: { className?: string; label?: string }) {
  const navigate = useNavigate()
  return (
    <TextLink className={className} onClick={() => navigate('/invite')}>
      {label}
    </TextLink>
  )
}

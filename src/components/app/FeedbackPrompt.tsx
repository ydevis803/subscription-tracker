import { useEffect, useRef, useState } from 'react'
import { recordRatingAsk, recordRatingDismiss, recordRatingOutcome, saveFeedback } from '@/db/repo'
import { RATING_CAP_TEXT, RATING_HIGH_SCORE, storeUrl } from '@/lib/feedback'
import { describeError } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'

const LABELS = ['', 'Not working for me', 'Needs work', 'It is okay', 'Good', 'Love it']

/**
 * Inline rating prompt for Home. The caller decides visibility with ratingPromptVisible(); this card records the ask
 * the moment it appears, so the cooldown starts even if the user simply scrolls past. It never blocks anything.
 */
export function FeedbackPrompt() {
  const toast = useToast()
  const [score, setScore] = useState<number | null>(null)
  const [hidden, setHidden] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [storeOpen, setStoreOpen] = useState(false)
  const recorded = useRef(false)
  useEffect(() => {
    if (recorded.current) return
    recorded.current = true
    void recordRatingAsk()
  }, [])

  const pick = (n: number) => {
    setScore(n)
    if (n >= RATING_HIGH_SCORE) setStoreOpen(true)
    else setFeedbackOpen(true)
  }

  const notNow = () => {
    setHidden(true)
    void recordRatingDismiss()
    toast.info('No problem. We will not ask again for a while.')
  }

  if (hidden) return null
  return (
    <>
      <Card className="p-4" role="group" aria-label="Rate the app">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
            <Icon name="star" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-mint-700">Second check done</p>
            <p className="text-[1rem] font-bold leading-tight text-navy-900">How is Subscription Tracker working for you?</p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-muted">One tap. A low score opens a private note to us; a high one, a chance to rate the app.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Score out of five">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              aria-label={`${n} of 5: ${LABELS[n]}`}
              onClick={() => pick(n)}
              className={`flex h-12 items-center justify-center rounded-xl border text-navy-900 transition-colors active:bg-mint-100 ${score !== null && n <= score ? 'border-mint-500 bg-mint-100 text-mint-700' : 'border-line bg-white'}`}
            >
              <Icon name="star" size={22} fill={score !== null && n <= score ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[0.6875rem] leading-snug text-faint">{RATING_CAP_TEXT}</p>
          <Button size="sm" variant="ghost" className="shrink-0 whitespace-nowrap" onClick={notNow}>
            Not now
          </Button>
        </div>
      </Card>

      <FeedbackSheet
        open={feedbackOpen}
        score={score}
        source="prompt"
        onClose={() => {
          setFeedbackOpen(false)
          setScore(null)
        }}
        onSaved={() => {
          setFeedbackOpen(false)
          setHidden(true)
        }}
      />

      <Sheet
        open={storeOpen}
        onClose={() => {
          setStoreOpen(false)
          setScore(null)
        }}
        title="Thank you"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
            <Icon name="star" size={22} fill="currentColor" />
          </span>
          <div>
            <p className="text-[1rem] font-bold leading-tight text-navy-900">{score === 5 ? 'Love it? A rating helps others find it.' : 'Glad it is working. A rating helps others find it.'}</p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{storeUrl() ? 'Opens the store listing in a new tab.' : 'The store listing is not live yet. Tapping records that you would rate it, and we will not ask again.'}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Button
            full
            size="lg"
            variant="mint"
            leading={<Icon name="external" size={20} />}
            onClick={async () => {
              const url = storeUrl()
              if (url) window.open(url, '_blank', 'noopener')
              await recordRatingOutcome('rated', score ?? 5).catch(() => undefined)
              setStoreOpen(false)
              setHidden(true)
              toast.success(url ? 'Thank you for rating' : 'Thank you. Noted, and we will not ask again.')
            }}
          >
            {storeUrl() ? 'Rate on the App Store' : 'Rate on the App Store (coming soon)'}
          </Button>
          <Button
            full
            variant="ghost"
            onClick={() => {
              setStoreOpen(false)
              setScore(null)
            }}
          >
            Maybe later
          </Button>
        </div>
      </Sheet>
    </>
  )
}

/** Private feedback form. The note is saved with the user's own data only; it is never posted anywhere. */
export function FeedbackSheet({ open, score, source, onClose, onSaved }: { open: boolean; score: number | null; source: 'prompt' | 'settings'; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const send = async () => {
    if (inFlight.current) return
    if (message.trim().length < 3) return setError('Write a line or two so we know what to fix.')
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await saveFeedback({ score, message, source })
      if (source === 'prompt' && score !== null) await recordRatingOutcome('feedback', score)
      setMessage('')
      toast.success('Thank you. Your note is kept private with your data.')
      onSaved()
    } catch (e) {
      setError(describeError(e, 'save your feedback'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={score !== null && score < RATING_HIGH_SCORE ? 'What should be better?' : 'Send feedback'}>
      {score !== null && <p className="text-[0.8125rem] text-muted">You gave {score} of 5. Sorry it is not there yet. Tell us what got in the way and it goes straight on the fix list.</p>}
      <TextArea label="Your note" value={message} onChange={(e) => {
          setMessage(e.target.value)
          if (error) setError('')
        }} error={error} placeholder="What was confusing, missing or wrong?" autoFocus rows={4} maxLength={1000} className="mt-3" />
      <p className="mt-2 flex items-start gap-2 rounded-xl bg-navy-50 px-3 py-2 text-[0.75rem] leading-snug text-navy-800">
        <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-mint-700" />
        <span>Private. This note is stored with your own data and is never posted publicly or shown to other users.</span>
      </p>
      <div className="mt-4 space-y-2">
        <Button full size="lg" loading={busy} onClick={send}>
          Send privately
        </Button>
        <Button full variant="ghost" onClick={onClose} disabled={busy}>
          Not now
        </Button>
      </div>
    </Sheet>
  )
}

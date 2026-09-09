import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { probeConnection, useConnectivity } from '@/lib/connectivity'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'

/**
 * Shown while the network is down or the account backup cannot reach the server. Local saves keep working,
 * which the copy says plainly; it never promises full offline support. Clears itself when a request gets
 * through again, and Retry lets the user push a pending backup or re-check the connection at once.
 */
export function OfflineBanner() {
  const online = useConnectivity()
  const auth = useAuth()
  const toast = useToast()
  const [retrying, setRetrying] = useState(false)
  const [lastTry, setLastTry] = useState<'failed' | null>(null)
  const wasOffline = useRef(false)

  const backupTrouble = auth.status === 'signed-in' && (auth.sync.status === 'offline' || auth.sync.status === 'error')
  const visible = !online || backupTrouble

  // Keep sticky headers below the banner while it is up.
  useEffect(() => {
    document.documentElement.style.setProperty('--banner-h', visible ? '3.25rem' : '0px')
    return () => document.documentElement.style.setProperty('--banner-h', '0px')
  }, [visible])

  // Announce the recovery once, then get out of the way.
  useEffect(() => {
    if (!online) wasOffline.current = true
    else if (wasOffline.current && !backupTrouble) {
      wasOffline.current = false
      setLastTry(null)
      toast.success('Back online')
    }
  }, [online, backupTrouble, toast])

  if (!visible) return null

  const retry = async () => {
    setRetrying(true)
    setLastTry(null)
    const reachable = await probeConnection()
    if (reachable && auth.status === 'signed-in') await auth.retrySync()
    if (!reachable) setLastTry('failed')
    setRetrying(false)
  }

  const title = !online ? 'You are offline' : auth.sync.status === 'error' ? 'Backup could not reach the server' : 'Backup is waiting for a connection'
  const body = !online
    ? auth.status === 'signed-in'
      ? 'Everything you save stays on this phone and backs up once you are connected. Sign-in, backups and Premium need a connection.'
      : 'Everything you save stays on this phone. Creating an account or signing in needs a connection.'
    : auth.sync.message
      ? `${auth.sync.message}. Your changes are safe on this phone.`
      : 'Your changes are safe on this phone and will back up when the connection returns.'

  return (
    <div className="sticky top-0 z-40 border-b border-coral-100 bg-coral-50 safe-top" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-[480px] items-center gap-3 px-4 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral-100 text-coral-700">
          <Icon name="alert" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-semibold leading-tight text-coral-700">{title}</span>
          <span className="block text-[0.75rem] leading-snug text-navy-800">{lastTry === 'failed' ? 'Still no connection. Nothing was lost; try again in a moment.' : body}</span>
        </span>
        <Button size="sm" variant="coral" className="shrink-0" loading={retrying} onClick={retry}>
          Retry
        </Button>
      </div>
    </div>
  )
}

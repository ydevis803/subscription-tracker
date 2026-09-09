import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { ensureInitialized, rolloverRenewals } from '@/db/repo'
import { useProfile } from '@/hooks/useData'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { OfflineBanner } from '@/components/app/OfflineBanner'
import { CrashTest, ErrorBoundary } from '@/components/app/ErrorBoundary'
import { flushAnalytics } from '@/lib/analytics'
const OwnerAnalytics = lazy(() => import('@/pages/OwnerAnalytics'))
import { Logo } from '@/components/ui/Logo'
import { AppShell } from '@/components/layout/AppShell'
import { Card, ErrorState, Skeleton } from '@/components/ui/Primitives'
import { Spinner } from '@/components/ui/Button'
import Onboarding from '@/pages/Onboarding'
import Home from '@/pages/Home'
const Subscriptions = lazy(() => import('@/pages/Subscriptions'))
const SubscriptionDetail = lazy(() => import('@/pages/SubscriptionDetail'))
const SubscriptionForm = lazy(() => import('@/pages/SubscriptionForm'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const Insights = lazy(() => import('@/pages/Insights'))
const PriceHistory = lazy(() => import('@/pages/PriceHistory'))
const Notes = lazy(() => import('@/pages/Notes'))
const Profile = lazy(() => import('@/pages/Profile'))
const Settings = lazy(() => import('@/pages/Settings'))
const Premium = lazy(() => import('@/pages/Premium'))
const Invite = lazy(() => import('@/pages/Invite'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const RenewalCheck = lazy(() => import('@/pages/RenewalCheck'))
const Timeline = lazy(() => import('@/pages/Timeline'))
const MonthlyTotal = lazy(() => import('@/pages/MonthlyTotal'))
const WeeklySummary = lazy(() => import('@/pages/WeeklySummary'))
const Reminders = lazy(() => import('@/pages/Reminders'))
const Privacy = lazy(() => import('@/pages/legal/Privacy'))
const Terms = lazy(() => import('@/pages/legal/Terms'))
const Support = lazy(() => import('@/pages/legal/Support'))
const DeleteAccount = lazy(() => import('@/pages/legal/DeleteAccount'))
const StorePreview = lazy(() => import('@/pages/StorePreview'))
const StoreListing = lazy(() => import('@/pages/StoreListing'))
const Readiness = lazy(() => import('@/pages/Readiness'))
const Launch = lazy(() => import('@/pages/Launch'))
import { useReminderScheduler } from '@/lib/useReminderScheduler'
const SignUp = lazy(() => import('@/pages/auth/SignUp'))
const SignIn = lazy(() => import('@/pages/auth/SignIn'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))

type Boot = 'loading' | 'ready' | 'error'

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <ScopedApp />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

/** Remounts the whole data tree whenever the active account (and therefore database) changes. */
function ScopedApp() {
  const { status, scopeKey } = useAuth()
  if (status === 'loading') return <Splash message="Checking your account…" />
  return <AppRoutes key={scopeKey} />
}

function AppRoutes() {
  const [boot, setBoot] = useState<Boot>('loading')
  const [bootError, setBootError] = useState('')
  const profile = useProfile()
  const location = useLocation()
  const navigationType = useNavigationType()
  useReminderScheduler()
  const scrollPositions = useRef(new Map<string, number>())

  const start = useCallback(async () => {
    setBoot('loading')
    try {
      await ensureInitialized()
      await rolloverRenewals()
      setBoot('ready')
    } catch (e) {
      setBootError(e instanceof Error ? e.message : 'Local storage could not be opened.')
      setBoot('error')
    }
  }, [])

  useEffect(() => {
    void start()
    void flushAnalytics()
    const onOnline = () => void flushAnalytics()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [start])

  // Once Home is up and the browser is idle, fetch the chunks behind the tabs so the first tap never waits.
  useEffect(() => {
    if (boot !== 'ready' || !profile?.onboardingComplete) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    const run = () => {
      void Promise.all([import('@/pages/Subscriptions'), import('@/pages/Calendar'), import('@/pages/Insights'), import('@/pages/Profile'), import('@/pages/RenewalCheck'), import('@/pages/SubscriptionDetail')]).catch(() => undefined)
    }
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2500 })
    else window.setTimeout(run, 1200)
  }, [boot, profile?.onboardingComplete])

  // Remember where each screen was scrolled to, restore it on Back, start at the top on forward navigation.
  useEffect(() => {
    const key = location.key
    const onScroll = () => scrollPositions.current.set(key, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    if (navigationType === 'POP') {
      const target = scrollPositions.current.get(key) ?? 0
      const timers = [0, 60, 180, 400].map((ms) => window.setTimeout(() => window.scrollTo({ top: target }), ms))
      return () => {
        window.removeEventListener('scroll', onScroll)
        timers.forEach(clearTimeout)
      }
    }
    window.scrollTo({ top: 0 })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.key, navigationType])

  if (boot === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <ErrorState title="Could not open your data" body={`${bootError} Private browsing or a full disk can block local storage.`} onRetry={start} />
      </div>
    )
  }

  if (boot === 'loading' || !profile) {
    return <Splash />
  }

  const authRoutes = (
    <>
      {import.meta.env.DEV && <Route path="/__splash" element={<Splash />} />}
      {import.meta.env.DEV && <Route path="/__crash" element={<CrashTest />} />}
      {/* Owner-only store screenshot staging: development builds, or production with ?key=VITE_STORE_PREVIEW_KEY. Demo data only. */}
      <Route path="/__store" element={<StorePreview />} />
      <Route path="/__listing" element={<StoreListing />} />
      <Route path="/__readiness" element={<Readiness />} />
      <Route path="/__launch" element={<Launch />} />
      <Route path="/__analytics" element={<OwnerAnalytics />} />
      {/* Legal, support and deletion pages are reachable before any account exists. */}
      <Route path="/legal/privacy" element={<Privacy />} />
      <Route path="/legal/terms" element={<Terms />} />
      <Route path="/support" element={<Support />} />
      <Route path="/account/delete" element={<DeleteAccount />} />
      <Route path="/auth/sign-up" element={<SignUp />} />
      <Route path="/auth/sign-in" element={<SignIn />} />
      <Route path="/auth/forgot" element={<ForgotPassword />} />
      <Route path="/auth/reset" element={<ResetPassword />} />
    </>
  )

  if (!profile.onboardingComplete) {
    return (
      <>
        <OfflineBanner />
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            {authRoutes}
            <Route path="*" element={<Onboarding />} />
          </Routes>
        </Suspense>
      </>
    )
  }

  const fullScreen = /^\/subscriptions\/(new|\d+\/edit)$/.test(location.pathname) || location.pathname === '/premium' || location.pathname === '/check' || location.pathname.startsWith('/auth/')

  return (
    <AppShell nav={!fullScreen}>
      <OfflineBanner />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
        {authRoutes}
        <Route path="/" element={<Home />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/subscriptions/new" element={<SubscriptionForm />} />
        <Route path="/subscriptions/:id" element={<SubscriptionDetail />} />
        <Route path="/subscriptions/:id/edit" element={<SubscriptionForm />} />
        <Route path="/check" element={<RenewalCheck />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/total" element={<MonthlyTotal />} />
        <Route path="/week" element={<WeeklySummary />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/history" element={<PriceHistory />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/premium" element={<Premium />} />
        <Route path="/invite" element={<Invite />} />
        <Route path="/onboarding" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

/** Route fallback while a screen's code downloads for the first time: a header line and card shapes, never a spinner. */
function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[480px] px-4 pt-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-40" />
      <div className="mt-5 space-y-3">
        <Card className="p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-3 h-3 w-3/4" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-3/4" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="mt-3 h-3 w-1/2" />
        </Card>
      </div>
    </div>
  )
}

function Splash({ message = 'Opening your subscriptions…' }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-navy-900 px-6 text-center text-white safe-top safe-bottom" aria-busy="true">
      <Logo size={96} tileFill="#12294B" className="shrink-0" />
      <p className="mt-5 text-lg font-bold">Subscription Tracker</p>
      <p className="mt-1 text-sm text-navy-100">{message}</p>
      <Spinner className="mt-6 text-mint-400" />
    </div>
  )
}

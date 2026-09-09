import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Primitives'
import { Icon } from '@/components/ui/Icon'
import { APP_NAME, CONTACT_IS_PLACEHOLDER, LEGAL_ROUTES, OWNER_NAME, SUPPORT_EMAIL, formatEffectiveDate, mailto } from '@/lib/legal'

/** Shared frame for the Privacy, Terms, Support and Delete Account pages: header, optional effective date, sections, contact block. */
export function LegalPage({ title, subtitle, effective, backTo = '/settings', children }: { title: string; subtitle?: string; effective?: string; backTo?: string; children: ReactNode }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} back backTo={backTo} />
      <Page className="space-y-4 pb-6">
        {effective && (
          <p className="px-1 text-[0.8125rem] text-muted">
            Effective {formatEffectiveDate(effective)} · applies to {APP_NAME}
          </p>
        )}
        {children}
      </Page>
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="text-[1.0625rem] font-bold leading-tight text-navy-900">{title}</h2>
      <div className="mt-2 space-y-2 text-[0.9375rem] leading-relaxed text-ink [&_li]:ml-4 [&_ol>li]:list-decimal [&_ul>li]:list-disc [&_p]:text-ink">{children}</div>
    </Card>
  )
}

/** Owner contact details, shown on every legal page. Reads from .env so the owner replaces them once. */
export function ContactBlock({ subject = 'Question' }: { subject?: string }) {
  return (
    <Card className="border-mint-100 p-4">
      <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-700">Contact</p>
      <p className="mt-1 text-[0.9375rem] font-semibold text-navy-900">{OWNER_NAME}</p>
      <a href={mailto(subject)} className="mt-1 inline-flex min-h-11 items-center gap-2 text-[0.9375rem] font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2">
        <Icon name="mail" size={18} className="text-mint-700" /> {SUPPORT_EMAIL}
      </a>
      {CONTACT_IS_PLACEHOLDER && (
        <p className="mt-2 rounded-xl bg-coral-50 px-3 py-2 text-[0.75rem] leading-snug text-coral-700">
          Placeholder contact details. The owner sets VITE_OWNER_NAME, VITE_SUPPORT_EMAIL, VITE_OWNER_ADDRESS and VITE_LEGAL_JURISDICTION in .env before release.
        </p>
      )}
    </Card>
  )
}

/** Compact row of links for entry screens (onboarding, sign-up, sign-in, the account explainer). */
export function LegalLinks({ tone = 'light', className = '' }: { tone?: 'light' | 'dark'; className?: string }) {
  const color = tone === 'dark' ? 'text-navy-100' : 'text-muted'
  const link = `inline-flex min-h-11 items-center px-1.5 text-[0.75rem] font-semibold underline decoration-2 underline-offset-2 ${tone === 'dark' ? 'text-white decoration-mint-400' : 'text-navy-800 decoration-mint-500'}`
  return (
    <p className={`flex flex-wrap items-center justify-center gap-x-1 text-[0.75rem] ${color} ${className}`}>
      <Link to={LEGAL_ROUTES.terms} className={link}>
        Terms of Use
      </Link>
      <span aria-hidden="true">·</span>
      <Link to={LEGAL_ROUTES.privacy} className={link}>
        Privacy Policy
      </Link>
      <span aria-hidden="true">·</span>
      <Link to={LEGAL_ROUTES.support} className={link}>
        Support
      </Link>
    </p>
  )
}

/** Link row used inside Settings-style cards. */
export function LegalRow({ icon, label, hint, to }: { icon: 'shield' | 'note' | 'mail' | 'trash'; label: string; hint: string; to: string }) {
  const navigate = useNavigate()
  const danger = icon === 'trash'
  return (
    <button type="button" onClick={() => navigate(to)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-navy-50">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-coral-50 text-coral-700' : 'bg-navy-50 text-navy-700'}`}>
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[0.9375rem] font-semibold ${danger ? 'text-coral-700' : 'text-ink'}`}>{label}</span>
        <span className="block text-[0.8125rem] text-muted">{hint}</span>
      </span>
      <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />
    </button>
  )
}

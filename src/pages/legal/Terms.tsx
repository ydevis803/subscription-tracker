import { Link } from 'react-router-dom'
import { ContactBlock, LegalPage, LegalSection } from '@/components/app/LegalLayout'
import { APP_NAME, LEGAL_EFFECTIVE_DATE, LEGAL_JURISDICTION, LEGAL_ROUTES, OWNER_NAME } from '@/lib/legal'
import { price } from '@/lib/plan'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'

export default function Terms() {
  return (
    <LegalPage title="Terms of Use" subtitle="The agreement between you and us" effective={LEGAL_EFFECTIVE_DATE}>
      <LegalSection title="1. What the service is">
        <p>
          {APP_NAME} (“the app”) is provided by {OWNER_NAME} (“we”, “us”). It helps you record recurring charges and see when they renew. By using the app you agree to these terms and to the{' '}
          <Link to={LEGAL_ROUTES.privacy} className="inline-flex min-h-11 items-center font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Not financial advice">
        <p>Totals, projections and suggestions are calculated from what you enter. They are information to help you decide, not financial, legal or tax advice. Check amounts and dates with your bank and the services you pay for before acting on them.</p>
      </LegalSection>

      <LegalSection title="3. Your data and your responsibility">
        <ul>
          <li>You own the data you enter. You are responsible for its accuracy and for keeping a backup if you need one (Settings → Export backup).</li>
          <li>Without an account, data lives only in your browser; clearing site data removes it and we cannot recover it.</li>
          <li>With an account, we store a copy to restore on your devices. Keep your password private and sign out on shared devices.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Accounts">
        <ul>
          <li>You must be at least 16 to create an account.</li>
          <li>One person per account. You may not use another person's account or try to access their data.</li>
          <li>You can delete your account at any time from Settings; deletion is permanent.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Free and Premium">
        <p>
          The free plan tracks up to {FREE_SUBSCRIPTION_LIMIT} subscriptions. Premium removes that limit and adds insights, priced at {price('monthly')} a month or {price('yearly')} a year, with a seven-day trial that needs no card. In this build Premium is recorded in the app itself; when the app is distributed through an app store, billing, renewal and refunds follow that store's terms and can be managed there.
        </p>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>Do not attempt to break, overload or reverse the service, to access other accounts, or to use the app for anything unlawful. We may suspend accounts that do.</p>
      </LegalSection>

      <LegalSection title="7. Availability and changes">
        <p>We aim to keep the app available but do not guarantee uninterrupted service. We may change or discontinue features; if we discontinue the account service we will give reasonable notice so you can export your data.</p>
      </LegalSection>

      <LegalSection title="8. Liability">
        <p>To the extent the law allows, the app is provided “as is” and we are not liable for indirect or consequential loss, including charges you did not cancel in time or amounts entered incorrectly. Nothing in these terms limits liability that cannot be limited by law.</p>
      </LegalSection>

      <LegalSection title="9. Governing law">
        <p>These terms are governed by the laws of {LEGAL_JURISDICTION}, and disputes are subject to the courts there, without affecting any consumer rights you have where you live.</p>
      </LegalSection>

      <LegalSection title="10. Changes to these terms">
        <p>We will update the effective date above when these terms change and show the new version in the app before you continue using an account.</p>
      </LegalSection>

      <ContactBlock subject="Terms question" />
    </LegalPage>
  )
}

import { Link } from 'react-router-dom'
import { ContactBlock, LegalPage, LegalSection } from '@/components/app/LegalLayout'
import { APP_NAME, LEGAL_EFFECTIVE_DATE, LEGAL_ROUTES, OWNER_ADDRESS, OWNER_NAME } from '@/lib/legal'

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" subtitle="What we store, why, and how to delete it" effective={LEGAL_EFFECTIVE_DATE}>
      <LegalSection title="Who we are">
        <p>
          {APP_NAME} is provided by {OWNER_NAME}, {OWNER_ADDRESS}. This policy explains what the app stores about you and the choices you have. It is written to be read, not skimmed: if anything is unclear, contact us using the details at the end.
        </p>
      </LegalSection>

      <LegalSection title="The short version">
        <ul>
          <li>Without an account, everything you enter stays in your browser on your device. Nothing is uploaded.</li>
          <li>With an account, the same data is backed up to our server so you can restore it on another device.</li>
          <li>There are no adverts, no advertising identifiers, no analytics trackers and no data brokers.</li>
          <li>You can export or delete everything at any time from Settings.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Data types we use">
        <p>
          <strong>Account details</strong> (only if you create an account): email address, display name and a salted hash of your password. We never store the password itself.
        </p>
        <p>
          <strong>Subscription records</strong>: service names, amounts, currency, billing cycle, renewal and start dates, status, payment method label, website, your notes, and whether a date is estimated.
        </p>
        <p>
          <strong>History and decisions</strong>: price changes you log, cancellation notes and their reminders, renewal checks and the decisions made in them.
        </p>
        <p>
          <strong>Preferences and progress</strong>: monthly limit and its history, reminder schedule, display settings, check-in days and streaks, milestones, the seven-day challenge, invitation counts (the moment you shared, never who received it), the rating prompt state, and any feedback note you write. Feedback notes are stored only with your own data and are never posted anywhere.
        </p>
        <p>
          <strong>Plan</strong>: whether you are on Free, a trial or Premium, and your own billing history for Premium. In this build the plan is recorded locally; no card details are collected.
        </p>
        <p>
          <strong>Technical data</strong>: a session token in a cookie when signed in, your IP address in temporary rate-limit counters, and unsaved form drafts in your browser's local storage. Drafts never include passwords and expire after seven days.
        </p>
      </LegalSection>

      <LegalSection title="Why we use it">
        <ul>
          <li>To show your monthly total, upcoming renewals, calendar, timeline and insights. All of that is calculated from your own records.</li>
          <li>To back up and restore your data between devices when you sign in.</li>
          <li>To send a password reset link to your email when you ask for one.</li>
          <li>To keep the service safe: rate limits, session expiry and cross-site request checks.</li>
        </ul>
        <p>We do not use your data to build profiles, to train models, or for advertising, and we do not sell or rent it.</p>
      </LegalSection>

      <LegalSection title="Where it is stored and who can see it">
        <p>On your device: in your browser's IndexedDB and local storage, readable by anyone who can unlock that device and browser profile. Sign out on shared devices; this removes the local copy of your account data.</p>
        <p>On our server: in a database where every record is tied to your account. Only your signed-in session can read or change your records. There is no administrator view of personal records and no way for one account to read another. Reset emails go through the email provider we use to send them.</p>
        <p>The intended permission for every kind of record is documented in the app's repository (docs/PERMISSIONS.md).</p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <ul>
          <li>Guest data: until you erase it in Settings or clear your browser storage.</li>
          <li>Account data: until you delete the account. Deletion is immediate and permanent on our server and removes the copy on the device you delete from.</li>
          <li>Sessions: 30 days, or until you sign out or change your password.</li>
          <li>Password reset links: one hour, single use.</li>
          <li>Rate-limit counters: 15 minutes, in memory only.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How to delete your data">
        <ol className="list-decimal">
          <li>Optional: export a backup from Settings → Data → Export backup.</li>
          <li>Signed in: open Settings → Delete account, read the summary and confirm with your password. This deletes your account and every record on the server and on this device.</li>
          <li>Not signed in: Settings → Erase all data removes everything on this device.</li>
          <li>Cannot sign in? Email us from the address on the account and we will verify it and delete the account within 30 days.</li>
        </ol>
        <p>
          The full steps are on the <Link to={LEGAL_ROUTES.deleteAccount} className="inline-flex min-h-11 items-center font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2">Delete account</Link> page.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>You can access, export, correct and delete your data yourself inside the app at any time. Depending on where you live you may also have rights to restrict or object to processing and to complain to a supervisory authority; contact us first and we will help.</p>
      </LegalSection>

      <LegalSection title="Children">
        <p>{APP_NAME} is not directed at children under 16 and we do not knowingly collect their data. If you believe a child has created an account, contact us and we will delete it.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>If this policy changes in a way that affects you, the effective date at the top will change and the app will show the new version before you continue to use an account.</p>
      </LegalSection>

      <ContactBlock subject="Privacy question" />
    </LegalPage>
  )
}

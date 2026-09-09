import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/layout/AppShell'
import { Card, EmptyState } from '@/components/ui/Primitives'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <Page className="pt-16">
      <Card>
        <EmptyState icon="search" tone="navy" title="Page not found" body="That link does not go anywhere in Subscription Tracker." actionLabel="Go home" onAction={() => navigate('/')} />
      </Card>
    </Page>
  )
}

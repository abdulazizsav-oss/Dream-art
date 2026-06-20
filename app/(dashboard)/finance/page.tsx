import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { FinanceDashboard } from '@/components/finance/FinanceDashboard'
import { isSuperAdmin } from '@/lib/supabase/getRole'

export const dynamic = 'force-dynamic'

export default async function FinancePage() {
  // Финансы доступны только главному администратору
  if (!(await isSuperAdmin())) redirect('/dashboard')

  return (
    <div className="space-y-5">
      <PageHeader
        title="Финансы"
        description="Выручка, расходы, денежный результат и эффективность команды"
      />
      <FinanceDashboard />
    </div>
  )
}

import { createServiceClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/supabase/getRole'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { AdminUsersClient } from './AdminUsersClient'

export default async function AdminUsersPage() {
  const superAdmin = await isSuperAdmin()
  if (!superAdmin) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, role, nickname, created_at')
    .order('created_at')

  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = Object.fromEntries(
    (authUsers?.users ?? []).map(u => [u.id, u.email ?? ''])
  )

  const users = (profiles ?? []).map(p => {
    const row = p as any
    return {
      id: row.id as string,
      full_name: row.full_name as string,
      role: row.role as string,
      nickname: (row.nickname ?? '') as string,
      created_at: row.created_at as string,
      email: emailMap[row.id] ?? '',
    }
  })

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Управление пользователями"
        description="Только главный администратор"
      />
      <AdminUsersClient users={users} />
    </div>
  )
}

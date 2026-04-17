import { createClient } from './server'

export type UserRole = 'super_admin' | 'admin'

export interface UserProfile {
  id: string
  full_name: string
  role: UserRole
}

export async function getMyProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()
  return data as UserProfile | null
}

export async function getMyRole(): Promise<UserRole | null> {
  const profile = await getMyProfile()
  return profile?.role ?? null
}

export async function isSuperAdmin(): Promise<boolean> {
  return (await getMyRole()) === 'super_admin'
}

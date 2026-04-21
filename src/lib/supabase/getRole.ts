import { cache } from 'react'
import { createClient } from './server'

export type UserRole = 'super_admin' | 'admin'

export interface UserProfile {
  id: string
  full_name: string
  role: UserRole
  nickname: string
}

// React cache() memoizes per-request so layout + page + API route in the same
// render don't each re-issue the auth.getUser() + profile SELECT.
export const getMyProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name, role, nickname')
    .eq('id', user.id)
    .single()
  return data as UserProfile | null
})

export const getMyRole = cache(async (): Promise<UserRole | null> => {
  const profile = await getMyProfile()
  return profile?.role ?? null
})

export const isSuperAdmin = cache(async (): Promise<boolean> => {
  return (await getMyRole()) === 'super_admin'
})

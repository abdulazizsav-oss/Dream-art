import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { nickname, password } = await req.json()

  if (!nickname || !password) {
    return NextResponse.json({ error: 'Введите никнейм и пароль' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Look up the profile by nickname to get the user id
  const { data: profile, error: profileError } = await service
    .from('user_profiles')
    .select('id')
    .eq('nickname', nickname.trim().toLowerCase())
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Неверный никнейм или пароль' }, { status: 401 })
  }

  // Get the real email via admin API
  const { data: authUser, error: authError } = await service.auth.admin.getUserById(profile.id)
  if (authError || !authUser.user?.email) {
    return NextResponse.json({ error: 'Неверный никнейм или пароль' }, { status: 401 })
  }

  // Sign in with email + password
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  })

  if (signInError) {
    return NextResponse.json({ error: 'Неверный никнейм или пароль' }, { status: 401 })
  }

  return NextResponse.json({ success: true })
}

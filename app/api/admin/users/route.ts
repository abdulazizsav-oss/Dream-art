import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/supabase/getRole'

export async function POST(req: NextRequest) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { nickname, password, full_name, role } = await req.json()

  if (!nickname || !password || !full_name) {
    return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 })
  }

  const cleanNickname = nickname.trim().toLowerCase()

  // Validate nickname: only latin letters, digits, underscore
  if (!/^[a-z0-9_]{2,30}$/.test(cleanNickname)) {
    return NextResponse.json(
      { error: 'Никнейм: только латиница, цифры и _ (2–30 символов)' },
      { status: 400 },
    )
  }

  // Validate PIN for admin role
  if (role !== 'super_admin' && !/^\d{4,8}$/.test(password)) {
    return NextResponse.json(
      { error: 'PIN для администратора: 4–8 цифр' },
      { status: 400 },
    )
  }

  const supabase = await createServiceClient()

  // Generate internal email
  const email = `${cleanNickname}@dreamart.local`

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Ошибка создания' }, { status: 400 })
  }

  const { error: profileError } = await supabase.from('user_profiles').insert({
    id: authData.user.id,
    full_name,
    role: role ?? 'admin',
    nickname: cleanNickname,
  } as any)

  if (profileError) {
    // Rollback auth user if profile insert failed
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

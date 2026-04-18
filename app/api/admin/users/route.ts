import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/supabase/getRole'

export async function POST(req: NextRequest) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, password, full_name, role } = await req.json()
  if (!email || !password || !full_name) {
    return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Create auth user via admin API
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Ошибка создания' }, { status: 400 })
  }

  // Insert profile
  const { error: profileError } = await supabase.from('user_profiles').insert({
    id: authData.user.id,
    full_name,
    role: role ?? 'admin',
  })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

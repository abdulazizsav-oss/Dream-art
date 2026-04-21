import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/supabase/getRole'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const { role, full_name, nickname, password } = await req.json()

  const supabase = await createClient()
  const service = await createServiceClient()

  // Update profile fields
  const profileUpdate: Record<string, string> = {}
  if (role) profileUpdate.role = role
  if (full_name) profileUpdate.full_name = full_name
  if (nickname) {
    const clean = nickname.trim().toLowerCase()
    if (!/^[a-z0-9_]{2,30}$/.test(clean)) {
      return NextResponse.json({ error: 'Никнейм: только латиница, цифры и _' }, { status: 400 })
    }
    profileUpdate.nickname = clean
    // Also update auth email to keep in sync
    const newEmail = `${clean}@dreamart.local`
    await service.auth.admin.updateUserById(id, { email: newEmail })
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabase.from('user_profiles').update(profileUpdate).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Change PIN / password
  if (password) {
    const { error } = await service.auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const supabase = await createServiceClient()

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

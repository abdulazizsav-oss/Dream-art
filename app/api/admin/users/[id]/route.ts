import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/supabase/getRole'

const roleValues = new Set(['admin', 'super_admin'])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getMyProfile()
  if (currentUser?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const { role, full_name, nickname, password } = await req.json()

  if (id === currentUser.id && role && role !== 'super_admin') {
    return NextResponse.json({ error: 'Нельзя понизить собственную роль' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Update profile fields
  const profileUpdate: Record<string, unknown> = {}
  if (role) {
    if (!roleValues.has(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (role !== 'super_admin') {
      const { data: target, error: targetError } = await service
        .from('user_profiles')
        .select('role')
        .eq('id', id)
        .single()
      if (targetError) {
        return NextResponse.json({ error: targetError.message }, { status: 404 })
      }

      if (target.role === 'super_admin') {
        const { count, error: countError } = await service
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'super_admin')
        if (countError) {
          return NextResponse.json({ error: countError.message }, { status: 500 })
        }
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: 'Нельзя понизить последнего super_admin' },
            { status: 409 },
          )
        }
      }
    }

    profileUpdate.role = role
  }
  if (full_name) profileUpdate.full_name = String(full_name).trim()
  if (nickname) {
    const clean = nickname.trim().toLowerCase()
    if (!/^[a-z0-9_]{2,30}$/.test(clean)) {
      return NextResponse.json({ error: 'Никнейм: только латиница, цифры и _' }, { status: 400 })
    }
    profileUpdate.nickname = clean
    // Also update auth email to keep in sync
    const newEmail = `${clean}@dreamart.local`
    const { error: emailError } = await service.auth.admin.updateUserById(id, { email: newEmail })
    if (emailError) {
      return NextResponse.json({ error: emailError.message }, { status: 500 })
    }
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await service.from('user_profiles').update(profileUpdate as any).eq('id', id)
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
  const currentUser = await getMyProfile()
  if (currentUser?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params

  if (id === currentUser.id) {
    return NextResponse.json({ error: 'Нельзя удалить собственную учётную запись' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: target, error: targetError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', id)
    .single()
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 404 })
  }

  if (target.role === 'super_admin') {
    const { count, error: countError } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Нельзя удалить последнего super_admin' },
        { status: 409 },
      )
    }
  }

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

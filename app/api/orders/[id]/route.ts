import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('orders')
    .select('*, clients(*), order_items(*, equipment(name, currency, daily_rate, day_rate, night_rate)), payments(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('orders')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/calendar')

  return NextResponse.json(data)
}

// Quick close: mark order as returned, preserving equipment status as a manual technical flag.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (body.action !== 'close') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  // Set order status to returned
  const { error: orderErr } = await supabase
    .from('orders')
    .update({ status: 'returned', actual_return_date: new Date().toISOString().split('T')[0] } as any)
    .eq('id', id)

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/equipment')
  revalidatePath('/calendar')
  revalidatePath('/finance')

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('orders')
    .select('*, clients(*), order_items(*, equipment(name, currency, daily_rate)), payments(*)')
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
  return NextResponse.json(data)
}

// Quick close: set order → returned + all equipment → free
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (body.action !== 'close') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  // Get order items to know which equipment to free
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('equipment_id')
    .eq('order_id', id)

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  // Set order status to returned
  const { error: orderErr } = await supabase
    .from('orders')
    .update({ status: 'returned', actual_return_date: new Date().toISOString().split('T')[0] } as any)
    .eq('id', id)

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

  // Free all equipment
  const equipmentIds = (items ?? []).map(i => i.equipment_id)
  if (equipmentIds.length > 0) {
    await supabase
      .from('equipment')
      .update({ status: 'free' })
      .in('id', equipmentIds)
  }

  return NextResponse.json({ success: true })
}

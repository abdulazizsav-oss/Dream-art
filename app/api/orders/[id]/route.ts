import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const orderUpdateSchema = z.object({
  status: z.enum(['draft', 'active', 'returned', 'overdue', 'cancelled']).optional(),
  start_date: z.string().min(1).optional(),
  end_date: z.string().min(1).optional(),
  start_time: z.string().min(1).optional(),
  end_time: z.string().min(1).optional(),
  actual_return_date: z.string().nullable().optional(),
  deposit_amount: z.coerce.number().min(0).optional(),
  deposit_returned: z.boolean().optional(),
  contract_pdf_url: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
  trusted_person: z.string().nullable().optional(),
  trusted_person_doc_type: z.string().nullable().optional(),
}).strict()

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
  const parsed = orderUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('orders')
    .update(parsed.data)
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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateContract } from '@/lib/pdf/generateContract'
import { formatDate } from '@/lib/utils'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, clients(*), order_items(*, equipment(name, serial_number))')
    .eq('id', id)
    .single()

  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const client = order.clients as { full_name: string; phone: string | null; passport_series: string | null; passport_number: string | null } | null
  const items = (order.order_items as { equipment: { name: string; serial_number: string | null } | null; daily_rate: number; days: number; subtotal: number }[]) ?? []

  const pdfBytes = await generateContract({
    orderNumber: order.order_number,
    clientName: client?.full_name ?? 'Неизвестно',
    clientPhone: client?.phone ?? null,
    clientPassport: client?.passport_series && client?.passport_number
      ? `${client.passport_series} ${client.passport_number}` : null,
    startDate: formatDate(order.start_date),
    endDate: formatDate(order.end_date),
    items: items.map(i => ({
      name: i.equipment?.name ?? 'Оборудование',
      serialNumber: i.equipment?.serial_number ?? null,
      dailyRate: i.daily_rate,
      days: i.days,
      subtotal: i.subtotal,
    })),
    totalAmount: order.total_amount,
    depositAmount: order.deposit_amount,
    notes: order.notes ?? null,
    createdAt: formatDate(order.created_at),
  })

  return new NextResponse(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="contract-${order.order_number}.pdf"`,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateContract } from '@/lib/pdf/generateContract'
import { formatDate } from '@/lib/utils'
import { describeShift, describeUnits, getPricingParts } from '@/lib/rental'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, clients(*), order_items(*, equipment(name, currency))')
    .eq('id', id)
    .single()

  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const client = order.clients as { full_name: string; phone: string | null; passport_series: string | null; passport_number: string | null } | null
  const items = (order.order_items as {
    equipment: { name: string; currency: 'UZS' | 'USD' } | null
    daily_rate: number
    day_rate_snapshot?: number
    night_rate_snapshot?: number
    day_units?: number
    night_units?: number
    days: number
    subtotal: number
    shift_type?: 'day' | 'night'
  }[]) ?? []

  const pdfBytes = await generateContract({
    orderNumber: order.order_number,
    clientName: client?.full_name ?? 'Неизвестно',
    clientPhone: client?.phone ?? null,
    clientPassport: client?.passport_series && client?.passport_number
      ? `${client.passport_series} ${client.passport_number}` : null,
    startDate: formatDate(order.start_date),
    endDate: formatDate(order.end_date),
    startTime: (order as any).start_time ?? '09:30',
    endTime: (order as any).end_time ?? '23:00',
    items: items.map(i => ({
      name: i.equipment?.name ?? 'Оборудование',
      currency: i.equipment?.currency ?? 'UZS',
      pricingLines: getPricingParts(i).map(part => ({
        shiftLabel: describeShift(part.shiftType),
        rate: part.rate,
        unitsLabel: describeUnits(part.units, part.shiftType),
      })),
      subtotal: i.subtotal,
    })),
    totalAmount: order.total_amount,
    depositAmount: order.deposit_amount,
    notes: order.notes ?? null,
    createdAt: formatDate(order.created_at),
  })

  const pdfBody = new ArrayBuffer(pdfBytes.byteLength)
  new Uint8Array(pdfBody).set(pdfBytes)

  return new NextResponse(new Blob([pdfBody], { type: 'application/pdf' }), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="contract-${order.order_number}.pdf"`,
    },
  })
}

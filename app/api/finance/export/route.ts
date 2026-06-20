import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/supabase/getRole'

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csvResponse(name: string, headers: string[], rows: unknown[][]) {
  const body = [
    headers.map(csvCell).join(','),
    ...rows.map(row => row.map(csvCell).join(',')),
  ].join('\n')

  return new NextResponse(`\uFEFF${body}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  })
}

export async function GET(req: NextRequest) {
  const profile = await getMyProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'payments'
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'Укажите период' }, { status: 400 })

  const supabase = await createClient()

  if (type === 'expenses') {
    const { data, error } = await supabase
      .from('expenses')
      .select('expense_date, category, description, amount, payment_method, equipment(name), created_by_profile:user_profiles!expenses_created_by_profile_fk(full_name)')
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('expense_date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return csvResponse(
      `dream-art-expenses-${from}-${to}.csv`,
      ['Дата', 'Категория', 'Описание', 'Сумма UZS', 'Способ', 'Техника', 'Добавил'],
      (data ?? []).map(row => [
        row.expense_date,
        row.category,
        row.description,
        row.amount,
        row.payment_method,
        (row.equipment as { name?: string } | null)?.name,
        (row.created_by_profile as { full_name?: string } | null)?.full_name,
      ]),
    )
  }

  if (type === 'summary') {
    const { data, error } = await supabase.rpc('get_finance_analytics', {
      p_from: from,
      p_to: to,
    } as never)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const analytics = data as any
    return csvResponse(
      `dream-art-summary-${from}-${to}.csv`,
      ['Период с', 'Период по', 'Выручка UZS', 'Расходы UZS', 'Результат UZS', 'Долг UZS', 'Заказов'],
      [[from, to, analytics.kpi.revenue, analytics.kpi.expenses, analytics.kpi.result, analytics.kpi.debt, analytics.kpi.orders_count]],
    )
  }

  const fromIso = `${from}T00:00:00+05:00`
  const toDate = new Date(`${to}T00:00:00+05:00`)
  toDate.setDate(toDate.getDate() + 1)
  const { data, error } = await supabase
    .from('payments')
    .select('paid_at, amount, payment_method, payment_type, notes, orders(order_number, clients(full_name)), user_profiles!payments_created_by_fkey(full_name)')
    .gte('paid_at', fromIso)
    .lt('paid_at', toDate.toISOString())
    .order('paid_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return csvResponse(
    `dream-art-payments-${from}-${to}.csv`,
    ['Дата', 'Заказ', 'Клиент', 'Тип', 'Способ', 'Сумма UZS', 'Принял', 'Заметка'],
    (data ?? []).map(row => {
      const order = row.orders as { order_number?: string; clients?: { full_name?: string } | null } | null
      return [
        row.paid_at,
        order?.order_number,
        order?.clients?.full_name,
        row.payment_type,
        row.payment_method,
        row.amount,
        (row.user_profiles as { full_name?: string } | null)?.full_name,
        row.notes,
      ]
    }),
  )
}

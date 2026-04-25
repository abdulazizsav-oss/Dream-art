import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReturnReminder, sendOverdueAlert } from '@/lib/bot/notifications'

// Called daily by Cloudflare Worker Cron
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron secret is not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // 1. Mark overdue
  await supabase.rpc('mark_overdue_orders' as never)

  // 2. Send 24h return reminders
  const { data: reminders } = await supabase
    .from('orders')
    .select('*, clients(*), order_items(*, equipment(name))')
    .eq('status', 'active')
    .eq('end_date', tomorrowStr)

  for (const order of reminders ?? []) {
    const client = order.clients as { full_name: string; telegram_chat_id: number | null } | null
    if (!client?.telegram_chat_id) continue
    const itemNames = (order.order_items as { equipment: { name: string } | null }[])
      .map(i => i.equipment?.name ?? 'Оборудование')
    await sendReturnReminder(
      client.telegram_chat_id,
      client.full_name,
      order.order_number,
      order.end_date,
      itemNames
    ).catch(console.error)
  }

  // 3. Send overdue alerts
  const { data: overdue } = await supabase
    .from('v_overdue_orders')
    .select('*')
    .gte('days_overdue', 1)

  for (const order of overdue ?? []) {
    if (!order.telegram_chat_id) continue
    const dailyFine = 0 // Could fetch sum(daily_rate) * 1.5 per item
    await sendOverdueAlert(
      order.telegram_chat_id,
      order.client_name,
      order.order_number,
      order.days_overdue,
      dailyFine
    ).catch(console.error)
  }

  return NextResponse.json({
    ok: true,
    reminders: reminders?.length ?? 0,
    overdue: overdue?.length ?? 0,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/orders/[id]/return-missing
 *
 * Клиент принёс ранее не возвращённые элементы комплектации.
 * Переносит указанные элементы из missing_kit_items в returned_kit_items.
 *
 * Body: { items: [{ order_item_id: string, returned_now: string[] }] }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    items: { order_item_id: string; returned_now: string[] }[]
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Нет элементов для возврата' }, { status: 400 })
  }

  // Загружаем текущее состояние позиций
  const itemIds = body.items.map(i => i.order_item_id)
  const { data: existing, error: fetchErr } = await supabase
    .from('order_items')
    .select('id, order_id, returned_kit_items, missing_kit_items')
    .in('id', itemIds)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // Проверяем что все позиции принадлежат этому заказу
  const foreign = (existing ?? []).find(it => (it as any).order_id !== orderId)
  if (foreign) return NextResponse.json({ error: 'Позиция не принадлежит заказу' }, { status: 400 })

  // Обновляем каждую позицию
  for (const patch of body.items) {
    const current = (existing ?? []).find(it => it.id === patch.order_item_id)
    if (!current) continue

    const missing = ((current as any).missing_kit_items ?? []) as string[]
    const returned = ((current as any).returned_kit_items ?? []) as string[]

    // Перемещаем из missing → returned только те, которые действительно в missing
    const moved = patch.returned_now.filter(k => missing.includes(k))
    const newMissing = missing.filter(k => !moved.includes(k))
    const newReturned = Array.from(new Set([...returned, ...moved]))

    const { error: updErr } = await supabase
      .from('order_items')
      .update({
        returned_kit_items: newReturned,
        missing_kit_items: newMissing,
      } as never)
      .eq('id', patch.order_item_id)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  return NextResponse.json({ success: true })
}

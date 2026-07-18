import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  isAdditiveKitSelection,
  kitSelectionToNames,
  sanitizeKitCatalog,
  sanitizeKitSelection,
  type KitSelectionEntry,
} from '@/lib/kit'

const updateKitSchema = z.object({
  kit_selection: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    qty: z.coerce.number().int().min(0).max(100),
  }).strict()).max(100),
}).strict()

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ error: 'Некорректный идентификатор позиции' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = updateKitSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createServiceClient()
  const [{ data: order }, { data: item, error: itemError }] = await Promise.all([
    service.from('orders').select('id, status').eq('id', id).single(),
    service
      .from('order_items')
      .select('id, returned, kit_selection, selected_kit_items, equipment(kit)')
      .eq('id', itemId)
      .eq('order_id', id)
      .single(),
  ])

  if (!order || itemError || !item) {
    return NextResponse.json({ error: itemError?.message ?? 'Позиция заказа не найдена' }, { status: 404 })
  }
  if (!['active', 'overdue'].includes(order.status) || item.returned) {
    return NextResponse.json({ error: 'Комплектацию можно изменить только у активной позиции' }, { status: 400 })
  }

  const catalog = sanitizeKitCatalog((item.equipment as { kit?: unknown } | null)?.kit)
  const current = sanitizeKitSelection(item.kit_selection)
  const currentByName = new Map(current.map(entry => [entry.name, entry]))
  const requestedByName = new Map(parsed.data.kit_selection.map(entry => [entry.name, entry.qty]))
  const catalogNames = new Set(catalog.map(component => component.name))

  // Keep frozen legacy entries even if an administrator later removed that
  // component from the equipment catalog.
  const next: KitSelectionEntry[] = current
    .filter(entry => !catalogNames.has(entry.name))
  for (const component of catalog) {
    const currentEntry = currentByName.get(component.name)
    const requestedQty = requestedByName.get(component.name) ?? 0
    const minimum = currentEntry?.qty ?? 0

    const maximum = Math.max(component.max_qty, minimum)
    if (requestedQty < minimum || requestedQty > maximum) {
      return NextResponse.json({
        error: `Количество «${component.name}» должно быть от ${minimum} до ${maximum}`,
      }, { status: 400 })
    }
    if (requestedQty > 0) {
      next.push({
        name: component.name,
        qty: requestedQty,
        unit_price: currentEntry?.unit_price ?? component.price,
      })
    }
  }

  if (!isAdditiveKitSelection(current, next)) {
    return NextResponse.json({ error: 'Уже выданную комплектацию нельзя уменьшить' }, { status: 400 })
  }

  const generatedNames = kitSelectionToNames(next)
  const currentGeneratedNames = new Set(kitSelectionToNames(current))
  const legacyExtras = (item.selected_kit_items ?? [])
    .filter(name => !currentGeneratedNames.has(name))
  const selectedNames = Array.from(new Set([...generatedNames, ...legacyExtras]))

  const { data, error } = await service.rpc('update_order_item_kit_atomic', {
    p_order_id: id,
    p_order_item_id: itemId,
    p_kit_selection: next,
    p_selected_kit_items: selectedNames,
  } as never)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/finance')

  return NextResponse.json(data)
}

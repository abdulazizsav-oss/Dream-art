import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import {
  formatCurrency, formatDate, formatDateTime, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS, DOCUMENT_TYPE_LABELS
} from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ArrowDownToLine, ArrowUpFromLine, FileText, RotateCcw, Truck, UserCheck, User } from 'lucide-react'
import { CloseOrderButton } from '@/components/orders/CloseOrderButton'
import { PartialReturnModal } from '@/components/orders/PartialReturnModal'
import { PayReturnedItemButton } from '@/components/orders/PayReturnedItemButton'
import { ReturnMissingKitButton } from '@/components/orders/ReturnMissingKitButton'
import { AddItemsModal } from '@/components/orders/AddItemsModal'
import { EditOrderKitModal } from '@/components/orders/EditOrderKitModal'
import { describeShift, describeUnits, getPricingParts } from '@/lib/rental'
import { computeActiveOrderTotal, type ActiveItemInput } from '@/lib/billing'
import { kitPerShift, sanitizeKitCatalog, sanitizeKitSelection } from '@/lib/kit'
import { formatMissingKitAge, formatMissingSinceDateTime } from '@/lib/missing-kit'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*, clients(*), created_by_profile:user_profiles!orders_created_by_profile_fk(full_name, role), order_items(*, equipment(name, currency, day_rate, night_rate, daily_rate, day_night, kit), order_item_payment_allocations(amount)), payments(*, created_by_profile:user_profiles!payments_created_by_profile_fk(full_name))')
    .eq('id', id)
    .order('paid_at', { referencedTable: 'payments', ascending: false })
    .single()

  if (!order) notFound()

  const isOrderOpen = order.status === 'active' || order.status === 'overdue'
  const { data: availableEquipment } = isOrderOpen
    ? await supabase
        .from('equipment')
        .select('id, name, daily_rate, day_rate, night_rate, day_night, currency, brand, kit_items, kit, equipment_categories(name), brands(name)')
        .order('sort_order')
        .order('name')
    : { data: [] }

  const client = order.clients as { full_name: string; phone: string | null; telegram_username: string | null; document_type: string | null; passport_series: string | null; passport_number: string | null } | null
  const createdByProfile = (order as any).created_by_profile as { full_name: string; role?: string } | null
  const trustedPerson = (order as any).trusted_person as string | null
  const trustedDocType = (order as any).trusted_person_doc_type as string | null
  const items = (order.order_items as {
    id: string
    equipment_id: string
    equipment: { name: string; currency: 'UZS' | 'USD'; day_rate?: number | null; night_rate?: number | null; daily_rate?: number | null; day_night?: 'day' | 'night' | 'both' | null; kit?: unknown } | null
    daily_rate: number
    day_rate_snapshot?: number
    night_rate_snapshot?: number
    day_units?: number
    night_units?: number
    days: number
    subtotal: number
    manual_subtotal?: number | null
    kit_selection?: unknown
    shift_type: 'day' | 'night'
    rate_source?: 'auto' | 'manual' | null
    actual_start_at?: string | null
    actual_end_at?: string | null
    final_subtotal?: number | null
    final_day_units?: number | null
    final_night_units?: number | null
    returned?: boolean | null
    condition_on_issue: string | null
    condition_on_return: string | null
    selected_kit_items?: string[] | null
    returned_kit_items?: string[] | null
    missing_kit_items?: string[] | null
    order_item_payment_allocations?: { amount: number }[] | null
  }[]) ?? []
  const payments = (order.payments as unknown as { id: string; amount: number; payment_method: string; payment_type: string; paid_at: string; notes: string | null; payment_group_id?: string | null; created_by_profile?: { full_name: string } | null }[]) ?? []
  const deliveryToClient = Boolean((order as any).delivery_to_client)
    || (order as any).fulfillment_method === 'delivery'
  const deliveryFromClient = Boolean((order as any).delivery_from_client)
  const rawDeliveryFee = Number((order as any).delivery_fee ?? 0)
  const deliveryFee = Number.isFinite(rawDeliveryFee) ? Math.max(0, rawDeliveryFee) : 0
  const rentalPayments = payments.filter(payment => payment.payment_type === 'rental')
  let deliveryPaid = 0
  if (deliveryFee > 0) {
    // Отдельный best-effort запрос сохраняет совместимость с локальной БД до
    // применения миграции: отсутствие новой таблицы не ломает основной заказ.
    const { data: deliveryAllocations } = await (supabase as any)
      .from('order_delivery_payment_allocations')
      .select('amount')
      .eq('order_id', id)
    deliveryPaid = (deliveryAllocations ?? []).reduce(
      (sum: number, allocation: { amount?: number | null }) => sum + Number(allocation.amount ?? 0),
      0,
    )
  }

  const { data: missingKitEvents } = await supabase
    .from('order_item_missing_kit_events')
    .select('id, order_item_id, kit_name, missing_since, returned_at')
    .eq('order_id', id)
    .is('returned_at', null)

  const missingEventsByItem = new Map<string, { id: string; kit_name: string; missing_since: string; returned_at: string | null }[]>()
  for (const event of (missingKitEvents ?? []) as { id: string; order_item_id: string; kit_name: string; missing_since: string; returned_at: string | null }[]) {
    const current = missingEventsByItem.get(event.order_item_id) ?? []
    current.push(event)
    missingEventsByItem.set(event.order_item_id, current)
  }

  // Группируем сплит-платежи: если у группы >1 строки с одним payment_group_id — показываем как один платёж с разбивкой по методам
  type PaymentGroup =
    | { kind: 'single'; payment: typeof payments[number] }
    | {
        kind: 'split'
        group_id: string
        paid_at: string
        payment_type: string
        notes: string | null
        created_by_profile?: { full_name: string } | null
        parts: { method: string; amount: number }[]
        total: number
      }
  const paymentGroups: PaymentGroup[] = []
  const splitsByGroup = new Map<string, typeof payments>()
  for (const p of payments) {
    if (p.payment_group_id) {
      const arr = splitsByGroup.get(p.payment_group_id) ?? []
      arr.push(p)
      splitsByGroup.set(p.payment_group_id, arr)
    } else {
      paymentGroups.push({ kind: 'single', payment: p })
    }
  }
  for (const [gid, rows] of splitsByGroup.entries()) {
    if (rows.length === 1) {
      paymentGroups.push({ kind: 'single', payment: rows[0] })
    } else {
      paymentGroups.push({
        kind: 'split',
        group_id: gid,
        paid_at: rows[0].paid_at,
        payment_type: rows[0].payment_type,
        notes: rows[0].notes,
        created_by_profile: rows[0].created_by_profile,
        parts: rows.map(r => ({ method: r.payment_method, amount: r.amount })),
        total: rows.reduce((s, r) => s + r.amount, 0),
      })
    }
  }
  paymentGroups.sort((a, b) => {
    const ta = a.kind === 'single' ? a.payment.paid_at : a.paid_at
    const tb = b.kind === 'single' ? b.payment.paid_at : b.paid_at
    return tb.localeCompare(ta)
  })

  // ── Per-item live-пересчёт (учитывает частичные сдачи + дозаказы) ──
  const isActive = isOrderOpen
  const orderActualStart = (order as any).actual_start_at as string | null

  const activeInputs: ActiveItemInput[] = items.map(it => {
    const eq = it.equipment
    const dayRate = eq?.day_rate ?? it.day_rate_snapshot ?? eq?.daily_rate ?? it.daily_rate ?? 0
    const nightRate = eq?.night_rate ?? it.night_rate_snapshot ?? null
    return {
      id: it.id,
      equipment_id: it.equipment_id,
      rate_source: it.rate_source ?? null,
      actual_start_at: it.actual_start_at ?? orderActualStart ?? null,
      actual_end_at: it.actual_end_at ?? null,
      final_subtotal: it.final_subtotal ?? null,
      final_day_units: it.final_day_units ?? null,
      final_night_units: it.final_night_units ?? null,
      day_rate: dayRate,
      night_rate: nightRate,
      day_night: eq?.day_night ?? null,
      subtotal: it.subtotal ?? 0,
      day_units: it.day_units ?? 0,
      night_units: it.night_units ?? 0,
      shift_type: it.shift_type ?? 'day',
      manual_subtotal: it.manual_subtotal ?? null,
      kit_per_shift: kitPerShift(sanitizeKitSelection(it.kit_selection)),
    }
  })

  const liveBilling = isActive
    ? computeActiveOrderTotal({ now: new Date(), items: activeInputs, delivery_fee: deliveryFee })
    : null

  const effectiveTotal = liveBilling ? liveBilling.total_amount : Number(order.total_amount)
  const effectiveRentalAmount = liveBilling
    ? liveBilling.rental_amount
    : Math.max(0, effectiveTotal - deliveryFee)

  // Per-item breakdown для отображения
  const itemBillingById = liveBilling?.perItem ?? new Map()

  const totalPaid = payments.filter(p => p.payment_type !== 'deposit_return').reduce((s, p) => s + p.amount, 0)
  const debt = effectiveTotal - rentalPayments.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={order.order_number}
        description={`Клиент: ${client?.full_name}`}
        action={
          <div className="flex gap-2 flex-wrap">
            {order.status === 'active' || order.status === 'overdue' ? (
              <>
                <AddItemsModal
                  orderId={id}
                  equipment={(availableEquipment ?? []).map(item => ({
                    id: item.id,
                    name: item.name,
                    daily_rate: item.daily_rate,
                    day_rate: (item as any).day_rate,
                    night_rate: (item as any).night_rate,
                    day_night: (item as any).day_night,
                    currency: item.currency,
                    brand: (item as any).brand,
                    kit_items: (item as any).kit_items ?? [],
                    kit: (item as any).kit ?? [],
                    equipment_categories: (item as any).equipment_categories ?? null,
                    brands: (item as any).brands ?? null,
                  }))}
                />
                <CloseOrderButton
                  orderId={id}
                  debt={Math.max(0, debt)}
                  deliveryFee={deliveryFee}
                  deliveryPaid={deliveryPaid}
                  deliveryToClient={deliveryToClient}
                  deliveryFromClient={deliveryFromClient}
                  variant="default"
                  items={items.filter(it => !it.returned).map(it => ({
                    id: it.id,
                    name: it.equipment?.name ?? '—',
                    selected_kit_items: it.selected_kit_items ?? [],
                    current_subtotal: itemBillingById.get(it.id)?.subtotal ?? it.subtotal ?? 0,
                    currency: it.equipment?.currency ?? 'UZS',
                  }))}
                />
                <PartialReturnModal
                  orderId={id}
                  items={items.filter(it => !it.returned).map(it => ({
                    id: it.id,
                    name: it.equipment?.name ?? '—',
                    selected_kit_items: it.selected_kit_items ?? [],
                    current_subtotal: itemBillingById.get(it.id)?.subtotal ?? it.subtotal ?? 0,
                    already_paid: (it.order_item_payment_allocations ?? [])
                      .reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0),
                    currency: it.equipment?.currency ?? 'UZS',
                  }))}
                />
                <Link href={`/orders/${id}/return`}>
                  <Button variant="outline">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Возврат с актом
                  </Button>
                </Link>
              </>
            ) : null}
            {order.status === 'returned' && (
              <ReturnMissingKitButton
                orderId={id}
                items={items
                  .map(it => {
                    const activeEvents = missingEventsByItem.get(it.id) ?? []
                    const missing = activeEvents.length > 0
                      ? activeEvents.map(event => ({
                          kit_name: event.kit_name,
                          missing_since: event.missing_since,
                        }))
                      : (it.missing_kit_items ?? []).map(kit => ({
                          kit_name: kit,
                          missing_since: it.actual_end_at ?? (order as any).actual_end_at ?? (order as any).updated_at ?? (order as any).created_at,
                        }))
                    return {
                      order_item_id: it.id,
                      equipment_name: it.equipment?.name ?? '—',
                      missing_kit_items: missing.map(event => event.kit_name),
                      missing,
                    }
                  })
                  .filter(it => it.missing_kit_items.length > 0)
                }
              />
            )}
            <a href={`/api/orders/${id}/contract`} target="_blank">
              <Button variant="outline">
                <FileText className="w-4 h-4 mr-2" />
                Договор PDF
              </Button>
            </a>
          </div>
        }
      />

      {/* Status + dates */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Статус</p>
          <span className={cn('mt-1 inline-flex text-xs px-2 py-0.5 rounded-full font-medium', ORDER_STATUS_COLORS[order.status])}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          {order.created_at && (
            <p className="text-[11px] text-gray-400 mt-1">{formatDateTime(order.created_at)}</p>
          )}
          {createdByProfile?.full_name && (
            <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
              <User className="w-3 h-3" />
              Оформил: <span className="font-medium text-gray-700">{createdByProfile.full_name}</span>
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Период</p>
          <p className="font-medium text-sm mt-1">
            {formatDate(order.start_date)} — {formatDate(order.end_date)}
          </p>
          {((order as any).actual_start_at || (order as any).actual_end_at) && (
            <p className="text-[11px] text-gray-400 mt-1">
              Факт: {(order as any).actual_start_at ? formatDateTime((order as any).actual_start_at) : '—'}
              {' → '}
              {(order as any).actual_end_at ? formatDateTime((order as any).actual_end_at) : '…'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Итого заказа</p>
          <p className="font-semibold mt-1">{formatCurrency(effectiveTotal)}</p>
          <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
            <p>Аренда: {formatCurrency(effectiveRentalAmount)}</p>
            {deliveryFee > 0 && (
              <p>Услуги доставки: {formatCurrency(deliveryFee)}</p>
            )}
          </div>
          {liveBilling && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              По факту на сейчас
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Задолженность</p>
          <p className={cn('font-semibold mt-1', debt > 0 ? 'text-red-600' : 'text-green-600')}>
            {formatCurrency(Math.max(0, debt))}
          </p>
        </div>
      </div>

      {/* Fixed delivery services */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-blue-600" />
          <h2 className="font-semibold">Услуги доставки</h2>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {deliveryFee > 0 ? formatCurrency(deliveryFee) : 'Не выбраны'}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className={cn(
            'flex items-center gap-2 rounded-xl border px-3 py-3 text-sm',
            deliveryToClient ? 'border-blue-200 bg-blue-50 text-blue-800' : 'text-zinc-400',
          )}>
            <ArrowUpFromLine className="h-4 w-4" />
            {deliveryToClient ? 'Отправить клиенту' : 'Не отправляем клиенту'}
          </div>
          <div className={cn(
            'flex items-center gap-2 rounded-xl border px-3 py-3 text-sm',
            deliveryFromClient ? 'border-blue-200 bg-blue-50 text-blue-800' : 'text-zinc-400',
          )}>
            <ArrowDownToLine className="h-4 w-4" />
            {deliveryFromClient ? 'Забрать у клиента' : 'Клиент возвращает сам'}
          </div>
        </div>
      </div>

      {/* Client + trusted person */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <h2 className="font-semibold mb-2">Клиент</h2>
          <p className="font-medium">{client?.full_name}</p>
          <div className="flex gap-4 mt-1 text-sm text-gray-500">
            {client?.phone && <span>{client.phone}</span>}
            {client?.telegram_username && <span>@{client.telegram_username}</span>}
          </div>
          {order.deposit_amount > 0 && (
            <p className="text-sm mt-2 text-amber-600">
              Депозит: {formatCurrency(order.deposit_amount)}
              {order.deposit_returned ? ' (возвращён)' : ' (удерживается)'}
            </p>
          )}
        </div>

        {trustedPerson && (
          <div className="border-t pt-4">
            <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Доверенное лицо
            </p>
            <p className="font-medium text-gray-900">{trustedPerson}</p>
            {trustedDocType && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                <FileText className="w-3.5 h-3.5" />
                {DOCUMENT_TYPE_LABELS[trustedDocType] ?? trustedDocType}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Equipment list */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-3">Техника</h2>
        <div className="space-y-2">
          {items.map(item => {
            const kit = item.selected_kit_items ?? []
            const returned = item.returned_kit_items ?? []
            const activeMissingEvents = missingEventsByItem.get(item.id) ?? []
            const missing = activeMissingEvents.length > 0
              ? activeMissingEvents.map(event => event.kit_name)
              : item.missing_kit_items ?? []
            const isClosed = Boolean(item.returned) || order.status === 'returned'
            return (
              <div key={item.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">{item.equipment?.name}</p>
                  <p className="text-xs text-gray-400">
                    {item.condition_on_issue && `Состояние при выдаче: ${item.condition_on_issue}`}
                    {item.condition_on_return && ` · При возврате: ${item.condition_on_return}`}
                  </p>
                  {kit.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-gray-500">Комплект:</span>
                      {kit.map(k => {
                        const wasReturned = returned.includes(k)
                        const wasMissing = missing.includes(k)
                        const cls = isClosed
                          ? wasMissing
                            ? 'bg-amber-50 text-amber-700 line-through'
                            : wasReturned
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-gray-100 text-gray-700'
                          : 'bg-gray-100 text-gray-700'
                        return (
                          <span key={k} className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 font-medium', cls)}>
                            {k}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {isOrderOpen && !item.returned && (
                    <EditOrderKitModal
                      orderId={id}
                      orderItemId={item.id}
                      equipmentName={item.equipment?.name ?? 'Техника'}
                      catalog={sanitizeKitCatalog(item.equipment?.kit)}
                      currentSelection={sanitizeKitSelection(item.kit_selection)}
                    />
                  )}
                  {missing.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(activeMissingEvents.length > 0
                        ? activeMissingEvents
                        : missing.map(kit => ({
                            kit_name: kit,
                            missing_since: item.actual_end_at ?? (order as any).actual_end_at ?? (order as any).updated_at ?? (order as any).created_at,
                          }))
                      ).map(event => (
                        <span key={event.kit_name} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Не возвращено: {event.kit_name} · с {formatMissingSinceDateTime(event.missing_since)} · {formatMissingKitAge(event.missing_since)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-gray-700 text-right">
                  {(() => {
                    const live = itemBillingById.get(item.id)
                    const eq = item.equipment
                    const useCurrentRates = Boolean(live && !live.frozen)
                    const dayRate = useCurrentRates
                      ? (eq?.day_rate ?? eq?.daily_rate ?? item.day_rate_snapshot ?? item.daily_rate ?? 0)
                      : (item.day_rate_snapshot ?? eq?.day_rate ?? eq?.daily_rate ?? item.daily_rate ?? 0)
                    const nightRate = useCurrentRates
                      ? (eq?.night_rate ?? dayRate)
                      : (item.night_rate_snapshot ?? eq?.night_rate ?? dayRate)
                    const displayItem = live
                      ? {
                          day_units: live.day_units,
                          night_units: live.night_units,
                          day_rate_snapshot: dayRate,
                          night_rate_snapshot: nightRate,
                        }
                      : item
                    const displaySubtotal = live ? live.subtotal : item.subtotal
                    const paidForItem = (item.order_item_payment_allocations ?? [])
                      .reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0)
                    const isReturned = Boolean(item.returned) || Boolean(live?.frozen)
                    const remainingByItem = Math.max(0, displaySubtotal - paidForItem)
                    const badge = !isReturned
                      ? { label: 'Считается', cls: 'bg-blue-50 text-blue-700 border-blue-100' }
                      : paidForItem >= displaySubtotal - 0.01
                        ? { label: 'Сдано · оплачено', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
                        : paidForItem > 0
                          ? { label: 'Сдано · частично', cls: 'bg-amber-50 text-amber-700 border-amber-100' }
                          : { label: 'Сдано · не оплачено', cls: 'bg-red-50 text-red-700 border-red-100' }
                    return (
                      <>
                        <div>
                          {getPricingParts(displayItem)
                            .map(part => `${describeShift(part.shiftType)} · ${formatCurrency(part.rate, item.equipment?.currency)} × ${describeUnits(part.units, part.shiftType)}`)
                            .join(' + ')}
                          {' = '}
                          {formatCurrency(displaySubtotal, item.equipment?.currency)}
                        </div>
                        <div className="mt-1 flex justify-end">
                          <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', badge.cls)}>
                            {badge.label}
                          </span>
                        </div>
                        {isReturned && paidForItem > 0 && (
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            Оплачено по позиции: {formatCurrency(paidForItem, item.equipment?.currency)}
                          </div>
                        )}
                        {live?.frozen && item.actual_end_at && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            Сдано: {formatDateTime(item.actual_end_at)}
                          </div>
                        )}
                        {isReturned && remainingByItem > 0.01 && (
                          <div className="mt-2 flex justify-end">
                            <PayReturnedItemButton
                              orderId={id}
                              itemId={item.id}
                              itemName={item.equipment?.name ?? '—'}
                              remainingDue={remainingByItem}
                              currency={item.equipment?.currency ?? 'UZS'}
                            />
                          </div>
                        )}
                      </>
                    )
                  })()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Payments */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Платежи</h2>
          <Link href={`/finance?order=${id}`}>
            <Button size="sm" variant="outline">+ Добавить платёж</Button>
          </Link>
        </div>
        {paymentGroups.length > 0 ? (
          <div className="space-y-2">
            {paymentGroups.map(g => {
              if (g.kind === 'single') {
                const p = g.payment
                return (
                  <div key={p.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                    <div>
                      <p>{PAYMENT_TYPE_LABELS[p.payment_type]} · {PAYMENT_METHOD_LABELS[p.payment_method]}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(p.paid_at)}
                        {p.created_by_profile?.full_name && ` · Принял: ${p.created_by_profile.full_name}`}
                      </p>
                      {p.notes && <p className="text-xs text-gray-400">{p.notes}</p>}
                    </div>
                    <span className={cn('font-medium', p.payment_type === 'deposit_return' ? 'text-red-600' : 'text-green-700')}>
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                )
              }
              return (
                <div key={g.group_id} className="border-b pb-2 last:border-0">
                  <div className="flex justify-between text-sm">
                    <div>
                      <p className="flex items-center gap-1.5">
                        <span>{PAYMENT_TYPE_LABELS[g.payment_type]}</span>
                        <span className="inline-flex rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          Сплит · {g.parts.length}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(g.paid_at)}
                        {g.created_by_profile?.full_name && ` · Принял: ${g.created_by_profile.full_name}`}
                      </p>
                      {g.notes && <p className="text-xs text-gray-400">{g.notes}</p>}
                    </div>
                    <span className="font-medium text-green-700">
                      {formatCurrency(g.total)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {g.parts.map((part, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-md bg-zinc-50 border border-zinc-200 px-2 py-0.5 text-[11px]">
                        <span className="text-zinc-500">{PAYMENT_METHOD_LABELS[part.method]}:</span>
                        <span className="font-medium tabular-nums">{formatCurrency(part.amount)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="flex justify-between text-sm font-semibold pt-1">
              <span>Итого получено</span>
              <span>{formatCurrency(totalPaid)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Платежей нет</p>
        )}
      </div>

      {order.notes && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-2">Заметки</h2>
          <p className="text-sm text-gray-600">{order.notes}</p>
        </div>
      )}
    </div>
  )
}

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
import { FileText, RotateCcw, UserCheck, User } from 'lucide-react'
import { CloseOrderButton } from '@/components/orders/CloseOrderButton'
import { ReturnMissingKitButton } from '@/components/orders/ReturnMissingKitButton'
import { describeShift, describeUnits, getPricingParts } from '@/lib/rental'
import { computeActiveOrderTotal, type ActiveItemInput } from '@/lib/billing'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*, clients(*), created_by_profile:user_profiles!orders_created_by_profile_fk(full_name, role), order_items(*, equipment(name, currency, day_rate, night_rate, daily_rate)), payments(*, created_by_profile:user_profiles!payments_created_by_profile_fk(full_name))')
    .eq('id', id)
    .order('paid_at', { referencedTable: 'payments', ascending: false })
    .single()

  if (!order) notFound()

  const client = order.clients as { full_name: string; phone: string | null; telegram_username: string | null; document_type: string | null; passport_series: string | null; passport_number: string | null } | null
  const createdByProfile = (order as any).created_by_profile as { full_name: string; role?: string } | null
  const trustedPerson = (order as any).trusted_person as string | null
  const trustedDocType = (order as any).trusted_person_doc_type as string | null
  const items = (order.order_items as {
    id: string
    equipment_id: string
    equipment: { name: string; currency: 'UZS' | 'USD'; day_rate?: number | null; night_rate?: number | null; daily_rate?: number | null } | null
    daily_rate: number
    day_rate_snapshot?: number
    night_rate_snapshot?: number
    day_units?: number
    night_units?: number
    days: number
    subtotal: number
    shift_type: 'day' | 'night'
    rate_source?: 'auto' | 'manual' | null
    condition_on_issue: string | null
    condition_on_return: string | null
    selected_kit_items?: string[] | null
    returned_kit_items?: string[] | null
    missing_kit_items?: string[] | null
  }[]) ?? []
  const payments = (order.payments as unknown as { id: string; amount: number; payment_method: string; payment_type: string; paid_at: string; notes: string | null; payment_group_id?: string | null; created_by_profile?: { full_name: string } | null }[]) ?? []

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

  // ── Live-пересчёт для активных заказов: сумма считается от actual_start_at до now() ──
  // Это то, сколько клиент должен «прямо сейчас». При закрытии заказа
  // `POST /api/orders/[id]/return` зафиксирует точно ту же цифру.
  const isActive = order.status === 'active' || order.status === 'overdue'
  const actualStart = (order as any).actual_start_at as string | null

  const billingInputs: BillingItemInput[] = items
    .filter(it => it.rate_source !== 'manual')
    .map(it => {
      const eq = it.equipment
      const dayRate = eq?.day_rate ?? it.day_rate_snapshot ?? eq?.daily_rate ?? it.daily_rate ?? 0
      const nightRate = eq?.night_rate ?? it.night_rate_snapshot ?? dayRate
      return { equipment_id: it.equipment_id, day_rate: dayRate, night_rate: nightRate }
    })

  const liveBilling = isActive && actualStart && billingInputs.length > 0
    ? computeOrderBilling({ start: new Date(actualStart), end: new Date(), items: billingInputs })
    : null

  // Сумма manual-позиций (не пересчитываются) + live-авто
  const manualSubtotal = items
    .filter(it => it.rate_source === 'manual')
    .reduce((s, it) => s + (it.subtotal ?? 0), 0)
  const effectiveTotal = liveBilling
    ? liveBilling.total_amount + manualSubtotal
    : order.total_amount

  // Per-item live breakdown для отображения
  const itemBillingById = new Map<string, { day_units: number; night_units: number; subtotal: number; day_rate: number; night_rate: number }>()
  if (liveBilling) {
    const autoItems = items.filter(it => it.rate_source !== 'manual')
    autoItems.forEach((it, idx) => {
      const calc = liveBilling.items[idx]
      if (calc) itemBillingById.set(it.id, {
        day_units: calc.day_units,
        night_units: calc.night_units,
        subtotal: calc.subtotal,
        day_rate: calc.day_rate,
        night_rate: calc.night_rate,
      })
    })
  }

  const totalPaid = payments.filter(p => p.payment_type !== 'deposit_return').reduce((s, p) => s + p.amount, 0)
  const debt = effectiveTotal - payments.filter(p => p.payment_type === 'rental').reduce((s, p) => s + p.amount, 0)

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={order.order_number}
        description={`Клиент: ${client?.full_name}`}
        action={
          <div className="flex gap-2 flex-wrap">
            {order.status === 'active' || order.status === 'overdue' ? (
              <>
                <CloseOrderButton
                  orderId={id}
                  debt={Math.max(0, debt)}
                  variant="default"
                  items={items.map(it => ({
                    id: it.id,
                    name: it.equipment?.name ?? '—',
                    selected_kit_items: it.selected_kit_items ?? [],
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
                  .filter(it => (it.missing_kit_items ?? []).length > 0)
                  .map(it => ({
                    order_item_id: it.id,
                    equipment_name: it.equipment?.name ?? '—',
                    missing_kit_items: it.missing_kit_items ?? [],
                  }))}
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
          <p className="text-xs text-gray-500">Сумма аренды</p>
          <p className="font-semibold mt-1">{formatCurrency(effectiveTotal)}</p>
          {liveBilling && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              По факту: {liveBilling.explanation}
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
            const missing = item.missing_kit_items ?? []
            const isClosed = order.status === 'returned'
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
                  {missing.length > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      ⚠ Не возвращено: {missing.join(', ')}
                    </div>
                  )}
                </div>
                <span className="text-gray-700">
                  {(() => {
                    const live = itemBillingById.get(item.id)
                    const displayItem = live
                      ? {
                          day_units: live.day_units,
                          night_units: live.night_units,
                          day_rate_snapshot: live.day_rate,
                          night_rate_snapshot: live.night_rate,
                        }
                      : item
                    const displaySubtotal = live ? live.subtotal : item.subtotal
                    return (
                      <>
                        {getPricingParts(displayItem)
                          .map(part => `${describeShift(part.shiftType)} · ${formatCurrency(part.rate, item.equipment?.currency)} × ${describeUnits(part.units, part.shiftType)}`)
                          .join(' + ')}
                        {' = '}
                        {formatCurrency(displaySubtotal, item.equipment?.currency)}
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

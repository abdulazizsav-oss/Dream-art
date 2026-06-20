import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { ClientForm } from '@/components/clients/ClientForm'
import { ReliabilityRating } from '@/components/clients/ReliabilityRating'
import { formatCurrency, formatDate, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { ReturnMissingKitButton } from '@/components/orders/ReturnMissingKitButton'
import {
  buildLegacyMissingKitEvents,
  buildMissingKitByClient,
  formatMissingKitPreview,
  formatMissingKitAge,
  formatMissingSinceDateTime,
  mergeMissingKitEvents,
  type LegacyMissingKitOrderRow,
  type MissingKitEventRow,
} from '@/lib/missing-kit'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single()
  if (!client) notFound()

  const ordersPromise = supabase
    .from('orders')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const missingEventsPromise = supabase
    .from('order_item_missing_kit_events')
    .select('id, order_id, order_item_id, kit_name, missing_since, returned_at, orders!inner(id, order_number, client_id, status, created_at), order_items(id, equipment(name))')
    .eq('orders.client_id', id)
    .is('returned_at', null)
    .order('missing_since', { ascending: false })

  const legacyMissingOrdersPromise = supabase
    .from('orders')
    .select('id, order_number, client_id, status, created_at, updated_at, actual_end_at, actual_return_date, order_items(id, actual_end_at, missing_kit_items, equipment(name))')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const [{ data: orders }, { data: missingEvents }, { data: legacyMissingOrders }] = await Promise.all([
    ordersPromise,
    missingEventsPromise,
    legacyMissingOrdersPromise,
  ])
  const missingEventRows = mergeMissingKitEvents(
    (missingEvents ?? []) as unknown as MissingKitEventRow[],
    buildLegacyMissingKitEvents((legacyMissingOrders ?? []) as unknown as LegacyMissingKitOrderRow[]),
  )
  const missingKit = buildMissingKitByClient(missingEventRows).get(id)
  const oldestMissing = missingKit?.orders
    .flatMap(order => order.items.flatMap(item => item.missing))
    .sort((a, b) => b.age_days - a.age_days || a.missing_since.localeCompare(b.missing_since))[0]

  const totalSpend = orders?.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total_amount, 0) ?? 0

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        {client.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.photo_url}
            alt={client.full_name}
            className="h-16 w-16 rounded-full object-cover border border-zinc-200 shadow-sm"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 text-lg font-semibold">
            {client.full_name?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <PageHeader title={client.full_name} description="Карточка клиента" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Аренд всего</p>
          <p className="text-2xl font-semibold mt-1">{orders?.length ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Общий оборот</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(totalSpend)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Депозит</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(client.deposit_held)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Надёжность</p>
          <div className="mt-1.5">
            <ReliabilityRating rating={client.reliability_rating} readonly />
          </div>
        </div>
      </div>

      {missingKit && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-orange-800">
                <AlertTriangle className="h-4 w-4" />
                Недосдача у клиента
              </p>
              <p className="mt-1 text-sm text-orange-700">
                {missingKit.total} поз. · {formatMissingKitPreview(missingKit.names, 8)}
              </p>
              {oldestMissing && (
                <p className="mt-1 text-xs font-semibold text-orange-800">
                  Дата недосдачи: {formatMissingSinceDateTime(oldestMissing.missing_since)} · прошло {formatMissingKitAge(oldestMissing.missing_since)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {missingKit.orders.map(order => (
              <div key={order.orderId} className="rounded-lg border border-orange-100 bg-white/80 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link href={`/orders/${order.orderId}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                      {order.orderNumber}
                    </Link>
                    {order.items[0]?.missing[0] && (
                      <p className="mt-1 text-xs font-medium text-orange-700">
                        Недосдано с {formatMissingSinceDateTime(order.items[0].missing[0].missing_since)} · {formatMissingKitAge(order.items[0].missing[0].missing_since)}
                      </p>
                    )}
                  </div>
                  <ReturnMissingKitButton
                    orderId={order.orderId}
                    items={order.items}
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {order.items.flatMap(item =>
                    item.missing.map(missing => (
                      <span
                        key={`${item.order_item_id}-${missing.kit_name}`}
                        className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700"
                      >
                        {item.equipment_name}: {missing.kit_name} · с {formatMissingSinceDateTime(missing.missing_since)} · {formatMissingKitAge(missing.missing_since)}
                      </span>
                    )),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Редактировать</h2>
        <ClientForm
          clientId={id}
          defaultValues={{
            full_name: client.full_name,
            phone: client.phone ?? undefined,
            email: client.email ?? undefined,
            telegram_username: client.telegram_username ?? undefined,
            instagram_username: client.instagram_username ?? undefined,
            facebook_username: client.facebook_username ?? undefined,
            address_actual: client.address_actual ?? undefined,
            address_registered: client.address_registered ?? undefined,
            photo_url: client.photo_url ?? undefined,
            document_type: client.document_type ?? 'passport_id',
            passport_series: client.passport_series ?? undefined,
            passport_number: client.passport_number ?? undefined,
            passport_issued_by: client.passport_issued_by ?? undefined,
            passport_issued_date: client.passport_issued_date ?? undefined,
            birth_date: client.birth_date ?? undefined,
            deposit_held: client.deposit_held,
            reliability_rating: client.reliability_rating,
            segment: client.segment,
            notes: client.notes ?? undefined,
            trusted_person_name: client.trusted_person_name ?? undefined,
            trusted_person_phone: client.trusted_person_phone ?? undefined,
            trusted_person_relation: client.trusted_person_relation ?? undefined,
          }}
        />
      </div>

      {orders && orders.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">История аренд</h2>
          <div className="space-y-2">
            {orders.map(o => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-gray-50 px-2 rounded"
              >
                <div>
                  <p className="text-sm font-medium text-blue-600">{o.order_number}</p>
                  <p className="text-xs text-gray-400">{formatDate(o.start_date)} — {formatDate(o.end_date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">{formatCurrency(o.total_amount)}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', ORDER_STATUS_COLORS[o.status])}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

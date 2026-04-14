import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { ClientForm } from '@/components/clients/ClientForm'
import { ReliabilityRating } from '@/components/clients/ReliabilityRating'
import { formatCurrency, formatDate, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single()
  if (!client) notFound()

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const totalSpend = orders?.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total_amount, 0) ?? 0

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={client.full_name} description="Карточка клиента" />

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

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Редактировать</h2>
        <ClientForm
          clientId={id}
          defaultValues={{
            full_name: client.full_name,
            phone: client.phone ?? undefined,
            telegram_username: client.telegram_username ?? undefined,
            passport_series: client.passport_series ?? undefined,
            passport_number: client.passport_number ?? undefined,
            passport_issued_by: client.passport_issued_by ?? undefined,
            passport_issued_date: client.passport_issued_date ?? undefined,
            deposit_held: client.deposit_held,
            reliability_rating: client.reliability_rating,
            segment: client.segment,
            birth_date: client.birth_date ?? undefined,
            notes: client.notes ?? undefined,
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

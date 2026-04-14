import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import {
  formatCurrency, formatDate, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS
} from '@/lib/utils'
import { cn } from '@/lib/utils'
import { FileText, RotateCcw } from 'lucide-react'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*, clients(*), order_items(*, equipment(name, serial_number)), payments(*)')
    .eq('id', id)
    .single()

  if (!order) notFound()

  const client = order.clients as { full_name: string; phone: string | null; telegram_username: string | null } | null
  const items = (order.order_items as { id: string; equipment: { name: string; serial_number: string | null } | null; daily_rate: number; days: number; subtotal: number; condition_on_issue: string | null; condition_on_return: string | null }[]) ?? []
  const payments = (order.payments as { id: string; amount: number; payment_method: string; payment_type: string; paid_at: string; notes: string | null }[]) ?? []

  const totalPaid = payments.filter(p => p.payment_type !== 'deposit_return').reduce((s, p) => s + p.amount, 0)
  const debt = order.total_amount - payments.filter(p => p.payment_type === 'rental').reduce((s, p) => s + p.amount, 0)

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={order.order_number}
        description={`Клиент: ${client?.full_name}`}
        action={
          <div className="flex gap-2">
            {order.status === 'active' || order.status === 'overdue' ? (
              <Link href={`/orders/${id}/return`}>
                <Button variant="outline">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Оформить возврат
                </Button>
              </Link>
            ) : null}
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
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Период</p>
          <p className="font-medium text-sm mt-1">
            {formatDate(order.start_date)} — {formatDate(order.end_date)}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Сумма аренды</p>
          <p className="font-semibold mt-1">{formatCurrency(order.total_amount)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Задолженность</p>
          <p className={cn('font-semibold mt-1', debt > 0 ? 'text-red-600' : 'text-green-600')}>
            {formatCurrency(Math.max(0, debt))}
          </p>
        </div>
      </div>

      {/* Client info */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-3">Клиент</h2>
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

      {/* Equipment list */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-3">Техника</h2>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
              <div>
                <p className="font-medium">{item.equipment?.name}</p>
                <p className="text-xs text-gray-400">
                  {item.equipment?.serial_number && `S/N: ${item.equipment.serial_number} · `}
                  {item.condition_on_issue && `Состояние при выдаче: ${item.condition_on_issue}`}
                  {item.condition_on_return && ` · При возврате: ${item.condition_on_return}`}
                </p>
              </div>
              <span className="text-gray-700">
                {formatCurrency(item.daily_rate)} × {item.days}д = {formatCurrency(item.subtotal)}
              </span>
            </div>
          ))}
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
        {payments.length > 0 ? (
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <p>{PAYMENT_TYPE_LABELS[p.payment_type]} · {PAYMENT_METHOD_LABELS[p.payment_method]}</p>
                  <p className="text-xs text-gray-400">{formatDate(p.paid_at)}</p>
                  {p.notes && <p className="text-xs text-gray-400">{p.notes}</p>}
                </div>
                <span className={cn('font-medium', p.payment_type === 'deposit_return' ? 'text-red-600' : 'text-green-700')}>
                  {formatCurrency(p.amount)}
                </span>
              </div>
            ))}
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

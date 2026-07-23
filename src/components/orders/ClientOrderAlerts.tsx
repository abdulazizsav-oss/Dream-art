'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CircleDollarSign, PackageOpen } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { ClientOrderAlertSummary } from '@/lib/client-order-alerts'

export function ClientOrderAlerts({ clientId }: { clientId: string }) {
  const [summary, setSummary] = useState<ClientOrderAlertSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setSummary(null)

    fetch(`/api/clients/${clientId}/order-alerts`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось проверить клиента')
        return response.json() as Promise<ClientOrderAlertSummary>
      })
      .then(setSummary)
      .catch(error => {
        if (error.name !== 'AbortError') setSummary(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [clientId])

  if (loading) return <p className="text-xs text-zinc-400">Проверяем долги и технику клиента…</p>
  if (!summary) return null

  const hasAlerts = summary.outstanding_total > 0.01
    || summary.active_equipment.length > 0
    || summary.missing_accessories.total > 0
  if (!hasAlerts) return null

  return (
    <aside className="rounded-xl border border-amber-300 bg-amber-50 p-3" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
        <AlertTriangle className="h-4 w-4" /> Внимание по клиенту
      </p>

      <div className="mt-2 space-y-2 text-sm text-amber-900">
        {summary.outstanding_total > 0.01 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white/70 p-2">
            <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Остаток долга: {formatCurrency(summary.outstanding_total)}</p>
              <p className="mt-0.5 text-xs text-amber-800">
                {summary.debt_orders.slice(0, 3).map(order => `${order.order_number} · ${formatCurrency(order.outstanding)}`).join(', ')}
              </p>
            </div>
          </div>
        )}

        {summary.active_equipment.map(order => (
          <div key={order.order_id} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white/70 p-2">
            <PackageOpen className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Техника ещё у клиента</p>
              <p className="mt-0.5 text-xs text-amber-800">
                <Link href={`/orders/${order.order_id}`} className="font-medium underline underline-offset-2">
                  {order.order_number}
                </Link>
                {' · '}{order.equipment_names.join(', ')}
              </p>
            </div>
          </div>
        ))}

        {summary.missing_accessories.total > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50/80 p-2 text-orange-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Не сданы аксессуары: {summary.missing_accessories.total}</p>
              <p className="mt-0.5 text-xs text-orange-800">{summary.missing_accessories.names.slice(0, 6).join(', ')}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}


'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CircleDollarSign, PackageOpen } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ClientOrderAlertSummary } from '@/lib/client-order-alerts'

type AlertLoadState =
  | { clientId: string; status: 'loading' | 'error'; summary?: never }
  | { clientId: string; status: 'ready'; summary: ClientOrderAlertSummary }

function isAlertSummary(value: unknown): value is ClientOrderAlertSummary {
  if (!value || typeof value !== 'object') return false
  const summary = value as ClientOrderAlertSummary
  return Number.isFinite(summary.outstanding_total)
    && Array.isArray(summary.debt_orders)
    && summary.debt_orders.every(order => order && typeof order.order_number === 'string' && Number.isFinite(order.outstanding))
    && Array.isArray(summary.active_equipment)
    && summary.active_equipment.every(order => order
      && typeof order.order_id === 'string'
      && typeof order.order_number === 'string'
      && Array.isArray(order.equipment_names)
      && order.equipment_names.every(name => typeof name === 'string'))
    && !!summary.missing_accessories
    && Number.isFinite(summary.missing_accessories.total)
    && Array.isArray(summary.missing_accessories.names)
    && summary.missing_accessories.names.every(name => typeof name === 'string')
}

export function ClientOrderAlerts({ clientId }: { clientId: string }) {
  const [state, setState] = useState<AlertLoadState>({ clientId, status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ clientId, status: 'loading' })
    const timeout = setTimeout(() => {
      controller.abort()
      setState({ clientId, status: 'error' })
    }, 15_000)

    fetch(`/api/clients/${clientId}/order-alerts`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось проверить клиента')
        const result: unknown = await response.json()
        if (!isAlertSummary(result)) throw new Error('Неполный ответ проверки клиента')
        return result
      })
      .then(summary => {
        if (!controller.signal.aborted) setState({ clientId, status: 'ready', summary })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ clientId, status: 'error' })
      })
      .finally(() => clearTimeout(timeout))

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [clientId, attempt])

  // Hide the preceding client's result even before the effect for a new id runs.
  if (state.clientId !== clientId || state.status === 'loading') {
    return <p className="text-sm text-zinc-500" role="status">Проверяем долги и технику клиента…</p>
  }
  if (state.status === 'error') {
    return (
      <aside className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3" role="status">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-950"><AlertTriangle className="h-4 w-4 shrink-0" /> Не удалось проверить клиента</p>
          <p className="mt-1 text-sm text-amber-900">Долги и невозвращённая техника пока не проверены. Повторите проверку перед выдачей.</p>
        </div>
        <Button type="button" variant="outline" className="min-h-[52px] shrink-0 bg-white px-4" onClick={() => {
          setState({ clientId, status: 'loading' })
          setAttempt(value => value + 1)
        }}>Повторить проверку</Button>
      </aside>
    )
  }

  const summary = state.summary

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

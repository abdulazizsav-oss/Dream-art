'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  PackageCheck,
  Plus,
  Search,
  Truck,
  WalletCards,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CloseOrderButton } from '@/components/orders/CloseOrderButton'
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@/lib/utils'

import { matchesQueue, matchesOrderSearch, type OrderStatus, type QueueFilter, type OrderListItem } from '@/lib/orders/list'
import { ReturnMissingKitButton } from '@/components/orders/ReturnMissingKitButton'
export type { OrderListItem } from '@/lib/orders/list'

type DeliveryFilter = 'all' | 'with' | 'without'
type SortOrder = 'newest' | 'oldest' | 'debt'

interface Props {
  orders: OrderListItem[]
  totalCount: number
}

const PAGE_SIZE = 10

const QUEUES: { value: QueueFilter; label: string }[] = [
  { value: 'active', label: 'В работе' },
  { value: 'overdue', label: 'Просрочки' },
  { value: 'debt', label: 'С долгом' },
  { value: 'missing', label: 'Не возвращено' },
  { value: 'returned', label: 'Завершённые' },
  { value: 'all', label: 'Все' },
]

function equipmentSummary(names: string[]) {
  if (names.length === 0) return 'Техника не указана'
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function orderPeriod(order: OrderListItem) {
  if (order.actualStartAt && order.actualEndAt) {
    return {
      label: 'Фактическое время',
      value: `${formatDateTime(order.actualStartAt)} — ${formatDateTime(order.actualEndAt)}`,
    }
  }
  if (order.actualStartAt) {
    return {
      label: 'Выдан клиенту',
      value: `${formatDateTime(order.actualStartAt)} · ещё не закрыт`,
    }
  }
  return {
    label: 'Плановый период',
    value: order.endDate
      ? `${formatDate(order.startDate)} — ${formatDate(order.endDate)}`
      : `${formatDate(order.startDate)} — срок не записан`,
  }
}

export function OrdersExplorer({ orders, totalCount }: Props) {
  const [queue, setQueue] = useState<QueueFilter>('active')
  const [query, setQuery] = useState('')
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all')
  const [sort, setSort] = useState<SortOrder>('newest')
  const [page, setPage] = useState(1)

  const counts = useMemo(() => ({
    active: orders.filter(order => matchesQueue(order, 'active')).length,
    overdue: orders.filter(order => matchesQueue(order, 'overdue')).length,
    debt: orders.filter(order => matchesQueue(order, 'debt')).length,
    missing: orders.filter(order => matchesQueue(order, 'missing')).length,
    returned: orders.filter(order => matchesQueue(order, 'returned')).length,
    all: orders.length,
  }), [orders])

  const totalDebt = useMemo(
    () => orders.reduce((sum, order) => sum + (order.status === 'cancelled' ? 0 : order.debt), 0),
    [orders],
  )

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru')
    const result = orders.filter(order => {
      if (!matchesQueue(order, queue)) return false
      if (deliveryFilter === 'with' && order.deliveryFee <= 0) return false
      if (deliveryFilter === 'without' && order.deliveryFee > 0) return false
      if (!normalizedQuery) return true

      return matchesOrderSearch(order, query)
    })

    return result.sort((a, b) => {
      if (sort === 'debt') return b.debt - a.debt
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
      return sort === 'oldest' ? aTime - bTime : bTime - aTime
    })
  }, [deliveryFilter, orders, query, queue, sort])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const visibleOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [deliveryFilter, query, queue, sort])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function selectQueue(nextQueue: QueueFilter) {
    setQueue(nextQueue)
  }

  function resetFilters() {
    setQuery('')
    setDeliveryFilter('all')
    setSort('newest')
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Аренда техники</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">Заказы</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Текущие аренды, оплаты и история — без длинного общего списка.
          </p>
        </div>
        <Link href="/orders/new" className="shrink-0">
          <Button className="min-h-[46px] px-4 shadow-sm transition-transform active:scale-[0.98]">
            <Plus className="mr-2 h-4 w-4" />
            Новый заказ
          </Button>
        </Link>
      </header>

      <section className="grid overflow-hidden rounded-2xl border bg-white sm:grid-cols-2 xl:grid-cols-5">
        <MetricButton
          label="В работе"
          value={String(counts.active)}
          caption={counts.overdue > 0 ? `${counts.overdue} просрочено` : 'Без просрочек'}
          tone={counts.overdue > 0 ? 'danger' : 'neutral'}
          active={queue === 'active'}
          onClick={() => selectQueue('active')}
        />
        <MetricButton
          label="Просрочено"
          value={String(counts.overdue)}
          caption="Требуют внимания"
          tone={counts.overdue > 0 ? 'danger' : 'neutral'}
          active={queue === 'overdue'}
          onClick={() => selectQueue('overdue')}
        />
        <MetricButton
          label="Общий долг"
          value={formatCurrency(totalDebt)}
          caption={`${counts.debt} заказов с остатком`}
          tone={totalDebt > 0 ? 'warning' : 'neutral'}
          active={queue === 'debt'}
          onClick={() => selectQueue('debt')}
        />
        <MetricButton
          label="Не возвращено"
          value={String(counts.missing)}
          caption="Забытый комплект и техника с просрочкой"
          tone={counts.missing > 0 ? 'warning' : 'neutral'}
          active={queue === 'missing'}
          onClick={() => selectQueue('missing')}
        />
        <MetricButton
          label="Завершено"
          value={String(counts.returned)}
          caption={`${totalCount} заказов всего`}
          tone="success"
          active={queue === 'returned'}
          onClick={() => selectQueue('returned')}
          last
        />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-3 py-3 md:px-4">
          <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Очереди заказов">
            {QUEUES.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectQueue(option.value)}
                className={cn(
                  'flex min-h-[38px] shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
                  queue === option.value
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
                )}
              >
                {option.label}
                <span className={cn(
                  'tabular-nums text-xs',
                  queue === option.value ? 'text-zinc-300' : 'text-zinc-400',
                )}>
                  {counts[option.value]}
                </span>
              </button>
            ))}
          </nav>

          {queue === 'missing' && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Здесь заказы с не сданными элементами комплекта (в том числе после частичного возврата)
              и техникой с истёкшим сроком аренды. После возврата всех позиций заказ исчезнет из этой вкладки.
            </p>
          )}

          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_190px_190px]">
            <label className="relative block md:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Номер, клиент, телефон или техника"
                className="min-h-[44px] w-full rounded-xl border bg-zinc-50 pl-10 pr-3 text-sm outline-none transition focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-100"
              />
            </label>
            <label className="relative">
              <Truck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <select
                value={deliveryFilter}
                onChange={event => setDeliveryFilter(event.target.value as DeliveryFilter)}
                className="min-h-[44px] w-full appearance-none rounded-xl border bg-white pl-10 pr-3 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
              >
                <option value="all">Все заказы</option>
                <option value="with">С доставкой</option>
                <option value="without">Без доставки</option>
              </select>
            </label>
            <label className="relative">
              <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <select
                value={sort}
                onChange={event => setSort(event.target.value as SortOrder)}
                className="min-h-[44px] w-full appearance-none rounded-xl border bg-white pl-10 pr-3 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
              >
                <option value="newest">Сначала новые</option>
                <option value="oldest">Сначала старые</option>
                <option value="debt">Сначала большой долг</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
            <span>
              Найдено: <strong className="font-semibold text-zinc-800">{filteredOrders.length}</strong>
            </span>
            {totalCount > orders.length && (
              <span>Показаны последние {orders.length} из {totalCount}</span>
            )}
          </div>
        </div>

        {visibleOrders.length > 0 ? (
          <div className="divide-y">
            {visibleOrders.map(order => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        ) : (
          <EmptyOrders hasFilters={Boolean(query) || deliveryFilter !== 'all'} onReset={resetFilters} />
        )}

        {filteredOrders.length > PAGE_SIZE && (
          <footer className="flex items-center justify-between gap-3 border-t bg-zinc-50/70 px-4 py-3">
            <p className="text-xs text-zinc-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredOrders.length)} из {filteredOrders.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage(current => Math.max(1, current - 1))}
                disabled={page === 1}
                aria-label="Предыдущая страница"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-20 text-center text-xs font-medium tabular-nums text-zinc-600">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                aria-label="Следующая страница"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}

function MetricButton({
  label,
  value,
  caption,
  tone,
  active,
  onClick,
  last = false,
}: {
  label: string
  value: string
  caption: string
  tone: 'neutral' | 'danger' | 'warning' | 'success'
  active: boolean
  onClick: () => void
  last?: boolean
}) {
  const valueClass = tone === 'danger'
    ? 'text-red-700'
    : tone === 'warning'
      ? 'text-amber-700'
      : tone === 'success'
        ? 'text-emerald-700'
        : 'text-zinc-950'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative min-h-28 border-b px-4 py-4 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500 sm:border-r xl:border-b-0',
        last && 'sm:border-r-0',
        active ? 'bg-zinc-50' : 'hover:bg-zinc-50/70',
      )}
    >
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <span className={cn('mt-2 block text-xl font-semibold tracking-tight tabular-nums', valueClass)}>{value}</span>
      <span className="mt-1 block text-xs text-zinc-400">{caption}</span>
      <span className={cn(
        'absolute inset-x-4 bottom-0 h-0.5 origin-left bg-zinc-900 transition-transform',
        active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
      )} />
    </button>
  )
}

function OrderRow({ order }: { order: OrderListItem }) {
  const isOpen = ['active', 'overdue'].includes(order.status)
  const period = orderPeriod(order)
  const hasDebt = order.debt > 0.01 && order.status !== 'cancelled'
  const orderHref = `/orders/${order.id}`
  const displayStatus: OrderStatus = order.isOverdue
    ? 'overdue'
    : order.status === 'overdue'
      ? 'active'
      : order.status

  return (
    <article className={cn(
      'group relative transition-colors hover:bg-zinc-50/80 active:bg-zinc-100',
      order.isOverdue && 'border-l-4 border-l-red-500 bg-red-50/70 hover:bg-red-50',
    )}>
      <Link
        href={orderHref}
        aria-label={`Открыть заказ ${order.orderNumber}`}
        className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
      >
        <span className="sr-only">Открыть заказ {order.orderNumber}</span>
      </Link>

      <div className="pointer-events-none relative z-10 grid min-h-[132px] gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1.15fr)_minmax(135px,.7fr)_minmax(155px,.78fr)] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-blue-700">
              {order.orderNumber}
            </span>
            {order.deliveryFee > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700">
                <Truck className="h-3 w-3" /> Доставка · {formatCurrency(order.deliveryFee)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm font-medium text-zinc-800">{order.clientName}</p>
          <p className="mt-0.5 truncate text-xs text-zinc-400">
            {order.clientPhone ?? 'Телефон не указан'}
            {order.createdAt ? ` · создан ${formatDateTime(order.createdAt)}` : ''}
          </p>
          {order.missingKitItems.length > 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Не возвращено: {order.missingKitItems.join(', ')}
            </p>
          )}
          {order.isOverdue && (
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Срок возврата истёк: {order.overdueEquipmentNames.join(', ') || 'техника не возвращена'}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">{period.label}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-700">{period.value}</p>
          <p className="mt-2 truncate text-xs text-zinc-500" title={order.equipmentNames.join(', ')}>
            <PackageCheck className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-zinc-400" />
            {equipmentSummary(order.equipmentNames)}
          </p>
          {order.createdBy && <p className="mt-1 truncate text-[11px] text-zinc-400">Оформил: {order.createdBy}</p>}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">Расчёт</p>
          <p className="mt-1 font-semibold tabular-nums text-zinc-900">{formatCurrency(order.effectiveTotal)}</p>
          <p className="mt-1 text-[11px] tabular-nums text-emerald-700">
            Оплачено: {formatCurrency(order.paidRental)}
          </p>
          {hasDebt && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold tabular-nums text-amber-700">
              <WalletCards className="h-3 w-3" />
              Долг: {formatCurrency(order.debt)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-stretch">
          <span className={cn(
            'inline-flex w-fit rounded-md px-2 py-1 text-xs font-medium',
            ORDER_STATUS_COLORS[displayStatus],
          )}>
            {ORDER_STATUS_LABELS[displayStatus]}
          </span>
          {isOpen && (
            <CloseOrderButton
              orderId={order.id}
              debt={order.debt}
              items={order.closeItems}
              deliveryFee={order.deliveryFee}
              deliveryPaid={order.deliveryPaid}
              deliveryToClient={order.deliveryToClient}
              deliveryFromClient={order.deliveryFromClient}
              variant="outline"
              size="sm"
              className="pointer-events-auto min-h-10 min-w-[132px] flex-1 justify-center text-xs md:w-full"
            />
          )}
          {order.missingKitDetails.length > 0 && (
            <ReturnMissingKitButton
              orderId={order.id}
              items={order.missingKitDetails}
              className="pointer-events-auto min-h-10"
            />
          )}
          <Link
            href={orderHref}
            className="pointer-events-auto inline-flex min-h-10 min-w-[132px] flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 md:w-full"
          >
            Открыть заказ
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  )
}

function EmptyOrders({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
        <ClipboardList className="h-5 w-5 text-zinc-400" />
      </div>
      <p className="mt-4 font-medium text-zinc-800">В этой очереди заказов нет</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
        {hasFilters ? 'Измените запрос или сбросьте дополнительные фильтры.' : 'Выберите другую очередь заказов.'}
      </p>
      {hasFilters && (
        <Button type="button" variant="outline" size="sm" onClick={onReset} className="mt-4">
          Сбросить фильтры
        </Button>
      )}
    </div>
  )
}

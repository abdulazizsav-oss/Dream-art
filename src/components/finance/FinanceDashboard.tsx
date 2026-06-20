'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Download,
  Landmark,
  Package,
  Plus,
  ReceiptText,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { PaymentForm } from '@/components/finance/PaymentForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  EXPENSE_CATEGORY_LABELS,
  FinanceAnalytics,
  FinancePreset,
  getFinancePeriod,
  percentageChange,
} from '@/lib/finance'
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  getTashkentDate,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
} from '@/lib/utils'

const CHART_COLORS = ['#18181b', '#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed']

interface FinanceDashboardMetadata {
  orders: { id: string; order_number: string; clients: { full_name: string } | null }[]
  equipment: { id: string; name: string }[]
  is_super_admin: boolean
}

export function FinanceDashboard() {
  const today = getTashkentDate()
  const initial = getFinancePeriod('month', today)
  const [preset, setPreset] = useState<FinancePreset>('month')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [data, setData] = useState<FinanceAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [metadata, setMetadata] = useState<FinanceDashboardMetadata>({
    orders: [],
    equipment: [],
    is_super_admin: false,
  })
  const [defaultOrderId, setDefaultOrderId] = useState<string>()

  useEffect(() => {
    setDefaultOrderId(new URLSearchParams(window.location.search).get('order') ?? undefined)
    fetch('/api/finance/metadata')
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить справочники')
        return payload as FinanceDashboardMetadata
      })
      .then(setMetadata)
      .catch(fetchError => setError(fetchError.message))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/finance/analytics?from=${from}&to=${to}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить аналитику')
        return payload as FinanceAnalytics
      })
      .then(setData)
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [from, reloadKey, to])

  const selectPreset = (next: FinancePreset) => {
    setPreset(next)
    if (next !== 'custom') {
      const period = getFinancePeriod(next, today)
      setFrom(period.from)
      setTo(period.to)
    }
  }

  const refresh = () => setReloadKey(value => value + 1)

  return (
    <div className="space-y-5">
      <PeriodControls
        preset={preset}
        from={from}
        to={to}
        onPreset={selectPreset}
        onFrom={value => {
          setPreset('custom')
          setFrom(value)
        }}
        onTo={value => {
          setPreset('custom')
          setTo(value)
        }}
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {data?.warnings.non_uzs_equipment.length ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Есть техника с неподдерживаемой валютой</p>
            <p className="mt-1">
              {data.warnings.non_uzs_equipment.map(item => `${item.name} (${item.currency})`).join(', ')}.
              Эти позиции скрыты при оформлении заказа до установки ставок в UZS.
            </p>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="overview" className="gap-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-11 min-w-max rounded-xl border bg-white p-1">
            <TabsTrigger value="overview" className="px-3">Обзор</TabsTrigger>
            <TabsTrigger value="equipment" className="px-3">Техника</TabsTrigger>
            <TabsTrigger value="team" className="px-3">Команда</TabsTrigger>
            <TabsTrigger value="payments" className="px-3">Платежи</TabsTrigger>
            <TabsTrigger value="expenses" className="px-3">Расходы</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab data={data} loading={loading} />
        </TabsContent>
        <TabsContent value="equipment">
          <EquipmentTab data={data} loading={loading} />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab data={data} loading={loading} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab
            data={data}
            loading={loading}
            orders={metadata.orders}
            defaultOrderId={defaultOrderId}
            from={from}
            to={to}
            onChanged={refresh}
          />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab
            data={data}
            loading={loading}
            equipment={metadata.equipment}
            isSuperAdmin={metadata.is_super_admin}
            from={from}
            to={to}
            onChanged={refresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PeriodControls({
  preset,
  from,
  to,
  onPreset,
  onFrom,
  onTo,
}: {
  preset: FinancePreset
  from: string
  to: string
  onPreset: (value: FinancePreset) => void
  onFrom: (value: string) => void
  onTo: (value: string) => void
}) {
  const presets: { value: FinancePreset; label: string }[] = [
    { value: 'today', label: 'Сегодня' },
    { value: 'week', label: 'Неделя' },
    { value: 'month', label: 'Месяц' },
    { value: 'quarter', label: 'Квартал' },
    { value: 'year', label: 'Год' },
  ]

  return (
    <div className="rounded-2xl border bg-white p-3 md:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Период отчёта</p>
          <div className="flex flex-wrap gap-2">
            {presets.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => onPreset(item.value)}
                className={cn(
                  'min-h-[38px] rounded-xl border px-3 text-xs font-medium',
                  preset === item.value
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-600',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <label>
            <span className="mb-1 block text-xs text-zinc-500">С</span>
            <Input type="date" value={from} onChange={event => event.target.value && onFrom(event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-zinc-500">По</span>
            <Input type="date" value={to} min={from} onChange={event => event.target.value && onTo(event.target.value)} />
          </label>
          <div className="col-span-2 flex items-end">
            <ExportButton type="summary" from={from} to={to} />
          </div>
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ data, loading }: { data: FinanceAnalytics | null; loading: boolean }) {
  if (loading || !data) return <FinanceSkeleton />
  const hasMovement = data.series.some(item => item.revenue !== 0 || item.expenses !== 0 || item.result !== 0)
  const hasDebt = data.debt.buckets.some(item => item.value > 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Выручка"
          value={data.kpi.revenue}
          previous={data.previous.revenue}
          tone="green"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Расходы"
          value={data.kpi.expenses}
          previous={data.previous.expenses}
          tone="red"
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <KpiCard
          label="Денежный результат"
          value={data.kpi.result}
          previous={data.previous.result}
          tone={data.kpi.result >= 0 ? 'green' : 'red'}
          icon={<Landmark className="h-4 w-4" />}
        />
        <KpiCard label="Задолженность" value={data.kpi.debt} tone="amber" icon={<ReceiptText className="h-4 w-4" />} />
        <KpiCard label="Средний чек" value={data.kpi.average_check} tone="blue" icon={<WalletCards className="h-4 w-4" />} />
        <KpiCard
          label="Заказов"
          value={data.kpi.orders_count}
          previous={data.previous.orders_count}
          money={false}
          tone="zinc"
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <ChartCard title="Движение денег" description="Выручка, расходы и результат по дням">
          {hasMovement ? (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={data.series} margin={{ left: 8, right: 8 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(value: number) => formatCurrency(Number(value))} labelFormatter={label => formatDate(String(label))} />
                <Legend />
                <Area name="Выручка" type="monotone" dataKey="revenue" stroke="#16a34a" fill="url(#revenueFill)" strokeWidth={2} />
                <Area name="Расходы" type="monotone" dataKey="expenses" stroke="#dc2626" fill="transparent" strokeWidth={2} />
                <Area name="Результат" type="monotone" dataKey="result" stroke="#18181b" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="Поступлений и расходов за период нет" />}
        </ChartCard>

        <ChartCard title="Задолженность" description="Текущий неоплаченный остаток по сроку">
          {hasDebt ? (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.debt.buckets} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                  <Bar dataKey="value" name="Долг" fill="#f59e0b" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="px-4 pb-4 text-2xl font-semibold text-amber-700">{formatCurrency(data.debt.total)}</p>
            </>
          ) : <EmptyChart label="Текущей задолженности нет" />}
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <DonutCard title="Способы оплаты" data={data.payment_methods} labels={PAYMENT_METHOD_LABELS} />
        <DonutCard title="Типы поступлений" data={data.payment_types} labels={PAYMENT_TYPE_LABELS} />
        <TopClientsCard clients={data.clients} />
      </div>

      {(data.warnings.clients_without_author > 0 || data.warnings.unallocated_rental_amount > 0) && (
        <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
          <h3 className="font-semibold text-zinc-900">Качество данных</h3>
          <div className="mt-2 space-y-1">
            {data.warnings.clients_without_author > 0 && (
              <p>{data.warnings.clients_without_author} клиентов созданы до внедрения учёта автора.</p>
            )}
            {data.warnings.unallocated_rental_amount > 0 && (
              <p>Не распределено по технике: {formatCurrency(data.warnings.unallocated_rental_amount)}.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EquipmentTab({ data, loading }: { data: FinanceAnalytics | null; loading: boolean }) {
  if (loading || !data) return <FinanceSkeleton />
  const top = data.equipment.slice(0, 12)

  return (
    <div className="space-y-5">
      <ChartCard title="Какая техника приносит деньги" description="Начислено, фактически получено и расходы">
        {top.length ? (
          <ResponsiveContainer width="100%" height={Math.max(340, top.length * 42)}>
            <BarChart data={top} layout="vertical" margin={{ left: 30, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="billed" name="Начислено" fill="#a1a1aa" radius={[0, 4, 4, 0]} />
              <Bar dataKey="collected" name="Получено" fill="#16a34a" radius={[0, 4, 4, 0]} />
              <Bar dataKey="expenses" name="Расходы" fill="#dc2626" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartCard>

      <DataTable
        headers={['Техника', 'Аренд', 'Начислено', 'Получено', 'Расходы', 'Результат', 'Окупаемость']}
        rows={data.equipment.map(item => {
          const roi = item.purchase_cost && item.purchase_cost > 0
            ? (item.collected / item.purchase_cost) * 100
            : null
          return [
            <Link key="name" href={`/equipment/${item.id}`} className="font-medium hover:underline">{item.name}</Link>,
            item.rentals,
            formatCurrency(item.billed),
            formatCurrency(item.collected),
            formatCurrency(item.expenses),
            <span key="result" className={item.result >= 0 ? 'text-green-700' : 'text-red-700'}>{formatCurrency(item.result)}</span>,
            roi == null ? 'Нет закупочной цены' : `${roi.toFixed(1)}%`,
          ]
        })}
      />
    </div>
  )
}

function TeamTab({ data, loading }: { data: FinanceAnalytics | null; loading: boolean }) {
  if (loading || !data) return <FinanceSkeleton />

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Заказы по администраторам" description="Количество оформленных заказов">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.team}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="full_name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="orders_count" name="Заказы" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Принятые платежи" description="Кто принял больше поступлений за период">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.team}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="full_name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
              <Bar dataKey="payments_amount" name="Платежи" fill="#16a34a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <DataTable
        headers={['Администратор', 'Роль', 'Заказов', 'Сумма заказов', 'Принял платежей', 'Добавил клиентов']}
        rows={data.team.map(item => [
          item.full_name,
          item.role === 'super_admin' ? 'Главный администратор' : 'Администратор',
          item.orders_count,
          formatCurrency(item.orders_amount),
          formatCurrency(item.payments_amount),
          item.clients_count,
        ])}
      />
    </div>
  )
}

function PaymentsTab({
  data,
  loading,
  orders,
  defaultOrderId,
  from,
  to,
  onChanged,
}: {
  data: FinanceAnalytics | null
  loading: boolean
  orders: FinanceDashboardMetadata['orders']
  defaultOrderId?: string
  from: string
  to: string
  onChanged: () => void
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Добавить платёж</h2>
        <p className="mb-5 mt-1 text-sm text-zinc-500">Оплата аренды автоматически распределится по технике заказа.</p>
        <PaymentForm orders={orders} defaultOrderId={defaultOrderId} onSuccess={onChanged} />
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Журнал платежей</h2>
            <p className="text-sm text-zinc-500">{formatDate(from)} – {formatDate(to)}</p>
          </div>
          <ExportButton type="payments" from={from} to={to} />
        </div>
        {loading ? <ListSkeleton /> : (
          <div className="divide-y">
            {(data?.payments ?? []).map(payment => (
              <div key={payment.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {PAYMENT_TYPE_LABELS[payment.payment_type] ?? payment.payment_type}
                    {' · '}
                    {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {payment.order_number} · {payment.client_name} · {formatDateTime(payment.paid_at)}
                  </p>
                  {payment.admin_name && <p className="mt-1 text-xs text-zinc-400">Принял: {payment.admin_name}</p>}
                </div>
                <span className="shrink-0 font-semibold text-green-700">{formatCurrency(payment.amount)}</span>
              </div>
            ))}
            {!data?.payments.length && <EmptyChart label="Платежей за период нет" />}
          </div>
        )}
      </div>
    </div>
  )
}

function ExpensesTab({
  data,
  loading,
  equipment,
  isSuperAdmin,
  from,
  to,
  onChanged,
}: {
  data: FinanceAnalytics | null
  loading: boolean
  equipment: FinanceDashboardMetadata['equipment']
  isSuperAdmin: boolean
  from: string
  to: string
  onChanged: () => void
}) {
  return (
    <div className={cn('grid gap-5', isSuperAdmin && 'xl:grid-cols-[420px_minmax(0,1fr)]')}>
      {isSuperAdmin && <ExpenseForm equipment={equipment} onSaved={onChanged} />}
      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Расходы</h2>
            <p className="text-sm text-zinc-500">{formatDate(from)} – {formatDate(to)}</p>
          </div>
          <ExportButton type="expenses" from={from} to={to} />
        </div>
        {loading ? <ListSkeleton /> : (
          <div className="divide-y">
            {(data?.expenses ?? []).map(expense => (
              <div key={expense.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(expense.expense_date)}
                    {expense.equipment_name ? ` · ${expense.equipment_name}` : ''}
                    {expense.admin_name ? ` · ${expense.admin_name}` : ''}
                  </p>
                  {expense.description && <p className="mt-1 text-xs text-zinc-400">{expense.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-red-700">{formatCurrency(expense.amount)}</span>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm('Удалить этот расход?')) return
                        const response = await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' })
                        if (!response.ok) {
                          toast.error('Не удалось удалить расход')
                          return
                        }
                        toast.success('Расход удалён')
                        onChanged()
                      }}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Удалить расход"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!data?.expenses.length && <EmptyChart label="Расходов за период нет" />}
          </div>
        )}
      </div>
    </div>
  )
}

function ExpenseForm({
  equipment,
  onSaved,
}: {
  equipment: FinanceDashboardMetadata['equipment']
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState('other')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(getTashkentDate())
  const [method, setMethod] = useState('cash')
  const [equipmentId, setEquipmentId] = useState('')
  const [description, setDescription] = useState('')

  return (
    <form
      className="rounded-2xl border bg-white p-5"
      onSubmit={async event => {
        event.preventDefault()
        setSaving(true)
        const response = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            amount,
            expense_date: date,
            payment_method: method,
            equipment_id: equipmentId || null,
            description,
          }),
        })
        setSaving(false)
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          toast.error(typeof payload?.error === 'string' ? payload.error : 'Не удалось добавить расход')
          return
        }
        toast.success('Расход добавлен')
        setAmount('')
        setDescription('')
        setEquipmentId('')
        onSaved()
      }}
    >
      <div className="mb-5 flex items-center gap-2">
        <Plus className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Добавить расход</h2>
      </div>
      <div className="space-y-4">
        <label className="block">
          <Label>Категория</Label>
          <select value={category} onChange={event => setCategory(event.target.value)} className="mt-1.5 min-h-[44px] w-full rounded-xl border px-3 text-sm">
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>Сумма UZS</Label>
            <Input className="mt-1.5" type="number" inputMode="decimal" min="1" value={amount} onChange={event => setAmount(event.target.value)} required />
          </label>
          <label>
            <Label>Дата</Label>
            <Input className="mt-1.5" type="date" value={date} onChange={event => setDate(event.target.value)} required />
          </label>
        </div>
        <label className="block">
          <Label>Способ оплаты</Label>
          <select value={method} onChange={event => setMethod(event.target.value)} className="mt-1.5 min-h-[44px] w-full rounded-xl border px-3 text-sm">
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>Техника, если применимо</Label>
          <select value={equipmentId} onChange={event => setEquipmentId(event.target.value)} className="mt-1.5 min-h-[44px] w-full rounded-xl border px-3 text-sm">
            <option value="">Общий расход</option>
            {equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="block">
          <Label>Описание</Label>
          <Textarea className="mt-1.5" value={description} onChange={event => setDescription(event.target.value)} rows={3} />
        </label>
        <Button type="submit" disabled={saving || Number(amount) <= 0} className="w-full">
          {saving ? 'Сохранение...' : 'Добавить расход'}
        </Button>
      </div>
    </form>
  )
}

function KpiCard({
  label,
  value,
  previous,
  money = true,
  tone,
  icon,
}: {
  label: string
  value: number
  previous?: number
  money?: boolean
  tone: 'green' | 'red' | 'amber' | 'blue' | 'zinc'
  icon: React.ReactNode
}) {
  const change = previous === undefined ? undefined : percentageChange(value, previous)
  const toneClasses = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    zinc: 'bg-zinc-100 text-zinc-700',
  }
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{label}</p>
        <span className={cn('rounded-lg p-1.5', toneClasses[tone])}>{icon}</span>
      </div>
      <p className="mt-3 text-xl font-semibold tabular-nums text-zinc-950">
        {money ? formatCurrency(value) : new Intl.NumberFormat('ru-RU').format(value)}
      </p>
      {change !== undefined && (
        <p className={cn('mt-2 text-[11px]', change === null || change >= 0 ? 'text-green-600' : 'text-red-600')}>
          {change === null ? 'Новый доход' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}% к прошлому периоду`}
        </p>
      )}
    </div>
  )
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white">
      <div className="px-4 pb-2 pt-4">
        <h2 className="font-semibold text-zinc-900">{title}</h2>
        {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
      </div>
      <div className="min-w-0 px-2 pb-2">{children}</div>
    </div>
  )
}

function DonutCard({
  title,
  data,
  labels,
}: {
  title: string
  data: { name: string; value: number }[]
  labels: Record<string, string>
}) {
  const chartData = data.map(item => ({ ...item, displayName: labels[item.name] ?? item.name }))
  return (
    <ChartCard title={title}>
      {chartData.length ? (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="displayName" innerRadius={58} outerRadius={88} paddingAngle={3}>
              {chartData.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : <EmptyChart />}
    </ChartCard>
  )
}

function TopClientsCard({ clients }: { clients: FinanceAnalytics['clients'] }) {
  return (
    <ChartCard title="Лучшие клиенты">
      <div className="divide-y px-3 pb-3">
        {clients.slice(0, 6).map((client, index) => (
          <Link key={client.id} href={`/clients/${client.id}`} className="flex items-center gap-3 py-3 hover:bg-zinc-50">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{client.full_name}</p>
              <p className="text-xs text-zinc-400">{client.orders_count} заказов</p>
            </div>
            <span className="text-sm font-semibold text-green-700">{formatCurrency(client.collected)}</span>
          </Link>
        ))}
        {!clients.length && <EmptyChart />}
      </div>
    </ChartCard>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-white">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b bg-zinc-50 text-left text-xs text-zinc-500">
          <tr>{headers.map(header => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-zinc-50">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3">{cell}</td>)}
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={headers.length} className="px-4 py-12 text-center text-zinc-400">Нет данных за период</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ExportButton({ type, from, to }: { type: string; from: string; to: string }) {
  return (
    <Button variant="outline" size="sm" render={<a href={`/api/finance/export?type=${type}&from=${from}&to=${to}`} />}>
      <Download className="mr-1 h-4 w-4" />
      CSV
    </Button>
  )
}

function FinanceSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border bg-white" />)}
      </div>
      <div className="h-96 animate-pulse rounded-2xl border bg-white" />
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-zinc-100" />)}
    </div>
  )
}

function EmptyChart({ label = 'Нет данных за период' }: { label?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center text-center text-sm text-zinc-400">
      <BarChart3 className="mb-2 h-7 w-7 text-zinc-300" />
      {label}
    </div>
  )
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })
    .format(new Date(`${value}T00:00:00Z`))
}

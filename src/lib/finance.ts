export type FinancePreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  maintenance: 'Техническое обслуживание',
  purchase: 'Покупка техники',
  salary: 'Зарплата',
  rent: 'Аренда помещения',
  tax: 'Налоги',
  marketing: 'Маркетинг',
  transport: 'Транспорт',
  other: 'Прочее',
}

export function addFinanceDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function getFinancePeriod(preset: FinancePreset, today: string) {
  const date = new Date(`${today}T00:00:00Z`)

  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') {
    const mondayOffset = (date.getUTCDay() + 6) % 7
    return { from: addFinanceDays(today, -mondayOffset), to: today }
  }
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
  if (preset === 'quarter') {
    const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3 + 1
    return {
      from: `${date.getUTCFullYear()}-${String(quarterMonth).padStart(2, '0')}-01`,
      to: today,
    }
  }
  if (preset === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  return { from: today, to: today }
}

export function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

export interface FinanceAnalytics {
  period: { from: string; to: string; timezone: string }
  kpi: {
    revenue: number
    expenses: number
    result: number
    debt: number
    billed: number
    average_check: number
    orders_count: number
  }
  previous: {
    revenue: number
    expenses: number
    result: number
    billed: number
    orders_count: number
  }
  series: { date: string; revenue: number; expenses: number; result: number }[]
  payment_methods: { name: string; value: number }[]
  payment_types: { name: string; value: number }[]
  equipment: {
    id: string
    name: string
    currency: 'UZS'
    rentals: number
    billed: number
    collected: number
    expenses: number
    result: number
    purchase_cost: number | null
  }[]
  team: {
    id: string
    full_name: string
    role: string
    orders_count: number
    orders_amount: number
    payments_amount: number
    clients_count: number
  }[]
  clients: {
    id: string
    full_name: string
    orders_count: number
    collected: number
  }[]
  debt: {
    total: number
    buckets: { name: string; value: number }[]
  }
  payments: {
    id: string
    order_id: string
    amount: number
    payment_method: string
    payment_type: string
    paid_at: string
    notes: string | null
    order_number: string
    client_name: string
    admin_name: string | null
  }[]
  expenses: {
    id: string
    category: string
    description: string
    amount: number
    expense_date: string
    payment_method: string
    equipment_id: string | null
    equipment_name: string | null
    admin_name: string | null
  }[]
  warnings: {
    non_uzs_equipment: { id: string; name: string; currency: string }[]
    clients_without_author: number
    unallocated_rental_amount: number
  }
}

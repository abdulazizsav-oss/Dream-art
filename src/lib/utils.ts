import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: 'UZS' | 'USD' = 'UZS'): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd.MM.yyyy', { locale: ru })
}

export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} — ${formatDate(end)}`
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ru })
}

export function calcDays(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1)
}

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  free: 'Свободна',
  rented: 'В аренде',
  maintenance: 'На ТО',
  lost: 'Утеряна',
}

export const EQUIPMENT_STATUS_COLORS: Record<string, string> = {
  free: 'bg-green-100 text-green-800',
  rented: 'bg-blue-100 text-blue-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
  lost: 'bg-red-100 text-red-800',
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  active: 'Активна',
  returned: 'Возвращена',
  overdue: 'Просрочена',
  cancelled: 'Отменена',
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-blue-100 text-blue-800',
  returned: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Наличные',
  transfer: 'Перевод',
  card: 'Карта',
}

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  rental: 'Аренда',
  deposit: 'Депозит',
  deposit_return: 'Возврат депозита',
  extra: 'Доп. оплата',
  fine: 'Штраф',
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  passport_id: 'Паспорт ID (биометрический)',
  passport_green: 'Паспорт зелёный',
  zagranpassport: 'Загранпаспорт',
  passport_cover: 'Паспорт с чехлом',
  drivers_license: 'Водительские права',
}

export const CLIENT_SEGMENT_LABELS: Record<string, string> = {
  photographer: 'Фотограф',
  videographer: 'Видеограф',
  studio: 'Студия',
  agency: 'Агентство',
  one_time: 'Разовый',
  other: 'Другое',
}

export const RELIABILITY_LABELS: Record<number, string> = {
  1: 'Ненадёжный',
  2: 'Сомнительный',
  3: 'Нейтральный',
  4: 'Надёжный',
  5: 'Отличный',
}

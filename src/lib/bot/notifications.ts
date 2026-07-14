import { bot } from './index'
import { formatCurrency, formatDate } from '@/lib/utils'

export function escapeTelegramHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char)
}

interface OrderForNotification {
  order_number: string
  start_date: string
  end_date: string
  total_amount: number
  fulfillment_method?: 'pickup' | 'delivery' | null
  delivery_address?: string | null
  delivery_fee?: number | null
  clients: {
    full_name: string
    telegram_chat_id: number | null
  } | null
  order_items?: {
    equipment: { name: string } | null
    days: number
    subtotal: number
  }[]
}

export async function sendOrderConfirmation(order: OrderForNotification) {
  const chatId = order.clients?.telegram_chat_id
  if (!chatId) return

  const items = order.order_items
    ?.map(i => `• ${escapeTelegramHtml(i.equipment?.name ?? 'Оборудование')} — ${escapeTelegramHtml(formatCurrency(i.subtotal))}`)
    .join('\n') ?? ''
  const isDelivery = order.fulfillment_method === 'delivery'
  const rawDeliveryFee = Number(order.delivery_fee ?? 0)
  const deliveryFee = isDelivery && Number.isFinite(rawDeliveryFee) ? Math.max(0, rawDeliveryFee) : 0
  const rentalAmount = order.order_items?.length
    ? order.order_items.reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0)
    : Math.max(0, Number(order.total_amount) - deliveryFee)
  const totalAmount = rentalAmount + deliveryFee
  const fulfillmentLines = [
    `Получение: <b>${isDelivery ? 'Доставка' : 'Самовывоз'}</b>`,
    ...(isDelivery && order.delivery_address
      ? [`Адрес: ${escapeTelegramHtml(order.delivery_address)}`]
      : []),
  ]

  const text = [
    `✅ <b>Заказ подтверждён</b>`,
    ``,
    `Номер: <code>${escapeTelegramHtml(order.order_number)}</code>`,
    `Период: ${escapeTelegramHtml(formatDate(order.start_date))} — ${escapeTelegramHtml(formatDate(order.end_date))}`,
    ...fulfillmentLines,
    ``,
    `<b>Техника:</b>`,
    items,
    ``,
    `Аренда: ${escapeTelegramHtml(formatCurrency(rentalAmount))}`,
    `Доставка: ${isDelivery
      ? (deliveryFee === 0 ? 'Бесплатно' : escapeTelegramHtml(formatCurrency(deliveryFee)))
      : '—'}`,
    `<b>Итого: ${escapeTelegramHtml(formatCurrency(totalAmount))}</b>`,
    ``,
    `Спасибо, что выбрали Dream Art! 🎥`,
  ].join('\n')

  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })
  console.log(`[BOT] Confirmation sent to ${chatId}`)
}

export async function sendReturnReminder(
  chatId: number,
  clientName: string,
  orderNumber: string,
  endDate: string,
  items: string[]
) {
  const text = [
    `⏰ <b>Напоминание о возврате</b>`,
    ``,
    `${escapeTelegramHtml(clientName)}, завтра истекает срок аренды по заказу <code>${escapeTelegramHtml(orderNumber)}</code>.`,
    ``,
    `Дата возврата: <b>${escapeTelegramHtml(formatDate(endDate))}</b>`,
    ``,
    `Техника:`,
    ...items.map(i => `• ${escapeTelegramHtml(i)}`),
    ``,
    `Пожалуйста, верните технику в офис вовремя.`,
    `По вопросам: свяжитесь с менеджером.`,
  ].join('\n')

  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })
}

export async function sendOverdueAlert(
  chatId: number,
  clientName: string,
  orderNumber: string,
  daysOverdue: number,
  amount: number | null
) {
  const fineLine = amount != null && amount > 0
    ? `Штраф за просрочку: <b>${escapeTelegramHtml(formatCurrency(amount))}</b>`
    : `Размер штрафа уточните у менеджера.`

  const text = [
    `🚨 <b>Просрочка возврата</b>`,
    ``,
    `${escapeTelegramHtml(clientName)}, ваш заказ <code>${escapeTelegramHtml(orderNumber)}</code> просрочен на ${escapeTelegramHtml(daysOverdue)} дн.`,
    ``,
    fineLine,
    ``,
    `Срочно свяжитесь с менеджером Dream Art!`,
  ].join('\n')

  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })
}

export async function sendPaymentReceipt(
  chatId: number,
  clientName: string,
  orderNumber: string,
  amount: number,
  method: string
) {
  const methodLabel: Record<string, string> = { cash: 'наличными', transfer: 'переводом', card: 'картой' }
  const text = [
    `💰 <b>Платёж получен</b>`,
    ``,
    `${escapeTelegramHtml(clientName)}, подтверждаем оплату:`,
    `Заказ: <code>${escapeTelegramHtml(orderNumber)}</code>`,
    `Сумма: <b>${escapeTelegramHtml(formatCurrency(amount))}</b>`,
    `Способ: ${escapeTelegramHtml(methodLabel[method] ?? method)}`,
    ``,
    `Спасибо!`,
  ].join('\n')

  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })
}

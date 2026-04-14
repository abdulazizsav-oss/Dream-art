import { bot } from './index'
import { formatCurrency, formatDate } from '@/lib/utils'

interface OrderForNotification {
  order_number: string
  start_date: string
  end_date: string
  total_amount: number
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
    ?.map(i => `• ${i.equipment?.name ?? 'Оборудование'} — ${formatCurrency(i.subtotal)}`)
    .join('\n') ?? ''

  const text = [
    `✅ *Заказ подтверждён*`,
    ``,
    `Номер: \`${order.order_number}\``,
    `Период: ${formatDate(order.start_date)} — ${formatDate(order.end_date)}`,
    ``,
    `*Техника:*`,
    items,
    ``,
    `*Итого: ${formatCurrency(order.total_amount)}*`,
    ``,
    `Спасибо, что выбрали Dream Art! 🎥`,
  ].join('\n')

  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' })
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
    `⏰ *Напоминание о возврате*`,
    ``,
    `${clientName}, завтра истекает срок аренды по заказу \`${orderNumber}\`.`,
    ``,
    `Дата возврата: *${formatDate(endDate)}*`,
    ``,
    `Техника:`,
    ...items.map(i => `• ${i}`),
    ``,
    `Пожалуйста, верните технику в офис вовремя.`,
    `По вопросам: свяжитесь с менеджером.`,
  ].join('\n')

  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' })
}

export async function sendOverdueAlert(
  chatId: number,
  clientName: string,
  orderNumber: string,
  daysOverdue: number,
  amount: number
) {
  const text = [
    `🚨 *Просрочка возврата*`,
    ``,
    `${clientName}, ваш заказ \`${orderNumber}\` просрочен на ${daysOverdue} дн.`,
    ``,
    `Штраф за просрочку: *${formatCurrency(amount)}*`,
    ``,
    `Срочно свяжитесь с менеджером Dream Art!`,
  ].join('\n')

  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' })
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
    `💰 *Платёж получен*`,
    ``,
    `${clientName}, подтверждаем оплату:`,
    `Заказ: \`${orderNumber}\``,
    `Сумма: *${formatCurrency(amount)}*`,
    `Способ: ${methodLabel[method] ?? method}`,
    ``,
    `Спасибо!`,
  ].join('\n')

  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' })
}

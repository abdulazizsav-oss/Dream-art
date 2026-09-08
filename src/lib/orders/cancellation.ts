import { z } from 'zod'

export const cancellationSchema = z.object({
  reason: z.string().trim().min(1, 'Укажите причину отмены').max(1000),
  all_returned: z.literal(true, { error: 'Подтвердите полный возврат техники и комплектов' }),
  items: z.array(z.object({
    id: z.string().uuid(), returned: z.boolean(),
    selected_kit_items: z.array(z.string()), missing_kit_items: z.array(z.string()),
  }).strict()).max(500),
}).strict()

export const cancellationRefundSchema = z.object({
  request_id: z.string().uuid(),
  amount: z.number().finite().positive().multipleOf(0.01),
  payment_type: z.enum(['refund', 'deposit_return']),
  payment_method: z.enum(['cash', 'card', 'transfer']),
}).strict()

type Payment = { amount: number; payment_type: string }
export function cancellationBalance(payments: Payment[]) {
  let rental = 0, deposit = 0, refunded = 0, depositReturned = 0
  for (const payment of payments) {
    const cents = Math.round(Number(payment.amount) * 100)
    if (['rental', 'extra', 'fine'].includes(payment.payment_type)) rental += cents
    if (payment.payment_type === 'deposit') deposit += cents
    if (payment.payment_type === 'refund') refunded += cents
    if (payment.payment_type === 'deposit_return') depositReturned += cents
  }
  return {
    rentalDue: Math.max(0, rental - refunded) / 100,
    depositDue: Math.max(0, deposit - depositReturned) / 100,
    refunded: (refunded + depositReturned) / 100,
  }
}
export function signedPaymentAmount(payment: Payment) {
  return ['refund', 'deposit_return'].includes(payment.payment_type) ? -Number(payment.amount) : Number(payment.amount)
}

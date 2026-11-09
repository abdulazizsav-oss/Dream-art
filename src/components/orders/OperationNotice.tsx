'use client'

import { Button } from '@/components/ui/button'

export function OperationNotice({ orderId, message, uncertain, onChecked }: {
  orderId: string
  message: string
  uncertain: boolean
  onChecked: () => void
}) {
  if (!message) return null
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p>{message}</p>
      {uncertain && <>
        <a className="inline-flex min-h-11 items-center font-medium underline" href={`/orders/${orderId}`} target="_blank" rel="noopener noreferrer">
          Открыть заказ для проверки ↗
        </a>
        <Button type="button" variant="outline" className="h-auto min-h-11 w-full whitespace-normal" onClick={onChecked}>
          Я проверил — операция не выполнена
        </Button>
      </>}
    </div>
  )
}

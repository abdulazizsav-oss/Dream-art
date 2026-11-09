'use client'

import { useState } from 'react'
import { PaymentForm } from '@/components/finance/PaymentForm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function OrderPaymentDialog({ order }: {
  order: { id: string; order_number: string; clients: { full_name: string } | null }
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>+ Добавить платёж</Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value) }}>
      <DialogContent showCloseButton={!pending} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pr-10">
          <DialogTitle>Оплата заказа {order.order_number}</DialogTitle>
          <DialogDescription>Укажите фактически полученную сумму и способ оплаты.</DialogDescription>
        </DialogHeader>
        <PaymentForm orders={[order]} defaultOrderId={order.id} onPendingChange={setPending} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  </>
}

'use client'

import { useState } from 'react'
import type { Client } from '@/types/database'
import { clientSchema, type ClientFormValues } from '@/lib/validations/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ClientForm } from './ClientForm'

export function EditClientDialog({ client, onSaved }: { client: Client; onSaved: (client: Client) => void }) {
  const [open, setOpen] = useState(false)
  const defaults = Object.fromEntries(Object.keys(clientSchema.shape).map(key => [
    key, client[key as keyof Client] ?? undefined,
  ])) as Partial<ClientFormValues>

  return (
    <>
      <Button type="button" variant="outline" className="min-h-12 bg-white" onClick={() => setOpen(true)}>Изменить клиента</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>Изменить клиента</DialogTitle>
          <DialogDescription>Исправления сохранятся в карточке клиента. Техника и даты заказа останутся в форме.</DialogDescription>
          <ClientForm key={client.id} clientId={client.id} defaultValues={defaults}
            onSaved={saved => { onSaved(saved); setOpen(false) }} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Выполняется по подтверждению; окно закрывается после завершения. */
  onConfirm: () => void | Promise<void>
}

/** Подтверждение необратимого действия в стиле CRM вместо системного окна браузера. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  // Текст остаётся прежним, пока окно закрывается, даже если родитель уже сбросил выбранную запись.
  const [shown, setShown] = useState({ title, description })
  if (open && (shown.title !== title || shown.description !== description)) setShown({ title, description })

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogTitle className="leading-snug">{shown.title}</DialogTitle>
        {shown.description && <DialogDescription>{shown.description}</DialogDescription>}
        <div className="flex gap-3">
          <Button type="button" className="h-12 flex-1" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" className="h-12 flex-1" variant="destructive" disabled={busy} onClick={handleConfirm}>
            {busy ? 'Подождите…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

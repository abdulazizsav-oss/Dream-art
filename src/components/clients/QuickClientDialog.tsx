'use client'

import { useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PotentialClientDuplicateWarning } from '@/components/clients/PotentialClientDuplicateWarning'
import { beginClientPhoneInput, finishClientPhoneInput, formatClientPhoneInput } from '@/lib/client-duplicates'
import { clientSchema } from '@/lib/validations/client'
import { DOCUMENT_TYPE_LABELS } from '@/lib/utils'
import type { Client, DocumentType } from '@/types/database'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Kept in the shared layout so opening a client never unmounts an order draft. */
export function QuickClientDialog({ open, onOpenChange }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [documentType, setDocumentType] = useState<DocumentType>('passport_id')
  const [telegram, setTelegram] = useState('')
  const [notes, setNotes] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const busy = useRef(false)
  const isOrderForm = pathname === '/orders/new'

  function resetForm() {
    setFullName('')
    setPhone('')
    setDocumentType('passport_id')
    setTelegram('')
    setNotes('')
    setExpanded(false)
    setError('')
    setFieldErrors({})
  }

  function complete(client: Client, created: boolean) {
    window.dispatchEvent(new CustomEvent<Client>('crm:client-created', { detail: client }))
    onOpenChange(false)
    resetForm()
    toast.success(created ? 'Клиент добавлен' : 'Выбран существующий клиент')
    if (!isOrderForm) {
      if (created) router.refresh()
      else router.push(`/clients/${client.id}`)
    }
  }

  async function useExisting(clientId: string) {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`)
      const client = await response.json()
      if (!response.ok || !client.id) throw new Error(typeof client.error === 'string' ? client.error : 'Не удалось открыть клиента')
      complete(client, false)
    } catch (caught) {
      setError(caught instanceof TypeError ? 'Нет связи. Попробуйте ещё раз.' : caught instanceof Error ? caught.message : 'Не удалось открыть клиента.')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    setError('')
    setFieldErrors({})
    const parsed = clientSchema.safeParse({
      full_name: fullName.trim(),
      phone: finishClientPhoneInput(phone),
      document_type: documentType,
      telegram_username: telegram.trim() || null,
      notes: notes.trim() || null,
    })
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] ??= issue.message
      setFieldErrors(nextErrors)
      const fieldName = nextErrors.full_name ? 'full_name' : 'phone'
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${fieldName}"]`)?.focus()
      return
    }

    busy.current = true
    setLoading(true)
    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const payload = await response.json()
      if (!response.ok || !payload.id) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Не удалось сохранить клиента. Проверьте данные.')
      }
      complete(payload, true)
    } catch (caught) {
      setError(caught instanceof TypeError ? 'Нет связи. Данные остались в форме, попробуйте ещё раз.' : caught instanceof Error ? caught.message : 'Не удалось сохранить клиента. Попробуйте ещё раз.')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!busy.current) onOpenChange(nextOpen) }}>
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-semibold">Новый клиент</DialogTitle>
              <DialogDescription className="mt-2 leading-relaxed">
                {isOrderForm ? 'Добавьте ФИО и телефон — клиент сразу появится в заказе.' : 'Для начала достаточно ФИО и телефона.'}
              </DialogDescription>
            </div>
            <button type="button" disabled={loading} onClick={() => onOpenChange(false)} aria-label="Закрыть форму клиента" className="-mr-2 -mt-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl text-zinc-500 hover:bg-zinc-100 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:opacity-40">×</button>
          </div>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <div className="space-y-2">
              <label htmlFor="quick-client-name" className="block text-sm font-medium">ФИО <span className="text-zinc-400">· обязательно</span></label>
              <Input id="quick-client-name" name="full_name" autoComplete="name" enterKeyHint="next" value={fullName} onChange={event => setFullName(event.target.value)} onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.form?.querySelector<HTMLInputElement>('[name="phone"]')?.focus()
                }
              }} disabled={loading} aria-invalid={!!fieldErrors.full_name} aria-describedby={fieldErrors.full_name ? 'quick-client-name-error' : undefined} placeholder="Как зовут клиента" className="min-h-[52px] rounded-xl text-base md:text-base" />
              {fieldErrors.full_name && <p id="quick-client-name-error" className="text-sm text-red-600">{fieldErrors.full_name}</p>}
            </div>
            <div className="space-y-2">
              <label htmlFor="quick-client-phone" className="block text-sm font-medium">Телефон <span className="text-zinc-400">· обязательно</span></label>
              <Input id="quick-client-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="done" value={phone} onChange={event => setPhone(formatClientPhoneInput(event.target.value))} onFocus={() => setPhone(beginClientPhoneInput(phone))} onBlur={event => setPhone(finishClientPhoneInput(event.target.value))} disabled={loading} aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone ? 'quick-client-phone-error' : 'quick-client-phone-hint'} placeholder="+998 50 718-04-00" className="min-h-[52px] rounded-xl text-base md:text-base" />
              {fieldErrors.phone ? <p id="quick-client-phone-error" className="text-sm text-red-600">{fieldErrors.phone}</p> : <p id="quick-client-phone-hint" className="text-xs text-zinc-500">Можно вставить номер без пробелов. Код +998 подставится автоматически.</p>}
            </div>

            <div className={loading ? 'pointer-events-none opacity-60' : undefined}>
              <PotentialClientDuplicateWarning fullName={fullName} phone={phone} onUseExistingId={useExisting} className="[&_button]:min-h-12 [&_button]:px-4 [&_button]:text-sm" />
            </div>

            <div className="rounded-xl border border-zinc-200">
              <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="quick-client-extra" className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-sm font-medium focus-visible:ring-4 focus-visible:ring-blue-200">
                <span>Документ, Telegram и заметка <span className="font-normal text-zinc-400">· необязательно</span></span>
                <span aria-hidden="true" className="text-xl text-zinc-500">{expanded ? '−' : '+'}</span>
              </button>
              {expanded && <div id="quick-client-extra" className="space-y-4 border-t p-4">
                <div className="space-y-2">
                  <label htmlFor="quick-client-document" className="block text-sm font-medium">Вид документа</label>
                  <select id="quick-client-document" value={documentType} onChange={event => setDocumentType(event.target.value as DocumentType)} disabled={loading} className="min-h-[52px] w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-base outline-none focus:ring-4 focus:ring-blue-100">
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="quick-client-telegram" className="block text-sm font-medium">Telegram</label>
                  <Input id="quick-client-telegram" autoCapitalize="none" autoCorrect="off" value={telegram} onChange={event => setTelegram(event.target.value)} disabled={loading} placeholder="@username" className="min-h-[52px] rounded-xl text-base md:text-base" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="quick-client-notes" className="block text-sm font-medium">Заметка</label>
                  <Textarea id="quick-client-notes" value={notes} onChange={event => setNotes(event.target.value)} disabled={loading} rows={3} placeholder="Что важно знать о клиенте" className="rounded-xl text-base md:text-base" />
                </div>
                <p className="text-xs text-zinc-500">Остальные сведения можно заполнить позже в карточке клиента.</p>
              </div>}
            </div>
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>
          <div className="flex shrink-0 gap-3 border-t bg-zinc-50 px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)} className="min-h-[52px] rounded-xl px-4">Отмена</Button>
            <Button type="submit" disabled={loading} className="min-h-[52px] flex-1 rounded-xl px-4 text-base">{loading ? 'Сохранение…' : isOrderForm ? 'Добавить в заказ' : 'Создать клиента'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { orderSchema, type OrderFormValues } from '@/lib/validations/order'
import type { Client, Equipment, EquipmentCategory } from '@/types/database'
import { StepClient, type TrustedPersonData } from './StepClient'
import { StepEquipment } from './StepEquipment'
import { RentalOptions } from './RentalOptions'
import { StepSummary } from './StepSummary'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn, formatCurrency, getTashkentDate } from '@/lib/utils'
import { recalculateOrderItems } from '@/lib/rental'
import { calculateDeliveryFee } from '@/lib/delivery'
import { getRecipientMissingFields, resolveOrderContact, restoreOrderContact } from '@/lib/orders/recipient'
import { decodeOrderDraft, encodeOrderDraft, orderDraftKey } from '@/lib/orders/draft'

interface OrderFormProps {
  clients: Client[]
  equipment: (Equipment & { equipment_categories: EquipmentCategory | null })[]
  draftOwnerId?: string
}

function emptyValues(): Partial<OrderFormValues> {
  const today = getTashkentDate()
  return { items: [], start_date: today, end_date: today, deposit_amount: 0, delivery_to_client: false, delivery_from_client: false }
}
const EMPTY_RECIPIENT: TrustedPersonData = { name: '', phone: '', relation: '', doc_type: 'passport_id' }

export function OrderForm({ clients: initialClients, equipment, draftOwnerId }: OrderFormProps) {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1>(0)
  const [allClients, setAllClients] = useState<Client[]>(initialClients)
  const [values, setValues] = useState<Partial<OrderFormValues>>(emptyValues)
  const [trustedPerson, setTrustedPerson] = useState<TrustedPersonData>(EMPTY_RECIPIENT)
  const [clientStepReady, setClientStepReady] = useState(false)
  const [externalClientRevision, setExternalClientRevision] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [draftNotice, setDraftNotice] = useState('')
  const [requestUncertain, setRequestUncertain] = useState(false)
  const submitLock = useRef(false)
  const completed = useRef(false)
  const initialData = useRef({ clients: initialClients, equipment })
  const storageKey = draftOwnerId ? orderDraftKey(draftOwnerId) : null

  useEffect(() => {
    if (storageKey) {
      try {
        const draft = decodeOrderDraft(sessionStorage.getItem(storageKey), new Set(initialData.current.clients.map(c => c.id)), new Set(initialData.current.equipment.filter(e => e.currency === 'UZS').map(e => e.id)))
        if (draft) {
          setValues({ ...draft.values, items: recalculateOrderItems(draft.values.items, initialData.current.equipment, draft.values) })
          const contact = restoreOrderContact(draft.recipient, initialData.current.clients.find(client => client.id === draft.values.client_id))
          setTrustedPerson(contact)
          setStep(draft.values.client_id && getRecipientMissingFields(contact).length === 0 ? draft.step : 0)
          setDraftNotice('Восстановлен черновик. Проверьте даты и комплект перед выдачей.')
          if (draft.submission !== 'editing') {
            setRequestUncertain(true)
            setConfirmOpen(true)
            setDraftNotice('Предыдущая отправка не подтверждена. Проверьте список заказов, прежде чем отправлять повторно.')
          }
        } else sessionStorage.removeItem(storageKey)
      } catch { setDraftNotice('Браузер не разрешил сохранять черновик. Не закрывайте эту вкладку.') }
    }
    setDraftReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!draftReady || !storageKey || completed.current) return
    try {
      if (values.client_id || values.items?.length) sessionStorage.setItem(storageKey, encodeOrderDraft(values, trustedPerson, step, Date.now(), requestUncertain ? 'uncertain' : submitting ? 'submitting' : 'editing'))
      else sessionStorage.removeItem(storageKey)
    } catch { setDraftNotice('Черновик не сохранён: хранилище браузера недоступно. Не закрывайте вкладку.') }
  }, [draftReady, storageKey, values, trustedPerson, step, requestUncertain, submitting])

  useEffect(() => {
    function receiveClient(event: Event) {
      const client = (event as CustomEvent<Client>).detail
      if (!client?.id || !client.full_name) return
      setAllClients(previous => previous.some(item => item.id === client.id)
        ? previous.map(item => item.id === client.id ? { ...item, ...client } : item) : [...previous, client])
      setValues(previous => ({ ...previous, client_id: client.id }))
      setTrustedPerson(resolveOrderContact(client))
      setStep(0)
      window.scrollTo({ top: 0, behavior: 'instant' })
      // An explicit selection in the global dialog also closes any older
      // inline search/create UI, without resetting the order or equipment.
      setExternalClientRevision(previous => previous + 1)
    }
    window.addEventListener('crm:client-created', receiveClient)
    return () => window.removeEventListener('crm:client-created', receiveClient)
  }, [])

  function update(patch: Partial<OrderFormValues>) {
    setValues(previous => {
      const next = { ...previous, ...patch }
      if ('items' in patch || 'start_date' in patch || 'end_date' in patch) next.items = recalculateOrderItems(next.items ?? [], equipment, next)
      return next
    })
  }
  function goTo(nextStep: 0 | 1) {
    setStep(nextStep)
    if (nextStep === 0) window.scrollTo({ top: 0, behavior: 'instant' })
  }

  useEffect(() => {
    if (step === 1) document.getElementById('order-workspace')?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [step])

  const selectedClient = allClients.find(client => client.id === values.client_id)
  const clientReady = !!selectedClient && getRecipientMissingFields(trustedPerson).length === 0 && (step === 1 || clientStepReady)
  const items = values.items ?? []
  const total = items.reduce((sum, item) => sum + item.subtotal, 0) + calculateDeliveryFee({ delivery_to_client: values.delivery_to_client ?? false, delivery_from_client: values.delivery_from_client ?? false })
  const parsedOrder = orderSchema.safeParse(values)
  const formReady = clientReady && parsedOrder.success

  function clearDraft() {
    setValues(emptyValues())
    setTrustedPerson(EMPTY_RECIPIENT)
    setDraftNotice('')
    setRequestUncertain(false)
    setDiscardOpen(false)
    goTo(0)
  }

  async function submit() {
    if (submitLock.current || requestUncertain) return
    if (!formReady || !parsedOrder.success) {
      toast.error(!clientReady ? 'Проверьте клиента и дополнительный контакт' : parsedOrder.error?.issues[0]?.message ?? 'Проверьте заказ')
      return
    }
    submitLock.current = true
    // Persist before POST, so closing/reloading during a request cannot silently
    // remove the duplicate warning when that request may already have succeeded.
    try { if (storageKey) sessionStorage.setItem(storageKey, encodeOrderDraft(values, trustedPerson, step, Date.now(), 'submitting')) } catch { /* The visible storage warning remains. */ }
    setSubmitting(true)
    const payload = {
      ...parsedOrder.data,
      trusted_person: [trustedPerson.name, trustedPerson.relation ? `(${trustedPerson.relation})` : null, trustedPerson.phone].filter(Boolean).join(' '),
      trusted_person_doc_type: trustedPerson.doc_type,
      items: recalculateOrderItems(items, equipment, values),
    }
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (response.status >= 500) throw new Error('uncertain')
      const result = await response.json()
      if (!response.ok) { toast.error(result.error ?? 'Не удалось создать заказ. Проверьте данные.'); return }
      if (!result.id) throw new Error('uncertain')
      completed.current = true
      try { if (storageKey) sessionStorage.removeItem(storageKey) } catch { /* The order is already saved. */ }
      toast.success(`Заказ ${result.order_number} создан`)
      router.push(`/orders/${result.id}`)
      router.refresh()
    } catch {
      setRequestUncertain(true)
      toast.error('Нет подтверждения от сервера. Проверьте список заказов перед повторной отправкой.')
    } finally {
      if (!completed.current) { submitLock.current = false; setSubmitting(false) }
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Этапы оформления" className="flex gap-2">
          {['Клиент', 'Техника и оформление'].map((label, index) => (
            <button key={label} type="button" disabled={index === 1 && !clientReady} aria-current={step === index ? 'step' : undefined}
              onClick={() => goTo(index as 0 | 1)}
              className={cn('flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-medium disabled:opacity-45', step === index ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600')}>
              <span aria-hidden="true">{index + 1}.</span>{label}
            </button>
          ))}
        </nav>
        {(values.client_id || items.length > 0) && <Button variant="ghost" className="min-h-11 text-sm" onClick={() => setDiscardOpen(true)}>Очистить черновик</Button>}
      </div>
      {draftNotice && <p role="status" className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{draftNotice}</p>}
      {step === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 md:p-5">
          <StepClient key={externalClientRevision} clients={allClients} selectedClientId={values.client_id} trustedPerson={trustedPerson}
            onSelect={clientId => update({ client_id: clientId })} onTrustedPersonChange={setTrustedPerson}
            onClientCreated={client => setAllClients(previous => previous.some(item => item.id === client.id) ? previous : [...previous, client])}
            onReadyChange={setClientStepReady} hideNavigation onNext={() => goTo(1)} />
        </div>
      ) : (
        <>
          <div id="order-workspace" className="grid scroll-mt-24 gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2 lg:flex-col lg:items-start lg:justify-center lg:gap-1">
            <div className="min-w-0"><p className="truncate font-medium">{selectedClient?.full_name}</p><p className="text-sm text-zinc-500">Доп. контакт: {trustedPerson.name}</p></div>
            <Button variant="outline" className="h-12 shrink-0" onClick={() => goTo(0)}>Изменить</Button>
          </div>
          <RentalOptions values={values} onUpdate={update} />
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 md:p-5">
            <StepEquipment equipment={equipment} startDate={values.start_date} endDate={values.end_date} selectedItems={items}
              onUpdate={nextItems => update({ items: nextItems })} hideNavigation onNext={() => setConfirmOpen(true)} onBack={() => goTo(0)} />
          </div>
        </>
      )}
      <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom,0px))] z-20 rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_-4px_18px_-8px_rgba(0,0,0,0.18)] xl:bottom-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {step === 0 ? <><p className="text-sm font-medium">{selectedClient ? 'Клиент выбран' : 'Выберите клиента'}</p><p className="mt-0.5 text-xs text-zinc-500">{clientReady ? 'Далее — выбор техники' : selectedClient ? 'Заполните дополнительный контакт' : 'Найдите по имени или телефону'}</p></>
              : <button type="button" className="min-h-11 text-left" onClick={() => document.getElementById('order-equipment-cart')?.scrollIntoView({ behavior: 'instant', block: 'start' })}><span className="block text-xs text-zinc-500">Корзина · {items.length} ед. · предварительно</span><span className="block font-semibold tabular-nums sm:text-lg">{formatCurrency(total)}</span></button>}
          </div>
          <Button className="h-13 shrink-0 px-5 text-base" disabled={step === 0 ? !clientReady : !formReady} onClick={() => step === 0 ? goTo(1) : setConfirmOpen(true)}>
            {step === 0 ? 'Выбрать технику →' : 'Проверить заказ →'}
          </Button>
        </div>
        {step === 1 && !formReady && <p role="status" className="mt-1 text-xs text-zinc-600">{!clientReady ? 'Проверьте дополнительный контакт на первом этапе.' : parsedOrder.error?.issues[0]?.message}</p>}
        {draftReady && storageKey && (values.client_id || items.length > 0) && !draftNotice && <p className="mt-1 text-[11px] text-zinc-500">Черновик сохраняется в этой вкладке на 12 часов</p>}
      </div>
      <Dialog open={confirmOpen} onOpenChange={open => { if (!submitting) setConfirmOpen(open) }}>
        <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="border-b p-4"><DialogTitle className="text-lg">Проверьте перед выдачей</DialogTitle><DialogDescription className="mt-1">Заказ сохранится только после нажатия «Создать заказ».</DialogDescription></div>
          <div className="max-h-[calc(100dvh-240px)] overflow-y-auto overscroll-contain p-4">
            {parsedOrder.success ? <StepSummary values={parsedOrder.data} clients={allClients} equipment={equipment} trustedPerson={trustedPerson} onBack={() => setConfirmOpen(false)} onSubmit={submit} submitting={submitting} hideNavigation />
              : <p role="status" className="text-sm text-zinc-600">Черновик сохранён. Для расчёта заполните даты и проверьте данные заказа.</p>}
            {requestUncertain && <div role="alert" className="mt-4 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p>Сервер не подтвердил результат. Чтобы не создать дубль, сначала проверьте список заказов.</p>
              <a className="inline-flex min-h-11 items-center underline" href="/orders" target="_blank" rel="noreferrer">Открыть заказы в новой вкладке</a>
              <Button className="min-h-12 whitespace-normal text-sm" variant="outline" onClick={() => setRequestUncertain(false)}>Я проверил — заказ не создан</Button>
            </div>}
          </div>
          <div className="flex gap-3 border-t bg-white p-4">
            <Button variant="outline" className="h-13 text-base" disabled={submitting} onClick={() => setConfirmOpen(false)}>Изменить</Button>
            <Button className="h-13 flex-1 text-base" disabled={submitting || requestUncertain || !formReady} onClick={submit}>{submitting ? 'Создание…' : 'Создать заказ'}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogTitle>Очистить текущий черновик?</DialogTitle>
          <DialogDescription>Выбранная техника и введённые данные заказа будут убраны. Карточка клиента останется в базе.</DialogDescription>
          <div className="flex gap-3"><Button className="h-12 flex-1" variant="outline" onClick={() => setDiscardOpen(false)}>Оставить</Button><Button className="h-12 flex-1" onClick={clearDraft}>Очистить</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

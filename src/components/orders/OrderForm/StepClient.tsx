'use client'

import { useEffect, useMemo, useState } from 'react'
import { Client } from '@/types/database'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CLIENT_SEGMENT_LABELS, DOCUMENT_TYPE_LABELS, cn } from '@/lib/utils'
import { Search, UserPlus, ChevronRight, FileText, UserCheck, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { PotentialClientDuplicateWarning } from '@/components/clients/PotentialClientDuplicateWarning'
import { ClientOrderAlerts } from '@/components/orders/ClientOrderAlerts'
import {
  beginClientPhoneInput, clientMatchesSearch, finishClientPhoneInput,
  formatClientPhoneInput, normalizeClientPhone,
} from '@/lib/client-duplicates'
import {
  getRecipientMissingFields, resolveOrderContact, type TrustedPersonData,
} from '@/lib/orders/recipient'

export type { TrustedPersonData } from '@/lib/orders/recipient'

interface StepClientProps {
  clients: Client[]
  selectedClientId?: string
  trustedPerson: TrustedPersonData
  onSelect: (clientId: string) => void
  onTrustedPersonChange: (tp: TrustedPersonData) => void
  onClientCreated: (client: Client) => void
  onNext: () => void
  hideNavigation?: boolean
  onReadyChange?: (ready: boolean) => void
}

export function StepClient({
  clients, selectedClientId, trustedPerson, onSelect,
  onTrustedPersonChange, onClientCreated, onNext, hideNavigation = false, onReadyChange,
}: StepClientProps) {
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [changingClient, setChangingClient] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newAdditionalPhone, setNewAdditionalPhone] = useState('')
  const [newBirthDate, setNewBirthDate] = useState('')
  const selectedClient = clients.find(client => client.id === selectedClientId)
  const filtered = useMemo(() => clients.filter(client => clientMatchesSearch(client, search)), [clients, search])

  function handleSelectClient(client: Client) {
    const recipient = resolveOrderContact(client)
    onSelect(client.id)
    onTrustedPersonChange(recipient)
    setChangingClient(false)
    setShowCreate(false)
    setSearch('')
  }

  async function handleCreateClient() {
    if (creating) return
    if (!newName.trim()) { toast.error('Введите ФИО'); return }
    if (normalizeClientPhone(newPhone).length < 9) { toast.error('Укажите номер телефона полностью'); return }
    if (newAdditionalPhone.trim() && normalizeClientPhone(newAdditionalPhone).length < 9) {
      toast.error('Укажите дополнительный номер полностью или оставьте его пустым')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newName.trim(),
          phone: finishClientPhoneInput(newPhone),
          trusted_person_phone: finishClientPhoneInput(newAdditionalPhone) || null,
          birth_date: newBirthDate || null,
        }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(typeof result?.error === 'string' ? result.error : 'Ошибка создания клиента')
        return
      }
      if (!result?.id || !result?.full_name) {
        toast.error('Не удалось подтвердить сохранение. Проверьте список клиентов перед повторной попыткой.')
        return
      }
      const client: Client = result
      onClientCreated(client)
      handleSelectClient(client)
      setNewName('')
      setNewPhone('')
      setNewAdditionalPhone('')
      setNewBirthDate('')
      toast.success('Клиент выбран — можно переходить к технике')
    } catch {
      toast.error('Не удалось получить ответ. Данные сохранены в форме; перед повтором проверьте, не появился ли клиент в списке.')
    } finally {
      setCreating(false)
    }
  }

  const missingFields = getRecipientMissingFields(trustedPerson)
  const canProceed = !!selectedClient && !missingFields.length && !showCreate && !changingClient
  const showClientSearch = !selectedClient || changingClient
  useEffect(() => { onReadyChange?.(canProceed) }, [canProceed, onReadyChange])

  const recipientFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="order-recipient-name">ФИО дополнительного контакта *</Label>
        <Input
          id="order-recipient-name" value={trustedPerson.name}
          onChange={event => onTrustedPersonChange({ ...trustedPerson, name: event.target.value })}
          placeholder="Имя и фамилия" className="min-h-[52px] text-base md:text-base" autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="order-recipient-phone" className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-zinc-400" /> Дополнительный телефон *
        </Label>
        <Input
          id="order-recipient-phone" type="tel" inputMode="tel" value={trustedPerson.phone}
          onChange={event => onTrustedPersonChange({ ...trustedPerson, phone: formatClientPhoneInput(event.target.value) })}
          onFocus={() => onTrustedPersonChange({ ...trustedPerson, phone: beginClientPhoneInput(trustedPerson.phone) })}
          onBlur={event => onTrustedPersonChange({ ...trustedPerson, phone: finishClientPhoneInput(event.target.value) })}
          placeholder="+998 90 123-45-67" className="min-h-[52px] text-base md:text-base" autoComplete="off"
        />
      </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="order-recipient-relation">Кем приходится клиенту <span className="font-normal text-zinc-400">· необязательно</span></Label>
          <Input
            id="order-recipient-relation" value={trustedPerson.relation}
            onChange={event => onTrustedPersonChange({ ...trustedPerson, relation: event.target.value })}
            placeholder="Коллега, родственник…" className="min-h-[52px] text-base md:text-base"
          />
        </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-label="Клиент заказа">
        {selectedClient && !changingClient && !showCreate ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">Клиент выбран</p>
              <h2 className="break-words text-lg font-semibold text-zinc-900">{selectedClient.full_name}</h2>
              <p className="mt-0.5 text-sm text-zinc-600">{formatClientPhoneInput(selectedClient.phone)}</p>
            </div>
            <Button type="button" variant="outline" className="min-h-[48px] bg-white px-4" onClick={() => setChangingClient(true)}>
              Выбрать другого
            </Button>
          </div>
        ) : !showCreate && (
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Найдите клиента</h2>
            {selectedClient && <Button type="button" variant="ghost" className="min-h-[48px]" onClick={() => setChangingClient(false)}>Отмена выбора</Button>}
          </div>
        )}

        {showClientSearch && !showCreate && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                <Input
                  aria-label="Поиск клиента по имени или телефону" className="min-h-[52px] pl-12 text-base md:text-base"
                  placeholder="Имя или телефон клиента" value={search} onChange={event => setSearch(event.target.value)} autoComplete="off"
                />
              </div>
              <Button type="button" variant="outline" className="min-h-[52px] shrink-0 px-4" onClick={() => setShowCreate(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Новый клиент
              </Button>
            </div>
            <p className="text-xs text-zinc-500">Кириллица и латиница; телефон с кодом страны или без него.</p>
            <div className="max-h-[280px] space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 p-1">
              {filtered.slice(0, 40).map(client => (
                <button
                  key={client.id} type="button" onClick={() => handleSelectClient(client)}
                  className={cn(
                    'flex min-h-[64px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-500',
                    selectedClientId === client.id ? 'bg-blue-50' : 'hover:bg-zinc-50 active:bg-zinc-100',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-zinc-900">{client.full_name}</span>
                    <span className="mt-0.5 block text-sm text-zinc-500">
                      {[formatClientPhoneInput(client.phone), client.telegram_username && `@${client.telegram_username}`, CLIENT_SEGMENT_LABELS[client.segment]].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
                </button>
              ))}
              {!filtered.length && <p className="px-3 py-7 text-center text-sm text-zinc-500">Клиент не найден. Можно создать нового.</p>}
              {filtered.length > 40 && <p className="px-3 py-3 text-sm text-zinc-500">Показаны первые 40. Введите имя или телефон, чтобы уточнить поиск.</p>}
            </div>
          </>
        )}

        {showCreate && (
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <div>
              <h3 className="flex items-center gap-2 font-semibold"><UserPlus className="h-5 w-5 text-blue-600" /> Новый клиент</h3>
              <p className="mt-1 text-sm text-zinc-500">Для начала — ФИО и телефон. Остальное можно заполнить позже.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-order-client-name">ФИО *</Label>
                <Input id="quick-order-client-name" value={newName} onChange={event => setNewName(event.target.value)} placeholder="Имя и фамилия клиента" className="min-h-[52px] text-base md:text-base" autoComplete="name" autoFocus disabled={creating} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-order-client-phone">Телефон *</Label>
                <Input
                  id="quick-order-client-phone" type="tel" inputMode="tel" value={newPhone}
                  onChange={event => setNewPhone(formatClientPhoneInput(event.target.value))}
                  onFocus={() => setNewPhone(beginClientPhoneInput(newPhone))}
                  onBlur={event => setNewPhone(finishClientPhoneInput(event.target.value))}
                  placeholder="+998 90 123-45-67" className="min-h-[52px] text-base md:text-base" autoComplete="tel" disabled={creating}
                />
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200">
              <p className="px-3 py-3 text-sm font-medium">Дополнительные данные</p>
              <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="quick-order-client-additional-phone">Дополнительный номер</Label>
                  <Input
                    id="quick-order-client-additional-phone" type="tel" inputMode="tel" value={newAdditionalPhone}
                    onChange={event => setNewAdditionalPhone(formatClientPhoneInput(event.target.value))}
                    onFocus={() => setNewAdditionalPhone(beginClientPhoneInput(newAdditionalPhone))}
                    onBlur={event => setNewAdditionalPhone(finishClientPhoneInput(event.target.value))}
                    placeholder="+998 90 123-45-67" className="min-h-[52px] text-base md:text-base" disabled={creating}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quick-order-client-birthday">Дата рождения</Label>
                  <Input id="quick-order-client-birthday" type="date" value={newBirthDate} onChange={event => setNewBirthDate(event.target.value)} className="min-h-[52px] text-base md:text-base" disabled={creating} />
                </div>
              </div>
            </div>
            <PotentialClientDuplicateWarning
              fullName={newName} phone={newPhone} candidates={clients}
              onUseExistingId={clientId => {
                if (creating) return
                const existing = clients.find(client => client.id === clientId)
                if (existing) handleSelectClient(existing)
                else toast.error('Клиент найден, но его нет в текущем списке')
              }}
            />
            <div className="flex gap-3 border-t border-zinc-100 pt-4">
              <Button type="button" onClick={handleCreateClient} disabled={creating || !newName.trim() || normalizeClientPhone(newPhone).length < 9} className="min-h-[52px] flex-1">
                {creating ? 'Сохраняем…' : 'Добавить и выбрать'}
              </Button>
              <Button type="button" variant="outline" className="min-h-[52px] px-5" disabled={creating} onClick={() => setShowCreate(false)}>Отмена</Button>
            </div>
          </div>
        )}
      </section>

      {selectedClient && !changingClient && !showCreate && (
        <section className="space-y-4" aria-label="Дополнительный контакт">
          <ClientOrderAlerts clientId={selectedClient.id} />
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <div>
              <h3 className="flex items-center gap-2 font-semibold"><UserCheck className="h-5 w-5 text-blue-600" /> Дополнительный контакт / доверенное лицо</h3>
              <p className="mt-1 text-sm text-zinc-500">Укажите дополнительный номер для связи и документ при выдаче.</p>
            </div>
            {selectedClient.trusted_person_name && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">Дополнительный контакт взят из карточки клиента. Проверьте данные.</p>}
            {recipientFields}
            <div className="space-y-1.5">
              <Label htmlFor="order-recipient-document" className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-zinc-400" /> Документ при выдаче *</Label>
              <Select value={trustedPerson.doc_type || ''} onValueChange={value => onTrustedPersonChange({ ...trustedPerson, doc_type: value })}>
                <SelectTrigger id="order-recipient-document" className={cn('min-h-[52px] w-full text-base md:text-base', !trustedPerson.doc_type && 'border-amber-300')}>
                  <SelectValue>{DOCUMENT_TYPE_LABELS[trustedPerson.doc_type] ?? 'Выберите документ'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key} className="min-h-[48px] text-base md:text-base">{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      )}
      {!showCreate && !changingClient && (
        <div className="space-y-2">
          {selectedClient && missingFields.length > 0 && <p id="recipient-required-hint" className="text-sm text-amber-700" role="status">Для продолжения укажите: {missingFields.join(', ')}.</p>}
          {!hideNavigation && (
            <Button type="button" onClick={onNext} disabled={!canProceed} aria-describedby={selectedClient && missingFields.length ? 'recipient-required-hint' : undefined} className="min-h-[56px] w-full text-base md:text-base">
              {selectedClient ? 'К выбору техники' : 'Сначала выберите клиента'}<ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

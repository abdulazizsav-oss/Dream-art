'use client'

import { useState } from 'react'
import { Client } from '@/types/database'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CLIENT_SEGMENT_LABELS, DOCUMENT_TYPE_LABELS, cn } from '@/lib/utils'
import { Search, UserPlus, ChevronRight, FileText, UserCheck, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { PotentialClientDuplicateWarning } from '@/components/clients/PotentialClientDuplicateWarning'
import { ClientOrderAlerts } from '@/components/orders/ClientOrderAlerts'

export interface TrustedPersonData {
  name: string
  phone: string
  relation: string
  doc_type: string
}

interface StepClientProps {
  clients: Client[]
  selectedClientId?: string
  trustedPerson: TrustedPersonData
  onSelect: (clientId: string) => void
  onTrustedPersonChange: (tp: TrustedPersonData) => void
  onClientCreated: (client: Client) => void
  onNext: () => void
}

export function StepClient({
  clients,
  selectedClientId,
  trustedPerson,
  onSelect,
  onTrustedPersonChange,
  onClientCreated,
  onNext,
}: StepClientProps) {
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  // Быстрое создание клиента во время оформления заказа
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newAdditionalPhone, setNewAdditionalPhone] = useState('')
  const [newBirthDate, setNewBirthDate] = useState('')

  const selectedClient = clients.find(c => c.id === selectedClientId) as (Client & {
    trusted_person_name?: string | null
    trusted_person_phone?: string | null
    trusted_person_relation?: string | null
  }) | undefined

  const filtered = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.telegram_username?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreateClient() {
    if (!newName.trim()) { toast.error('Введите ФИО'); return }
    if (!newPhone.trim()) { toast.error('Укажите номер телефона'); return }

    setCreating(true)
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: newName.trim(),
        phone: newPhone.trim(),
        trusted_person_phone: newAdditionalPhone.trim() || null,
        birth_date: newBirthDate || null,
      }),
    })
    if (!res.ok) {
      toast.error('Ошибка создания клиента')
      setCreating(false)
      return
    }
    const client: Client = await res.json()
    toast.success('Клиент добавлен')
    onClientCreated(client)
    onSelect(client.id)
    onTrustedPersonChange({
      ...trustedPerson,
      name: client.full_name,
      phone: newAdditionalPhone.trim(),
    })
    setShowCreate(false)
    setNewName('')
    setNewPhone('')
    setNewAdditionalPhone('')
    setNewBirthDate('')
    setCreating(false)
  }

  function handleSelectClient(client: Client & {
    trusted_person_name?: string | null
    trusted_person_phone?: string | null
    trusted_person_relation?: string | null
  }) {
    onSelect(client.id)
    // Подставляем доверенное лицо из карточки клиента
    onTrustedPersonChange({
      name: client.trusted_person_name ?? client.full_name,
      phone: client.trusted_person_phone ?? '',
      relation: client.trusted_person_relation ?? '',
      doc_type: trustedPerson.doc_type || 'passport_id',
    })
  }

  // Телефон доверенного лица обязателен — без него нельзя идти дальше.
  const canProceed = !!selectedClientId
    && !!trustedPerson.name.trim()
    && !!trustedPerson.phone.trim()
    && !!trustedPerson.doc_type

  return (
    <div className="space-y-6">

      {/* ── Выбор клиента ── */}
      <div>
        <h2 className="font-semibold text-lg mb-4">Выберите клиента</h2>

        {!showCreate ? (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-9 min-h-[44px]"
                placeholder="Поиск по имени, телефону или @telegram"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="space-y-1 max-h-56 overflow-y-auto rounded-lg">
              {filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectClient(c as any)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors',
                    selectedClientId === c.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50 border border-transparent'
                  )}
                >
                  <p className="font-medium">{c.full_name}</p>
                  <p className="text-xs text-gray-400">
                    {[c.phone, c.telegram_username && `@${c.telegram_username}`, CLIENT_SEGMENT_LABELS[c.segment]]
                      .filter(Boolean).join(' · ')}
                  </p>
                </button>
              ))}
              {!filtered.length && (
                <p className="text-gray-400 text-sm text-center py-6">Клиент не найден</p>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full mt-3 min-h-[44px]"
              onClick={() => setShowCreate(true)}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Создать нового клиента
            </Button>
          </>
        ) : (
          /* ── Быстрое создание клиента ── */
          <div className="rounded-2xl border bg-white p-4 space-y-4">
            <div>
              <h3 className="font-medium text-zinc-800 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-500" /> Новый клиент
              </h3>
              <p className="mt-1 text-xs text-gray-400">
                Остальные данные можно добавить позже в карточке клиента
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>ФИО *</Label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                  className="min-h-[44px]"
                  autoComplete="name"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Телефон *</Label>
                  <Input
                    type="tel"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="+998 90 123-45-67"
                    className={cn('min-h-[44px]', !newPhone.trim() && newName.trim() ? 'border-orange-300' : '')}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Дополнительный номер</Label>
                  <Input
                    type="tel"
                    value={newAdditionalPhone}
                    onChange={e => setNewAdditionalPhone(e.target.value)}
                    placeholder="Запасной контакт"
                    className="min-h-[44px]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Дата рождения</Label>
                <Input
                  type="date"
                  value={newBirthDate}
                  onChange={e => setNewBirthDate(e.target.value)}
                  className="min-h-[44px] sm:max-w-[calc(50%-0.375rem)]"
                />
              </div>
              <PotentialClientDuplicateWarning
                fullName={newName}
                phone={newPhone}
                onUseExistingId={clientId => {
                  const existing = clients.find(client => client.id === clientId)
                  if (!existing) {
                    toast.error('Клиент найден, но его нет в текущем списке')
                    return
                  }
                  handleSelectClient(existing)
                  setShowCreate(false)
                }}
              />
            </div>

            <div className="flex gap-2 pt-2 border-t sticky bottom-0 bg-white -mx-4 -mb-4 px-4 pb-4">
              <Button
                type="button"
                onClick={handleCreateClient}
                disabled={creating || !newName.trim() || !newPhone.trim()}
                className="flex-1 min-h-[44px]"
              >
                {creating ? 'Добавляем...' : 'Добавить клиента'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setShowCreate(false)}
              >
                Отмена
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Доверенное лицо (после выбора клиента) ── */}
      {selectedClientId && (
        <div className="border-t pt-5 space-y-4">
          <ClientOrderAlerts clientId={selectedClientId} />
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-500" />
              Доверенное лицо
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Кто физически забирает технику и какой документ оставляет
            </p>
          </div>

          {/* Подсказка из карточки клиента */}
          {selectedClient?.trusted_person_name && (
            <div className="bg-blue-50 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-blue-700">
              <UserCheck className="w-4 h-4 flex-shrink-0" />
              <span>
                Из карточки: <strong>{selectedClient.trusted_person_name}</strong>
                {selectedClient.trusted_person_relation && ` (${selectedClient.trusted_person_relation})`}
                {selectedClient.trusted_person_phone && ` · ${selectedClient.trusted_person_phone}`}
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ФИО *</Label>
              <Input
                value={trustedPerson.name}
                onChange={e => onTrustedPersonChange({ ...trustedPerson, name: e.target.value })}
                placeholder="Иванов Пётр Иванович"
                className="min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-gray-400" /> Телефон *
                </Label>
                <Input
                  value={trustedPerson.phone}
                  onChange={e => onTrustedPersonChange({ ...trustedPerson, phone: e.target.value })}
                  placeholder="+998 90 000-00-00"
                  className={cn('min-h-[44px]', trustedPerson.name.trim() && !trustedPerson.phone.trim() ? 'border-orange-300' : '')}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Кто это?</Label>
                <Input
                  value={trustedPerson.relation}
                  onChange={e => onTrustedPersonChange({ ...trustedPerson, relation: e.target.value })}
                  placeholder="Брат, жена, коллега..."
                  className="min-h-[44px]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" /> Документ *
              </Label>
              <Select
                value={trustedPerson.doc_type || 'passport_id'}
                onValueChange={v => onTrustedPersonChange({ ...trustedPerson, doc_type: v })}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue>
                    {DOCUMENT_TYPE_LABELS[trustedPerson.doc_type] ?? 'Выберите документ'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* ── Кнопка Далее ── */}
      <Button
        type="button"
        onClick={onNext}
        disabled={!canProceed}
        className="w-full min-h-[48px]"
      >
        Далее — выбор техники
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  )
}

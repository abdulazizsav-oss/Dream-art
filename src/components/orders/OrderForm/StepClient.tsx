'use client'

import { useState } from 'react'
import { Client } from '@/types/database'
import { Input } from '@/components/ui/input'
import { CLIENT_SEGMENT_LABELS, cn } from '@/lib/utils'
import { Search } from 'lucide-react'

interface StepClientProps {
  clients: Client[]
  selectedClientId?: string
  onSelect: (id: string) => void
}

export function StepClient({ clients, selectedClientId, onSelect }: StepClientProps) {
  const [search, setSearch] = useState('')
  const filtered = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.telegram_username?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Выберите клиента</h2>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Поиск по имени, телефону или @telegram"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {filtered.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
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
          <p className="text-gray-400 text-sm text-center py-8">Клиент не найден</p>
        )}
      </div>
    </div>
  )
}

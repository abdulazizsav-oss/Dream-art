'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { clientMatchesSearch, formatClientPhoneInput } from '@/lib/client-duplicates'
import type { Client } from '@/types/database'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { formatCurrency, CLIENT_SEGMENT_LABELS } from '@/lib/utils'
import { Plus, Users, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildMissingKitByClient,
  formatMissingKitPreview,
  formatMissingKitAge,
  formatMissingSinceDateTime,
  type MissingKitEventRow,
} from '@/lib/missing-kit'

// ── Reliability helpers ─────────────────────────────────────────────────────

const RELIABILITY_CONFIG: Record<number, { bg: string; text: string; label: string; dot: string }> = {
  1: { bg: 'bg-red-50',    text: 'text-red-600',    label: '1 / 5 — Ненадёжный',      dot: 'bg-red-500' },
  2: { bg: 'bg-orange-50', text: 'text-orange-600',  label: '2 / 5 — Проблемный',      dot: 'bg-orange-400' },
  3: { bg: 'bg-yellow-50', text: 'text-yellow-700',  label: '3 / 5 — Средний',         dot: 'bg-yellow-400' },
  4: { bg: 'bg-emerald-50',text: 'text-emerald-700', label: '4 / 5 — Хороший',         dot: 'bg-emerald-400' },
  5: { bg: 'bg-green-50',  text: 'text-green-700',   label: '5 / 5 — Отличный',        dot: 'bg-green-500' },
}

const STARS = [1, 2, 3, 4, 5]

function ReliabilityBadge({ rating }: { rating: number }) {
  const r = Math.max(1, Math.min(5, Math.round(rating)))
  const cfg = RELIABILITY_CONFIG[r]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', cfg.bg, cfg.text)}
      title={cfg.label}
    >
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
      {STARS.map(s => (
        <span key={s} className={cn('text-[11px]', s <= r ? 'opacity-100' : 'opacity-20')}>★</span>
      ))}
    </span>
  )
}

// ── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
]

function getAvatarColor(name: string) {
  const code = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

function ClientAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  if (photoUrl) {
    return (
      <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div className={cn(
      'w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0',
      getAvatarColor(name)
    )}>
      {initials || '?'}
    </div>
  )
}

// ── Profile completeness ─────────────────────────────────────────────────────

function missingFields(c: { telegram_username: string | null; address_actual: string | null; passport_number: string | null }) {
  const missing = []
  if (!c.telegram_username) missing.push('Telegram')
  if (!c.address_actual) missing.push('Адрес')
  if (!c.passport_number) missing.push('Паспорт')
  return missing
}

export function ClientsExplorer({ clients, missingEventRows }: { clients: Client[]; missingEventRows: MissingKitEventRow[] }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => clients.filter(client => clientMatchesSearch(client, search)), [clients, search])
  const missingByClient = buildMissingKitByClient(missingEventRows)
  return (
    <div>
      <PageHeader
        title="Клиенты"
        description={`${clients.length} клиентов`}
        action={
          <Link href="/clients/new">
            <Button className="min-h-[44px]">
              <Plus className="w-4 h-4 mr-2" />Добавить
            </Button>
          </Link>
        }
      />

      <div className="mb-4 space-y-2">
        <Input type="search" aria-label="Поиск клиентов" placeholder="Имя, телефон или Telegram" value={search} onChange={event => setSearch(event.target.value)} className="min-h-12 bg-white text-base" />
        <p role="status" className="text-sm text-zinc-500">Найдено: {filtered.length}</p>
      </div>
      {filtered.length ? (
        <div className="bg-white rounded-2xl border divide-y overflow-hidden">
          {filtered.map(c => {
            const missing = missingFields(c)
            const missingKit = missingByClient.get(c.id)
            const oldestMissing = missingKit?.orders
              .flatMap(order => order.items.flatMap(item => item.missing))
              .sort((a, b) => b.age_days - a.age_days)[0]
            const segment = CLIENT_SEGMENT_LABELS[c.segment] ?? c.segment
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex items-center gap-4 px-4 py-3.5 hover:bg-blue-50/40 transition-colors min-h-[72px] group"
              >
                {/* Avatar */}
                <ClientAvatar
                  name={c.full_name}
                  photoUrl={c.photo_url ?? null}
                />

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900 group-hover:text-blue-700 transition-colors">
                    {c.full_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    {c.phone && (
                      <span className="text-xs text-gray-500">{formatClientPhoneInput(c.phone)}</span>
                    )}
                    {c.telegram_username && (
                      <span className="text-xs text-blue-500">@{c.telegram_username.replace(/^@+/, '')}</span>
                    )}
                    <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full text-[11px]">
                      {segment}
                    </span>
                  </div>
                  {/* Missing fields warning */}
                  {missing.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-zinc-400">
                        Не заполнено: {missing.join(', ')}
                      </span>
                    </div>
                  )}
                  {missingKit && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 text-orange-500 flex-shrink-0" />
                      <span className="text-[11px] font-medium text-orange-600">
                        Недосдача: {formatMissingKitPreview(missingKit.names)}
                        {oldestMissing ? ` · с ${formatMissingSinceDateTime(oldestMissing.missing_since)} · ${formatMissingKitAge(oldestMissing.missing_since)}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <ReliabilityBadge rating={c.reliability_rating} />
                  {missingKit && (
                    <span className="text-xs text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                      Недосдача: {missingKit.total}
                    </span>
                  )}
                  {c.deposit_held > 0 && (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      Депозит: {formatCurrency(c.deposit_held)}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{search.trim() ? 'Клиенты не найдены. Попробуйте другое имя или номер.' : 'Клиенты не добавлены'}</p>
          <Link href="/clients/new" className="mt-3 inline-block">
            <Button size="sm">Добавить клиента</Button>
          </Link>
        </div>
      )}
    </div>
  )
}

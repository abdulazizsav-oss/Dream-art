'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, LoaderCircle, UserRoundCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PotentialDuplicateClient {
  id: string
  full_name: string
  phone: string | null
  birth_date?: string | null
  reason: 'exact_phone' | 'exact_name' | 'similar_name'
}

interface Props {
  fullName: string
  phone: string
  excludeClientId?: string
  onUseExistingId?: (clientId: string) => void
  className?: string
}

const reasonLabel = {
  exact_phone: 'Совпадает телефон',
  exact_name: 'Совпадает ФИО',
  similar_name: 'Похожее ФИО',
} as const

export function PotentialClientDuplicateWarning({
  fullName,
  phone,
  excludeClientId,
  onUseExistingId,
  className,
}: Props) {
  const [matches, setMatches] = useState<PotentialDuplicateClient[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const phoneDigits = phone.replace(/\D/g, '')
    if (fullName.trim().length < 3 && phoneDigits.length < 9) {
      setMatches([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ full_name: fullName, phone })
        if (excludeClientId) params.set('exclude_id', excludeClientId)
        const response = await fetch(`/api/clients/duplicates?${params}`, { signal: controller.signal })
        if (!response.ok) {
          setMatches([])
          return
        }
        const payload = await response.json() as { matches?: PotentialDuplicateClient[] }
        setMatches(payload.matches ?? [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setMatches([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [excludeClientId, fullName, phone])

  if (loading && matches.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Проверяем существующих клиентов…
      </p>
    )
  }
  if (matches.length === 0) return null

  return (
    <aside className={cn('rounded-xl border border-amber-200 bg-amber-50 p-3', className)} aria-live="polite">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">Возможно, такой клиент уже есть</p>
          <p className="mt-0.5 text-xs text-amber-800">
            Проверьте совпадение перед созданием новой карточки. Это предупреждение не блокирует работу.
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {matches.map(client => (
          <div key={client.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-2.5 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{client.full_name}</p>
              <p className="text-[11px] text-zinc-500">
                {[client.phone, client.birth_date, reasonLabel[client.reason]].filter(Boolean).join(' · ')}
              </p>
            </div>
            {onUseExistingId ? (
              <button
                type="button"
                onClick={() => onUseExistingId(client.id)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-amber-300 px-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                <UserRoundCheck className="h-3.5 w-3.5" /> Выбрать
              </button>
            ) : (
              <Link
                href={`/clients/${client.id}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-amber-300 px-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Открыть <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}

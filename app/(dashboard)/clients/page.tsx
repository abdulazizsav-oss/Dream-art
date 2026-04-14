import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ReliabilityRating } from '@/components/clients/ReliabilityRating'
import { formatCurrency, CLIENT_SEGMENT_LABELS } from '@/lib/utils'
import { Plus, Users } from 'lucide-react'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('full_name')

  return (
    <div>
      <PageHeader
        title="Клиенты"
        description={`${clients?.length ?? 0} клиентов`}
        action={
          <Link href="/clients/new">
            <Button><Plus className="w-4 h-4 mr-2" />Добавить</Button>
          </Link>
        }
      />

      {clients?.length ? (
        <div className="bg-white rounded-xl border divide-y">
          {clients.map(c => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm text-gray-900">{c.full_name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                  {c.telegram_username && (
                    <span className="text-xs text-blue-500">@{c.telegram_username}</span>
                  )}
                  <span className="text-xs text-gray-400">
                    {CLIENT_SEGMENT_LABELS[c.segment]}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                {c.deposit_held > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Депозит: {formatCurrency(c.deposit_held)}
                  </span>
                )}
                <ReliabilityRating rating={c.reliability_rating} readonly />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Клиенты не добавлены</p>
          <Link href="/clients/new" className="mt-3 inline-block">
            <Button size="sm">Добавить первого клиента</Button>
          </Link>
        </div>
      )}
    </div>
  )
}

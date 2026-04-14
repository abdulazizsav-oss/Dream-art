import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/equipment/StatusBadge'
import { formatCurrency } from '@/lib/utils'
import { Plus, Wrench } from 'lucide-react'

export default async function EquipmentPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase.from('equipment_categories').select('*').order('name')
  const { data: equipment } = await supabase
    .from('equipment')
    .select('*, equipment_categories(name)')
    .order('name')

  const grouped = categories?.map(cat => ({
    ...cat,
    items: equipment?.filter(e => e.category_id === cat.id) ?? [],
  })) ?? []

  const uncategorized = equipment?.filter(e => !e.category_id) ?? []

  return (
    <div>
      <PageHeader
        title="Техника"
        description={`${equipment?.length ?? 0} единиц в базе`}
        action={
          <Link href="/equipment/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Добавить
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
        {grouped.map(cat => cat.items.length > 0 && (
          <div key={cat.id}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {cat.name}
            </h2>
            <div className="bg-white rounded-xl border divide-y">
              {cat.items.map(item => (
                <EquipmentRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}

        {uncategorized.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Без категории
            </h2>
            <div className="bg-white rounded-xl border divide-y">
              {uncategorized.map(item => (
                <EquipmentRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {!equipment?.length && (
          <div className="bg-white rounded-xl border p-12 text-center">
            <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Техника не добавлена</p>
            <Link href="/equipment/new" className="mt-3 inline-block">
              <Button size="sm">Добавить первую единицу</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function EquipmentRow({ item }: { item: { id: string; name: string; serial_number: string | null; daily_rate: number; status: string } }) {
  return (
    <Link
      href={`/equipment/${item.id}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{item.name}</p>
          {item.serial_number && (
            <p className="text-xs text-gray-400">S/N: {item.serial_number}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="text-sm text-gray-600">{formatCurrency(item.daily_rate)}/день</span>
        <StatusBadge status={item.status} />
      </div>
    </Link>
  )
}

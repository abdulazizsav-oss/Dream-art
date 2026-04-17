import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { EquipmentForm } from '@/components/equipment/EquipmentForm'

export default async function NewEquipmentPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: brands }] = await Promise.all([
    supabase.from('equipment_categories').select('*').order('sort_order').order('name'),
    supabase.from('brands').select('id, name, logo_url').order('sort_order').order('name'),
  ])

  return (
    <div>
      <PageHeader title="Добавить технику" description="Новая позиция каталога" />
      <div className="bg-white rounded-2xl border p-6">
        <EquipmentForm categories={categories ?? []} brands={brands ?? []} />
      </div>
    </div>
  )
}

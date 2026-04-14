import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { EquipmentForm } from '@/components/equipment/EquipmentForm'

export default async function NewEquipmentPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase.from('equipment_categories').select('*').order('name')

  return (
    <div>
      <PageHeader title="Добавить технику" description="Новая единица инвентаря" />
      <div className="bg-white rounded-xl border p-6">
        <EquipmentForm categories={categories ?? []} />
      </div>
    </div>
  )
}

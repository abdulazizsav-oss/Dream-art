import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { OrderForm } from '@/components/orders/OrderForm'
import { getMyProfile } from '@/lib/supabase/getRole'

export default async function NewOrderPage() {
  const supabase = await createClient()

  const clientsPromise = supabase.from('clients').select('*').order('full_name')
  const equipmentPromise = supabase
    .from('equipment')
    .select('*, equipment_categories!inner(*)')
    .eq('equipment_categories.is_active', true)
    .order('sort_order')
    .order('name')

  const [{ data: clients }, equipmentResult, profile] = await Promise.all([clientsPromise, equipmentPromise, getMyProfile()])
  let equipment = equipmentResult.data

  if (equipmentResult.error) {
    const fallback = await supabase
      .from('equipment')
      .select('*, equipment_categories(*)')
      .order('name')
    equipment = fallback.data
  }

  return (
    <div>
      <PageHeader title="Новый заказ" description="Клиент → техника и оформление" />
      <OrderForm draftOwnerId={profile?.id} clients={clients ?? []} equipment={(equipment ?? []) as Parameters<typeof OrderForm>[0]['equipment']} />
    </div>
  )
}

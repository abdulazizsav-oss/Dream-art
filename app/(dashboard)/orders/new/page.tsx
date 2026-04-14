import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { OrderForm } from '@/components/orders/OrderForm'

export default async function NewOrderPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: equipment }] = await Promise.all([
    supabase.from('clients').select('*').order('full_name'),
    supabase.from('equipment').select('*, equipment_categories(*)').order('name'),
  ])

  return (
    <div>
      <PageHeader title="Новый заказ" description="Создание аренды" />
      <OrderForm clients={clients ?? []} equipment={(equipment ?? []) as Parameters<typeof OrderForm>[0]['equipment']} />
    </div>
  )
}

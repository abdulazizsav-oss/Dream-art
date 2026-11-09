import { createClient } from '@/lib/supabase/server'
import { OrdersExplorer } from '@/components/orders/OrdersExplorer'
import { loadOrderList } from '@/lib/orders/load-list'
import { isSuperAdmin } from '@/lib/supabase/getRole'

export default async function OrdersPage() {
  const supabase = await createClient()
  const showFinancialSummary = await isSuperAdmin()
  const normalizedOrders = await loadOrderList(supabase)

  return (
    <OrdersExplorer
      orders={normalizedOrders}
      totalCount={normalizedOrders.length}
      showFinancialSummary={showFinancialSummary}
    />
  )
}

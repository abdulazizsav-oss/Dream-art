import { createClient } from '@/lib/supabase/server'
import { ClientsExplorer } from '@/components/clients/ClientsExplorer'
import { buildLegacyMissingKitEvents, mergeMissingKitEvents, type LegacyMissingKitOrderRow, type MissingKitEventRow } from '@/lib/missing-kit'

export default async function ClientsPage() {
  const supabase = await createClient()
  const clientsPromise = supabase
    .from('clients')
    .select('*')
    .order('full_name')

  const missingEventsPromise = supabase
    .from('order_item_missing_kit_events')
    .select('id, order_id, order_item_id, kit_name, missing_since, returned_at, orders!inner(id, order_number, client_id, status, created_at), order_items(id, equipment(name))')
    .is('returned_at', null)
    .order('missing_since', { ascending: false })

  const legacyMissingOrdersPromise = supabase
    .from('orders')
    .select('id, order_number, client_id, status, created_at, updated_at, actual_end_at, actual_return_date, order_items(id, actual_end_at, missing_kit_items, equipment(name))')
    .order('created_at', { ascending: false })

  const [{ data: clients }, { data: missingEvents }, { data: legacyMissingOrders }] = await Promise.all([
    clientsPromise,
    missingEventsPromise,
    legacyMissingOrdersPromise,
  ])
  const missingEventRows = mergeMissingKitEvents(
    (missingEvents ?? []) as unknown as MissingKitEventRow[],
    buildLegacyMissingKitEvents((legacyMissingOrders ?? []) as unknown as LegacyMissingKitOrderRow[]),
  )
  return <ClientsExplorer clients={clients ?? []} missingEventRows={missingEventRows} />
}

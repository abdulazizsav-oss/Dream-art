import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { BrandsManager } from './BrandsManager'

export default async function BrandsPage() {
  const supabase = await createClient()
  const { data: brands } = await supabase
    .from('brands')
    .select('*')
    .order('sort_order')
    .order('name')

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Бренды" description="Список брендов для техники" />
      <BrandsManager initialBrands={brands ?? []} />
    </div>
  )
}

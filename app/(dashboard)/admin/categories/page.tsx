import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { CategoriesManager } from './CategoriesManager'

export default async function CategoriesPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('equipment_categories')
    .select('*')
    .order('sort_order')
    .order('name')

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Категории" description="Управление категориями техники" />
      <CategoriesManager initialCategories={categories ?? []} />
    </div>
  )
}

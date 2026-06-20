import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { CatalogCategoryGrid, CatalogEquipmentGrid } from '@/components/equipment/CatalogSortableGrid'
import { Plus, Wrench, Settings } from 'lucide-react'

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; brand?: string }>
}) {
  const { category: catId, brand: brandId } = await searchParams
  const supabase = await createClient()

  const [{ data: categories }] = await Promise.all([
    supabase.from('equipment_categories').select('*').order('sort_order').order('name'),
  ])

  if (!catId) {
    return (
      <div>
        <PageHeader
          title="Каталог техники"
          description="Категории и каталожные позиции"
          action={
            <div className="flex gap-2">
              <Link href="/admin/categories">
                <Button variant="outline" className="min-h-[44px]">
                  <Settings className="w-4 h-4 mr-1.5" />Категории
                </Button>
              </Link>
              <Link href="/equipment/new">
                <Button className="min-h-[44px] px-5">
                  <Plus className="w-4 h-4 mr-2" />Добавить
                </Button>
              </Link>
            </div>
          }
        />
        {(categories?.length ?? 0) === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center">
            <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Категорий нет</p>
            <Link href="/admin/categories" className="mt-3 inline-block">
              <Button size="sm" variant="outline">Добавить категорию →</Button>
            </Link>
          </div>
        ) : (
          <CatalogCategoryGrid categories={(categories ?? []).map(cat => ({
            id: cat.id,
            name: cat.name,
            photo_url: (cat as any).photo_url ?? null,
            sort_order: (cat as any).sort_order ?? 0,
          }))} />
        )}
      </div>
    )
  }

  const currentCat = (categories ?? []).find(c => c.id === catId)

  const { data: brandsInCat } = await supabase
    .from('equipment')
    .select('brand_id, brands(id, name)')
    .eq('category_id', catId)
    .not('brand_id', 'is', null)

  const uniqueBrands = Array.from(
    new Map(
      (brandsInCat ?? [])
        .map(e => (e.brands as { id: string; name: string } | null))
        .filter(Boolean)
        .map(b => [b!.id, b!])
    ).values()
  )

  let query = supabase
    .from('equipment')
    .select('*, brands(id, name, logo_url)')
    .eq('category_id', catId)
    .order('sort_order')
    .order('name')

  if (brandId) query = query.eq('brand_id', brandId)
  const { data: equipment } = await query

  return (
    <div>
      <PageHeader
        title={currentCat?.name ?? 'Техника'}
        description={`${equipment?.length ?? 0} позиций`}
        action={
          <div className="flex gap-2">
            <Link href="/equipment">
              <Button variant="outline" className="min-h-[44px]">← Категории</Button>
            </Link>
            <Link href="/equipment/new">
              <Button className="min-h-[44px] px-5">
                <Plus className="w-4 h-4 mr-2" />Добавить
              </Button>
            </Link>
          </div>
        }
      />

      {uniqueBrands.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <Link href={`/equipment?category=${catId}`}>
            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              !brandId ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>Все</span>
          </Link>
          {uniqueBrands.map(brand => (
            <Link key={brand.id} href={`/equipment?category=${catId}&brand=${brand.id}`}>
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                brandId === brand.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}>{brand.name}</span>
            </Link>
          ))}
        </div>
      )}

      {(equipment?.length ?? 0) === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{brandId ? 'Нет позиций этого бренда' : 'В этой категории нет техники'}</p>
        </div>
      ) : (
        <CatalogEquipmentGrid
          categoryId={catId}
          canReorder={!brandId}
          equipment={equipment!.map(item => ({
            id: item.id,
            name: item.name,
            photo_url: item.photo_url,
            specs: (item as any).specs ?? null,
            daily_rate: item.daily_rate,
            day_rate: (item as any).day_rate ?? null,
            night_rate: (item as any).night_rate ?? null,
            day_night: (item as any).day_night ?? null,
            currency: item.currency,
            sort_order: (item as any).sort_order ?? 0,
            brands: ((item as any).brands as { name: string; logo_url: string | null } | null) ?? null,
          }))}
        />
      )}
    </div>
  )
}

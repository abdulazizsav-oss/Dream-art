import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, Wrench, ChevronRight, Camera, Boxes, Settings, Pencil } from 'lucide-react'

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
    const { data: equipment } = await supabase.from('equipment').select('category_id, status')
    const countsByCategory = (categories ?? []).map(cat => ({
      ...cat,
      total: equipment?.filter(e => e.category_id === cat.id).length ?? 0,
      free:  equipment?.filter(e => e.category_id === cat.id && e.status === 'free').length ?? 0,
    }))

    return (
      <div>
        <PageHeader
          title="Каталог техники"
          description={`${equipment?.length ?? 0} позиций`}
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
        {countsByCategory.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center">
            <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Категорий нет</p>
            <Link href="/admin/categories" className="mt-3 inline-block">
              <Button size="sm" variant="outline">Добавить категорию →</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {countsByCategory.map((cat, i) => (
              <Link
                key={cat.id}
                href={`/equipment?category=${cat.id}`}
                className="group bg-white rounded-2xl border hover:border-blue-300 hover:shadow-md transition-all overflow-hidden"
              >
                <div className="h-32 bg-gray-50 relative overflow-hidden flex items-center justify-center">
                  {(cat as any).photo_url ? (
                    <img src={(cat as any).photo_url} alt={cat.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <Boxes className="w-10 h-10 text-gray-200 group-hover:text-gray-300 transition-colors" />
                  )}
                  <span className="absolute top-2 right-2 text-[10px] font-mono text-gray-300 bg-white/80 px-1.5 rounded">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Link
                    href="/admin/categories"
                    onClick={e => e.stopPropagation()}
                    className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white rounded-lg p-1.5 shadow-sm"
                  >
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                  </Link>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-gray-900 truncate">{cat.name}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-sm text-gray-400">{cat.total} ед.</p>
                    <span className="text-xs text-green-600 font-medium">{cat.free} своб.</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipment!.map(item => {
            const brand = (item as any).brands as { name: string; logo_url: string | null } | null
            return (
              <Link
                key={item.id}
                href={`/equipment/${item.id}`}
                className="group bg-white rounded-2xl border hover:border-blue-300 hover:shadow-md transition-all overflow-hidden"
              >
                <div className="h-44 bg-gray-50 flex items-center justify-center overflow-hidden relative">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <Camera className="w-12 h-12 text-gray-200" />
                  )}
                  {brand?.logo_url && (
                    <img src={brand.logo_url} alt={brand.name} className="absolute top-2 left-2 w-8 h-8 object-contain bg-white/90 rounded-lg p-1 shadow-sm" />
                  )}
                </div>
                <div className="p-4">
                  {brand && !brand.logo_url && (
                    <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">{brand.name}</p>
                  )}
                  <p className="font-semibold text-gray-900 leading-snug">{item.name}</p>
                  {(item as any).specs && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{(item as any).specs}</p>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <span className="text-sm font-medium text-gray-800">
                      {formatCurrency(item.daily_rate)}<span className="text-gray-400 font-normal">/день</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

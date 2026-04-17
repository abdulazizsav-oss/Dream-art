'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'

interface Brand { id: string; name: string; logo_url: string | null; sort_order: number }

export function BrandsManager({ initialBrands }: { initialBrands: Brand[] }) {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>(initialBrands)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  function startEdit(brand: Brand) {
    setEditingId(brand.id)
    setName(brand.name)
    setLogoUrl(brand.logo_url)
    setSortOrder(brand.sort_order)
    setShowForm(false)
  }

  function resetForm() {
    setName(''); setLogoUrl(null); setSortOrder(0)
    setEditingId(null); setShowForm(false)
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Введите название'); return }
    setSaving(true)
    const isEdit = !!editingId
    const url = isEdit ? `/api/brands/${editingId}` : '/api/brands'
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), logo_url: logoUrl, sort_order: sortOrder }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Ошибка'); setSaving(false); return }

    if (isEdit) {
      setBrands(b => b.map(x => x.id === editingId ? data : x))
      toast.success('Бренд обновлён')
    } else {
      setBrands(b => [...b, data])
      toast.success('Бренд добавлен')
    }
    resetForm()
    setSaving(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить бренд? Техника останется, но без привязки к бренду.')) return
    const res = await fetch(`/api/brands/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setBrands(b => b.filter(x => x.id !== id))
      toast.success('Бренд удалён')
    } else { toast.error('Ошибка удаления') }
  }

  const isFormOpen = showForm || !!editingId

  return (
    <div className="space-y-4">
      {/* List */}
      <div className="bg-white rounded-2xl border divide-y">
        {brands.map(brand => (
          <div key={brand.id}>
            {editingId === brand.id ? (
              /* Inline edit row */
              <div className="p-4 space-y-3">
                <div className="flex gap-3 items-start">
                  <ImageUpload
                    bucket="brand-logos"
                    value={logoUrl}
                    onChange={setLogoUrl}
                    aspectRatio="square"
                    className="w-20 flex-shrink-0"
                  />
                  <div className="flex-1 space-y-2">
                    <Input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Название бренда"
                      className="min-h-[44px]"
                      autoFocus
                    />
                    <Input
                      type="number"
                      value={sortOrder}
                      onChange={e => setSortOrder(Number(e.target.value))}
                      placeholder="Порядок (0, 1, 2...)"
                      className="min-h-[44px] w-32"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
                    <Check className="w-4 h-4 mr-1" />
                    {saving ? 'Сохраняем...' : 'Сохранить'}
                  </Button>
                  <Button variant="outline" onClick={resetForm} className="min-h-[44px]">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-3.5">
                {brand.logo_url ? (
                  <img src={brand.logo_url} alt={brand.name} className="w-10 h-10 object-contain rounded-lg border bg-white" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-400">
                    {brand.name[0]}
                  </div>
                )}
                <p className="flex-1 font-medium text-sm">{brand.name}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(brand)} className="min-h-[40px] min-w-[40px]">
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(brand.id)} className="min-h-[40px] min-w-[40px]">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {brands.length === 0 && (
          <p className="text-center py-10 text-gray-400 text-sm">Брендов ещё нет</p>
        )}
      </div>

      {/* Add form */}
      {showForm && !editingId ? (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <h3 className="font-semibold">Новый бренд</h3>
          <div className="flex gap-4 items-start">
            <ImageUpload
              bucket="brand-logos"
              value={logoUrl}
              onChange={setLogoUrl}
              aspectRatio="square"
              className="w-24 flex-shrink-0"
            />
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label>Название *</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Sony, Canon, DJI..."
                  className="min-h-[44px]"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Порядок сортировки</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={e => setSortOrder(Number(e.target.value))}
                  placeholder="0"
                  className="min-h-[44px] w-32"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
              {saving ? 'Добавляем...' : 'Добавить бренд'}
            </Button>
            <Button variant="outline" onClick={resetForm} className="min-h-[44px]">Отмена</Button>
          </div>
        </div>
      ) : !editingId ? (
        <Button variant="outline" className="w-full min-h-[48px]" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Добавить бренд
        </Button>
      ) : null}
    </div>
  )
}

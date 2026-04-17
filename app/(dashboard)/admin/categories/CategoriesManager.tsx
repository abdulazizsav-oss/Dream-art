'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { Plus, Pencil, Trash2, Check, X, Eye, EyeOff } from 'lucide-react'

interface Category {
  id: string; name: string; photo_url: string | null
  sort_order: number; is_active: boolean
}

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  function startEdit(cat: Category) {
    setEditingId(cat.id); setName(cat.name)
    setPhotoUrl(cat.photo_url); setSortOrder(cat.sort_order); setIsActive(cat.is_active)
    setShowForm(false)
  }

  function resetForm() {
    setName(''); setPhotoUrl(null); setSortOrder(0); setIsActive(true)
    setEditingId(null); setShowForm(false)
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Введите название'); return }
    setSaving(true)
    const isEdit = !!editingId
    const url = isEdit ? `/api/categories/${editingId}` : '/api/categories'
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), photo_url: photoUrl, sort_order: sortOrder, is_active: isActive }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Ошибка'); setSaving(false); return }

    if (isEdit) {
      setCategories(c => c.map(x => x.id === editingId ? data : x))
      toast.success('Категория обновлена')
    } else {
      setCategories(c => [...c, data])
      toast.success('Категория добавлена')
    }
    resetForm(); setSaving(false); router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить категорию? Техника останется без категории.')) return
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    if (res.ok) { setCategories(c => c.filter(x => x.id !== id)); toast.success('Удалено') }
    else toast.error('Ошибка удаления')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map(cat => (
          editingId === cat.id ? (
            <div key={cat.id} className="bg-white rounded-2xl border p-4 space-y-3 col-span-full">
              <div className="flex gap-4 items-start">
                <ImageUpload
                  bucket="category-photos"
                  value={photoUrl}
                  onChange={setPhotoUrl}
                  aspectRatio="landscape"
                  className="w-40 flex-shrink-0"
                />
                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <Label>Название *</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} className="min-h-[44px]" autoFocus />
                  </div>
                  <div className="flex gap-3">
                    <div className="space-y-1.5">
                      <Label>Порядок</Label>
                      <Input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} className="min-h-[44px] w-24" />
                    </div>
                    <div className="space-y-1.5 flex flex-col justify-end">
                      <Button
                        type="button"
                        variant={isActive ? 'default' : 'outline'}
                        className="min-h-[44px]"
                        onClick={() => setIsActive(!isActive)}
                      >
                        {isActive ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
                        {isActive ? 'Активна' : 'Скрыта'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
                  <Check className="w-4 h-4 mr-1" />{saving ? 'Сохраняем...' : 'Сохранить'}
                </Button>
                <Button variant="outline" onClick={resetForm} className="min-h-[44px]"><X className="w-4 h-4" /></Button>
              </div>
            </div>
          ) : (
            <div key={cat.id} className={`bg-white rounded-2xl border overflow-hidden ${!cat.is_active ? 'opacity-50' : ''}`}>
              <div className="h-32 bg-gray-50 relative overflow-hidden">
                {cat.photo_url ? (
                  <img src={cat.photo_url} alt={cat.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-200 text-4xl font-bold">
                    {cat.name[0]}
                  </div>
                )}
                {!cat.is_active && (
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> Скрыта
                  </div>
                )}
              </div>
              <div className="p-4 flex items-center justify-between gap-2">
                <p className="font-semibold truncate">{cat.name}</p>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(cat)} className="min-h-[40px] min-w-[40px]">
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(cat.id)} className="min-h-[40px] min-w-[40px]">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              </div>
            </div>
          )
        ))}
      </div>

      {showForm && !editingId ? (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <h3 className="font-semibold">Новая категория</h3>
          <div className="flex gap-4 items-start">
            <ImageUpload
              bucket="category-photos"
              value={photoUrl}
              onChange={setPhotoUrl}
              aspectRatio="landscape"
              className="w-48 flex-shrink-0"
            />
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label>Название *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Камеры, Объективы..." className="min-h-[44px]" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Порядок сортировки</Label>
                <Input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} placeholder="0" className="min-h-[44px] w-32" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
              {saving ? 'Добавляем...' : 'Добавить категорию'}
            </Button>
            <Button variant="outline" onClick={resetForm} className="min-h-[44px]">Отмена</Button>
          </div>
        </div>
      ) : !editingId ? (
        <Button variant="outline" className="w-full min-h-[48px]" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Добавить категорию
        </Button>
      ) : null}
    </div>
  )
}

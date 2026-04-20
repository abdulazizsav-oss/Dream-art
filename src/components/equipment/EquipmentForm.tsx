'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { equipmentSchema, EquipmentFormInput, EquipmentFormValues } from '@/lib/validations/equipment'
import { EquipmentCategory } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { TagInput } from '@/components/ui/TagInput'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Moon, Package, Sun } from 'lucide-react'

const KIT_SUGGESTIONS = [
  'Бленда',
  'Крышка передняя',
  'Крышка задняя',
  'Мешок',
  'Ремень',
  'Зарядное',
  'Аккумулятор',
  'Кабель',
  'Карта памяти',
  'Чехол',
  'Кофр',
  'Пульт',
]

interface Brand { id: string; name: string; logo_url: string | null }

interface EquipmentFormProps {
  categories: EquipmentCategory[]
  brands: Brand[]
  defaultValues?: Partial<EquipmentFormValues>
  equipmentId?: string
}

export function EquipmentForm({ categories, brands, defaultValues, equipmentId }: EquipmentFormProps) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EquipmentFormInput, unknown, EquipmentFormValues>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      currency: 'UZS',
      day_rate: 0,
      night_rate: 0,
      source: 'Каталог техники',
      ...defaultValues,
    },
  })

  const photoUrl = watch('photo_url') as string | null | undefined
  const categoryId = watch('category_id') as string | undefined
  const brandIdVal = watch('brand_id') as string | undefined
  const currencyVal = (watch('currency') as string | undefined) ?? 'UZS'
  const kitItems = (watch('kit_items') as string[] | undefined) ?? []

  async function onSubmit(data: EquipmentFormValues) {
    const url = equipmentId ? `/api/equipment/${equipmentId}` : '/api/equipment'
    const method = equipmentId ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Ошибка сохранения')
      return
    }
    toast.success(equipmentId ? 'Техника обновлена' : 'Техника добавлена')
    router.push('/equipment')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-xl">

      {/* Photo upload */}
      <div className="space-y-1.5">
        <Label>Фото</Label>
        <ImageUpload
          bucket="equipment-photos"
          value={photoUrl ?? null}
          onChange={url => setValue('photo_url', url ?? undefined)}
          aspectRatio="square"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Название *</Label>
        <Input id="name" {...register('name')} placeholder="Sony FX3" className="min-h-[44px]" />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Категория</Label>
          <Select
            value={categoryId ?? undefined}
            onValueChange={v => setValue('category_id', v)}
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder="Выберите категорию">
                {categoryId ? categories.find(c => c.id === categoryId)?.name : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Бренд</Label>
          <Select
            value={brandIdVal ?? '__none'}
            onValueChange={v => setValue('brand_id', v === '__none' ? undefined : v)}
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder="Выберите бренд">
                {brandIdVal ? (brands.find(b => b.id === brandIdVal)?.name ?? '—') : '— Без бренда —'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Без бренда —</SelectItem>
              {brands.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">
            Нет нужного? <a href="/admin/brands" target="_blank" className="text-blue-500 hover:underline">Добавить бренд →</a>
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="specs">Характеристики</Label>
        <Input id="specs" {...register('specs')} placeholder="Full-frame, 4K, комплект" className="min-h-[44px]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_160px] gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="day_rate" className="inline-flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-500" />
            Дневная ставка *
          </Label>
          <Input
            id="day_rate"
            type="number"
            inputMode="decimal"
            {...register('day_rate')}
            placeholder="100000"
            className="min-h-[44px]"
          />
          {errors.day_rate && <p className="text-xs text-red-500">{errors.day_rate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="night_rate" className="inline-flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-500" />
            Ночная ставка *
          </Label>
          <Input
            id="night_rate"
            type="number"
            inputMode="decimal"
            {...register('night_rate')}
            placeholder="100000"
            className="min-h-[44px]"
          />
          {errors.night_rate && <p className="text-xs text-red-500">{errors.night_rate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Валюта</Label>
          <Select
            value={currencyVal}
            onValueChange={v => setValue('currency', v as EquipmentFormValues['currency'])}
          >
            <SelectTrigger className="min-h-[44px]"><SelectValue>{currencyVal}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="UZS">UZS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Комплектация ── */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-blue-500" />
          <Label>Комплектация</Label>
        </div>
        <p className="text-xs text-gray-400 -mt-2">
          Что выдаётся вместе с техникой. При оформлении заказа админ отмечает галочками, что именно выдано клиенту.
        </p>
        <TagInput
          value={kitItems}
          onChange={tags => setValue('kit_items', tags)}
          placeholder="Напишите и нажмите Enter…"
          suggestions={KIT_SUGGESTIONS}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Заметки</Label>
        <Textarea id="notes" {...register('notes')} rows={3} placeholder="Комплект, особенности, внутренние пометки" />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting} className="min-h-[48px] flex-1">
          {isSubmitting ? 'Сохранение...' : equipmentId ? 'Сохранить' : 'Добавить технику'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[48px]" onClick={() => router.back()}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

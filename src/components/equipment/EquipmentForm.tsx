'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { equipmentSchema, EquipmentFormValues } from '@/lib/validations/equipment'
import { EquipmentCategory } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface EquipmentFormProps {
  categories: EquipmentCategory[]
  defaultValues?: Partial<EquipmentFormValues>
  equipmentId?: string
}

export function EquipmentForm({ categories, defaultValues, equipmentId }: EquipmentFormProps) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EquipmentFormValues>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: defaultValues ?? { status: 'free', daily_rate: 0 },
  })

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
      <div className="space-y-1.5">
        <Label htmlFor="name">Название *</Label>
        <Input id="name" {...register('name')} placeholder="Sony FX3" />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Категория</Label>
        <Select
          defaultValue={defaultValues?.category_id ?? undefined}
          onValueChange={v => setValue('category_id', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Выберите категорию" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="serial_number">Серийный номер</Label>
          <Input id="serial_number" {...register('serial_number')} placeholder="SN-12345" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="daily_rate">Ставка аренды/день *</Label>
          <Input
            id="daily_rate"
            type="number"
            {...register('daily_rate')}
            placeholder="50000"
          />
          {errors.daily_rate && <p className="text-xs text-red-500">{errors.daily_rate.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="purchase_cost">Стоимость покупки</Label>
        <Input
          id="purchase_cost"
          type="number"
          {...register('purchase_cost')}
          placeholder="2500000"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Статус</Label>
        <Select
          defaultValue={defaultValues?.status ?? 'free'}
          onValueChange={v => setValue('status', v as EquipmentFormValues['status'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="free">Свободна</SelectItem>
            <SelectItem value="rented">В аренде</SelectItem>
            <SelectItem value="maintenance">На ТО</SelectItem>
            <SelectItem value="lost">Утеряна</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Заметки</Label>
        <Textarea id="notes" {...register('notes')} rows={3} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Сохранение...' : equipmentId ? 'Сохранить' : 'Добавить технику'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

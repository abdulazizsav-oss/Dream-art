'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clientSchema, ClientFormInput, ClientFormValues } from '@/lib/validations/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ReliabilityRating } from './ReliabilityRating'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CLIENT_SEGMENT_LABELS, DOCUMENT_TYPE_LABELS } from '@/lib/utils'
import { UserCheck, Camera, AtSign, MapPin } from 'lucide-react'

interface ClientFormProps {
  defaultValues?: Partial<ClientFormValues>
  clientId?: string
}

export function ClientForm({ defaultValues, clientId }: ClientFormProps) {
  const router = useRouter()
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<ClientFormInput, unknown, ClientFormValues>({
      resolver: zodResolver(clientSchema),
      defaultValues: defaultValues ?? { reliability_rating: 3, segment: 'other', deposit_held: 0, document_type: 'passport_id' },
    })

  const rating = Number(watch('reliability_rating') ?? 3)
  const segment = (watch('segment') as string | undefined) ?? 'other'
  const docType = (watch('document_type') as string | undefined) ?? 'passport_id'
  const photoUrl = (watch('photo_url') as string | undefined) ?? null

  async function onSubmit(data: ClientFormValues) {
    const url = clientId ? `/api/clients/${clientId}` : '/api/clients'
    const method = clientId ? 'PUT' : 'POST'
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
    toast.success(clientId ? 'Клиент обновлён' : 'Клиент добавлен')
    router.push('/clients')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-xl">

      {/* ── Фото клиента ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-500" />
          <Label>Фото клиента</Label>
        </div>
        <div className="w-28">
          <ImageUpload
            bucket="client-photos"
            value={photoUrl}
            onChange={url => setValue('photo_url', url ?? '')}
            aspectRatio="square"
          />
        </div>
        <p className="text-xs text-gray-400">Фото автоматически сжимается до ~400 КБ</p>
      </div>

      {/* ── Основная информация ── */}
      <div className="border-t pt-4 space-y-1.5">
        <Label>ФИО *</Label>
        <Input {...register('full_name')} placeholder="Иванов Иван Иванович" className="min-h-[44px]" />
        {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Телефон *</Label>
        <Input {...register('phone')} placeholder="+998 90 123-45-67" className="min-h-[44px]" />
        {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
      </div>

      {/* ── Контакты ── */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <AtSign className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-700">Контакты</h3>
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" {...register('email')} placeholder="client@example.com" className="min-h-[44px]" />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Telegram *</Label>
            <Input {...register('telegram_username')} placeholder="@username" className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Instagram *</Label>
            <Input {...register('instagram_username')} placeholder="@username" className="min-h-[44px]" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Facebook</Label>
          <Input {...register('facebook_username')} placeholder="fb.com/username" className="min-h-[44px]" />
        </div>
      </div>

      {/* ── Адреса ── */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-700">Адреса</h3>
        </div>
        <div className="space-y-1.5">
          <Label>Адрес фактический *</Label>
          <Textarea {...register('address_actual')} rows={2} placeholder="Город, улица, дом, квартира" />
        </div>
        <div className="space-y-1.5">
          <Label>Адрес по прописке *</Label>
          <Textarea {...register('address_registered')} rows={2} placeholder="Город, улица, дом, квартира" />
        </div>
      </div>

      <div className="border-t pt-4 space-y-1.5">
        <Label>Сегмент</Label>
        <Select
          value={segment}
          onValueChange={v => setValue('segment', v as ClientFormValues['segment'])}
        >
          <SelectTrigger className="min-h-[44px]">
            <SelectValue>{CLIENT_SEGMENT_LABELS[segment]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CLIENT_SEGMENT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Надёжность</Label>
        <ReliabilityRating rating={rating} onChange={v => setValue('reliability_rating', v)} />
      </div>

      <div className="space-y-1.5">
        <Label>Депозит на хранении</Label>
        <Input type="number" {...register('deposit_held')} placeholder="0" className="min-h-[44px]" />
      </div>

      {/* ── Документ клиента ── */}
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Документ клиента</h3>
        <div className="space-y-1.5">
          <Label>Вид документа</Label>
          <Select
            value={docType}
            onValueChange={v => setValue('document_type', v as ClientFormValues['document_type'])}
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue>{DOCUMENT_TYPE_LABELS[docType]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Серия</Label>
            <Input {...register('passport_series')} placeholder="AA" className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Номер</Label>
            <Input {...register('passport_number')} placeholder="1234567" className="min-h-[44px]" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Кем выдан</Label>
          <Input {...register('passport_issued_by')} className="min-h-[44px]" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Дата выдачи</Label>
            <Input type="date" {...register('passport_issued_date')} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Дата рождения</Label>
            <Input type="date" {...register('birth_date')} className="min-h-[44px]" />
          </div>
        </div>
      </div>

      {/* ── Доверенное лицо ── */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-700">Доверенное лицо</h3>
        </div>
        <p className="text-xs text-gray-400 -mt-1">
          Человек, который может забирать технику от имени клиента
        </p>
        <div className="space-y-1.5">
          <Label>ФИО доверенного лица</Label>
          <Input
            {...register('trusted_person_name')}
            placeholder="Иванов Пётр Иванович"
            className="min-h-[44px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Телефон</Label>
            <Input
              {...register('trusted_person_phone')}
              placeholder="+998 90 000-00-00"
              className="min-h-[44px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Кто это?</Label>
            <Input
              {...register('trusted_person_relation')}
              placeholder="Брат, жена, коллега..."
              className="min-h-[44px]"
            />
          </div>
        </div>
      </div>

      {/* ── Заметки ── */}
      <div className="space-y-1.5">
        <Label>Заметки</Label>
        <Textarea {...register('notes')} rows={3} placeholder="Дополнительная информация..." />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting} className="flex-1 min-h-[48px]">
          {isSubmitting ? 'Сохранение...' : clientId ? 'Сохранить изменения' : 'Добавить клиента'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[48px]" onClick={() => router.back()}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

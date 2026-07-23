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
import { PotentialClientDuplicateWarning } from './PotentialClientDuplicateWarning'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CLIENT_SEGMENT_LABELS, DOCUMENT_TYPE_LABELS } from '@/lib/utils'
import { UserCheck, Camera, AtSign, MapPin, Download, User, FileText, Star, StickyNote } from 'lucide-react'

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
  const fullName = (watch('full_name') as string | undefined) ?? ''
  const phone = (watch('phone') as string | undefined) ?? ''

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

  async function downloadPhoto() {
    if (!photoUrl) return
    try {
      const res = await fetch(photoUrl)
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      const ext = (blob.type.split('/')[1] ?? 'jpg').split('+')[0]
      const name = (watch('full_name') as string | undefined)?.trim().replace(/\s+/g, '_') || 'client'
      a.download = `${name}-photo.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch {
      toast.error('Не удалось скачать фото')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-xl">

      {/* ── Фото клиента ── */}
      <section className="rounded-2xl border border-sky-200/70 bg-sky-50/50 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <Camera className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-semibold text-sky-900">Фото клиента</h3>
          </div>
          {photoUrl && (
            <button
              type="button"
              onClick={downloadPhoto}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Скачать
            </button>
          )}
        </div>
        <div className="w-28">
          <ImageUpload
            bucket="client-photos"
            value={photoUrl}
            onChange={url => setValue('photo_url', url ?? '')}
            aspectRatio="square"
          />
        </div>
        <p className="text-xs text-sky-700/70 mt-2">Фото автоматически сжимается до ~400 КБ</p>
      </section>

      {/* ── Основная информация ── */}
      <section className="rounded-2xl border border-blue-200/70 bg-blue-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <User className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-blue-900">Основная информация</h3>
        </div>
        <div className="space-y-1.5">
          <Label>ФИО *</Label>
          <Input {...register('full_name')} placeholder="Иванов Иван Иванович" className="min-h-[44px] bg-white" />
          {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Телефон *</Label>
          <Input {...register('phone')} placeholder="+998 90 123-45-67" className="min-h-[44px] bg-white" />
          {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
        </div>
        <PotentialClientDuplicateWarning
          fullName={fullName}
          phone={phone}
          excludeClientId={clientId}
        />
      </section>

      {/* ── Контакты ── */}
      <section className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <AtSign className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-violet-900">Контакты</h3>
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" {...register('email')} placeholder="client@example.com" className="min-h-[44px] bg-white" />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Telegram *</Label>
            <Input {...register('telegram_username')} placeholder="@username" className="min-h-[44px] bg-white" />
          </div>
          <div className="space-y-1.5">
            <Label>Instagram *</Label>
            <Input {...register('instagram_username')} placeholder="@username" className="min-h-[44px] bg-white" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Facebook</Label>
          <Input {...register('facebook_username')} placeholder="fb.com/username" className="min-h-[44px] bg-white" />
        </div>
      </section>

      {/* ── Адреса ── */}
      <section className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <MapPin className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-emerald-900">Адреса</h3>
        </div>
        <div className="space-y-1.5">
          <Label>Адрес фактический *</Label>
          <Textarea {...register('address_actual')} rows={2} placeholder="Город, улица, дом, квартира" className="bg-white" />
        </div>
        <div className="space-y-1.5">
          <Label>Адрес по прописке *</Label>
          <Textarea {...register('address_registered')} rows={2} placeholder="Город, улица, дом, квартира" className="bg-white" />
        </div>
      </section>

      {/* ── Сегмент / Надёжность / Депозит ── */}
      <section className="rounded-2xl border border-amber-200/70 bg-amber-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <Star className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-amber-900">Оценка и сегмент</h3>
        </div>
        <div className="space-y-1.5">
          <Label>Сегмент</Label>
          <Select
            value={segment}
            onValueChange={v => setValue('segment', v as ClientFormValues['segment'])}
          >
            <SelectTrigger className="min-h-[44px] bg-white">
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
          <div className="rounded-xl bg-white px-3 py-2 border border-amber-100">
            <ReliabilityRating rating={rating} onChange={v => setValue('reliability_rating', v)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Депозит на хранении</Label>
          <Input type="number" {...register('deposit_held')} placeholder="0" className="min-h-[44px] bg-white" />
        </div>
      </section>

      {/* ── Документ клиента ── */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-700">
            <FileText className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-slate-900">Документ клиента</h3>
        </div>
        <div className="space-y-1.5">
          <Label>Вид документа</Label>
          <Select
            value={docType}
            onValueChange={v => setValue('document_type', v as ClientFormValues['document_type'])}
          >
            <SelectTrigger className="min-h-[44px] bg-white">
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
            <Input {...register('passport_series')} placeholder="AA" className="min-h-[44px] bg-white" />
          </div>
          <div className="space-y-1.5">
            <Label>Номер</Label>
            <Input {...register('passport_number')} placeholder="1234567" className="min-h-[44px] bg-white" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Кем выдан</Label>
          <Input {...register('passport_issued_by')} className="min-h-[44px] bg-white" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Дата выдачи</Label>
            <Input type="date" {...register('passport_issued_date')} className="min-h-[44px] bg-white" />
          </div>
          <div className="space-y-1.5">
            <Label>Дата рождения</Label>
            <Input type="date" {...register('birth_date')} className="min-h-[44px] bg-white" />
          </div>
        </div>
      </section>

      {/* ── Доверенное лицо ── */}
      <section className="rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
            <UserCheck className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-rose-900">Доверенное лицо</h3>
        </div>
        <p className="text-xs text-rose-700/70 -mt-1">
          Человек, который может забирать технику от имени клиента
        </p>
        <div className="space-y-1.5">
          <Label>ФИО доверенного лица</Label>
          <Input
            {...register('trusted_person_name')}
            placeholder="Иванов Пётр Иванович"
            className="min-h-[44px] bg-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Телефон</Label>
            <Input
              {...register('trusted_person_phone')}
              placeholder="+998 90 000-00-00"
              className="min-h-[44px] bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Кто это?</Label>
            <Input
              {...register('trusted_person_relation')}
              placeholder="Брат, жена, коллега..."
              className="min-h-[44px] bg-white"
            />
          </div>
        </div>
      </section>

      {/* ── Заметки ── */}
      <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-200 text-zinc-600">
            <StickyNote className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-zinc-800">Заметки</h3>
        </div>
        <Textarea {...register('notes')} rows={3} placeholder="Дополнительная информация..." className="bg-white" />
      </section>

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

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
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CLIENT_SEGMENT_LABELS, DOCUMENT_TYPE_LABELS } from '@/lib/utils'

interface ClientFormProps {
  defaultValues?: Partial<ClientFormValues>
  clientId?: string
}

export function ClientForm({ defaultValues, clientId }: ClientFormProps) {
  const router = useRouter()
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<ClientFormInput, unknown, ClientFormValues>({
      resolver: zodResolver(clientSchema),
      defaultValues: defaultValues ?? { reliability_rating: 3, segment: 'other', deposit_held: 0 },
    })

  const rating = Number(watch('reliability_rating') ?? 3)
  const segment = (watch('segment') as string | undefined) ?? 'other'
  const docType = (watch('document_type') as string | undefined) ?? 'passport_id'

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
      <div className="space-y-1.5">
        <Label>ФИО *</Label>
        <Input {...register('full_name')} placeholder="Иванов Иван Иванович" />
        {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Телефон</Label>
          <Input {...register('phone')} placeholder="+998 90 123-45-67" />
        </div>
        <div className="space-y-1.5">
          <Label>Telegram</Label>
          <Input {...register('telegram_username')} placeholder="@username" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Сегмент</Label>
        <Select
          value={segment}
          onValueChange={v => setValue('segment', v as ClientFormValues['segment'])}
        >
          <SelectTrigger><SelectValue>{CLIENT_SEGMENT_LABELS[segment]}</SelectValue></SelectTrigger>
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
        <Input type="number" {...register('deposit_held')} placeholder="0" />
      </div>

      <div className="border-t pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Документ</h3>
        <div className="space-y-1.5 mb-4">
          <Label>Вид документа</Label>
          <Select
            value={docType}
            onValueChange={v => setValue('document_type', v as ClientFormValues['document_type'])}
          >
            <SelectTrigger><SelectValue>{DOCUMENT_TYPE_LABELS[docType]}</SelectValue></SelectTrigger>
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
            <Input {...register('passport_series')} placeholder="AA" />
          </div>
          <div className="space-y-1.5">
            <Label>Номер</Label>
            <Input {...register('passport_number')} placeholder="1234567" />
          </div>
        </div>
        <div className="space-y-1.5 mt-3">
          <Label>Кем выдан</Label>
          <Input {...register('passport_issued_by')} />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="space-y-1.5">
            <Label>Дата выдачи</Label>
            <Input type="date" {...register('passport_issued_date')} />
          </div>
          <div className="space-y-1.5">
            <Label>Дата рождения</Label>
            <Input type="date" {...register('birth_date')} />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Заметки</Label>
        <Textarea {...register('notes')} rows={3} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Сохранение...' : clientId ? 'Сохранить' : 'Добавить клиента'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Отмена</Button>
      </div>
    </form>
  )
}

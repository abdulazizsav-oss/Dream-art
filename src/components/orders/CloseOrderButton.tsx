'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'

interface CloseOrderButtonProps {
  orderId: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

export function CloseOrderButton({ orderId, variant = 'default', size = 'default', className }: CloseOrderButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClose() {
    if (!confirm('Закрыть заказ? Техника будет помечена как свободная.')) return
    setLoading(true)
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close' }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Ошибка закрытия заказа')
    } else {
      toast.success('Заказ закрыт')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handleClose}
      disabled={loading}
    >
      <CheckCircle className="w-4 h-4 mr-2" />
      {loading ? 'Закрытие...' : 'Закрыть заказ'}
    </Button>
  )
}

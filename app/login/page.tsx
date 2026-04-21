'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

const PIN_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

export default function LoginPage() {
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [mode, setMode] = useState<'pin' | 'password'>('pin')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function handleDigit(d: string) {
    if (d === '⌫') {
      setPin(prev => prev.slice(0, -1))
    } else if (pin.length < 8) {
      setPin(prev => prev + d)
    }
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault()
    if (!nickname.trim() || !pin) {
      toast.error(mode === 'pin' ? 'Введите никнейм и PIN' : 'Введите никнейм и пароль')
      return
    }
    setLoading(true)
    try {
      // If user pasted/autofilled an email like admin@dreamart.uz, take only the part before '@'
      const cleanNickname = nickname.trim().toLowerCase().split('@')[0]
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: cleanNickname, password: pin }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Неверный никнейм или пароль')
        setPin('')
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast.error('Не удалось подключиться к серверу')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white text-2xl font-bold shadow-lg mb-4">
            DA
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Dream Art</h1>
          <p className="text-sm text-zinc-500 mt-1">CRM для аренды фото/видео техники</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-6 space-y-5">

          {/* Nickname */}
          <div className="space-y-1.5">
            <Label htmlFor="nickname" className="text-zinc-700">Никнейм или email</Label>
            <Input
              id="nickname"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="admin"
              className="min-h-[48px] text-base rounded-xl"
            />
            <p className="text-[11px] text-zinc-400">
              Email автоматически сокращается до никнейма (admin@… → admin)
            </p>
          </div>

          {/* PIN / Password input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-700">
                {mode === 'pin' ? 'PIN' : 'Пароль'}
              </Label>
              <button
                type="button"
                onClick={() => { setMode(m => (m === 'pin' ? 'password' : 'pin')); setPin('') }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {mode === 'pin' ? 'Войти паролем' : 'Войти по PIN'}
              </button>
            </div>
            {mode === 'pin' ? (
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="••••"
                className="min-h-[48px] text-base text-center tracking-[0.5em] rounded-xl"
              />
            ) : (
              <Input
                type="password"
                autoComplete="current-password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Введите пароль"
                className="min-h-[48px] text-base rounded-xl"
              />
            )}
          </div>

          {/* Numpad — only in PIN mode */}
          {mode === 'pin' && (
            <div className="grid grid-cols-3 gap-2">
              {PIN_DIGITS.map((d, i) => (
                d === '' ? (
                  <div key={i} />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleDigit(d)}
                    className={cn(
                      'flex items-center justify-center rounded-2xl min-h-[52px] text-lg font-semibold transition-all active:scale-95',
                      d === '⌫'
                        ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        : 'bg-zinc-50 text-zinc-900 hover:bg-zinc-100 border border-zinc-200',
                    )}
                  >
                    {d === '⌫' ? <Delete className="w-5 h-5" /> : d}
                  </button>
                )
              ))}
            </div>
          )}

          <Button
            type="submit"
            className="w-full min-h-[52px] rounded-2xl text-base font-semibold"
            disabled={loading || !nickname.trim() || !pin}
          >
            {loading ? 'Входим...' : 'Войти'}
          </Button>
        </form>
      </div>
    </div>
  )
}

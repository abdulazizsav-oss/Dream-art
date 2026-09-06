'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Camera, ClipboardList,
  CalendarDays, Wallet, Shield, Users, Layers, Tag,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface MobileNavProps {
  role: string
}

const baseItems = [
  { href: '/dashboard',  label: 'Главная',  icon: LayoutDashboard },
  { href: '/equipment',  label: 'Техника',  icon: Camera },
  { href: '/orders',     label: 'Аренда',   icon: ClipboardList },
  { href: '/clients',    label: 'Клиенты',  icon: Users },
  { href: '/calendar',   label: 'Календарь', icon: CalendarDays },
]

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const moreItems = [
    { href: '/admin/categories', label: 'Категории техники', icon: Layers },
    { href: '/admin/brands', label: 'Бренды', icon: Tag },
    ...(role === 'super_admin' ? [
      { href: '/finance', label: 'Финансы', icon: Wallet },
      { href: '/admin/users', label: 'Пользователи', icon: Shield },
    ] : []),
  ]
  const moreActive = moreItems.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))

  useEffect(() => { setMoreOpen(false) }, [pathname])

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      const { error } = await createClient().auth.signOut()
      if (error) throw error
      setMoreOpen(false)
      router.push('/login')
    } catch {
      toast.error('Не удалось выйти. Проверьте соединение и повторите.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <>
    <nav aria-label="Основные разделы" className="xl:hidden fixed bottom-0 inset-x-0 z-30 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-stretch">
        {baseItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'min-w-0 flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 min-h-[68px] text-[10px] sm:text-xs font-medium transition-colors focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-200',
                active ? 'bg-blue-50/60 text-blue-600' : 'text-zinc-500 hover:text-zinc-800'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={cn('w-6 h-6', active ? 'text-blue-600' : 'text-gray-400')} />
              {label}
            </Link>
          )
        })}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={cn('flex min-h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-200 sm:text-xs', moreActive ? 'bg-blue-50/60 text-blue-600' : 'text-zinc-500 hover:text-zinc-800')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
          Ещё
        </button>
      </div>
    </nav>
    <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="flex-row items-center justify-between gap-3">
          <DialogTitle className="text-lg font-semibold">Другие разделы</DialogTitle>
          <button type="button" onClick={() => setMoreOpen(false)} aria-label="Закрыть другие разделы" className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl text-zinc-500 hover:bg-zinc-100">×</button>
        </DialogHeader>
        <div className="space-y-2">
          {moreItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMoreOpen(false)} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-zinc-200 px-4 font-medium hover:bg-zinc-50 focus-visible:ring-4 focus-visible:ring-blue-200"><Icon className="h-5 w-5 text-zinc-500" />{label}</Link>)}
          <button type="button" onClick={logout} disabled={loggingOut} className="mt-2 min-h-[52px] w-full rounded-xl px-4 text-left font-medium text-zinc-500 hover:bg-red-50 hover:text-red-700 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:opacity-50">{loggingOut ? 'Выходим…' : 'Выйти из аккаунта'}</button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

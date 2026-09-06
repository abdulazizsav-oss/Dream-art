'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { QuickClientDialog } from '@/components/clients/QuickClientDialog'

export function QuickActions({ userName }: { userName: string }) {
  const pathname = usePathname()
  const [clientOpen, setClientOpen] = useState(false)

  useEffect(() => {
    const openClient = () => setClientOpen(true)
    window.addEventListener('crm:open-client', openClient)
    return () => window.removeEventListener('crm:open-client', openClient)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white pt-[env(safe-area-inset-top,0px)]">
        <div className="flex h-[72px] min-w-0 items-center justify-between gap-3 px-4 md:px-6 xl:px-8">
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-zinc-900">Dream Art <span className="font-normal text-zinc-400">/ {userName || 'Администратор'}</span></p>
            {process.env.NODE_ENV === 'development' ? (
              <p className="mt-0.5 text-[11px] text-amber-700">Локальная версия · рабочая база</p>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-500">Рабочее место администратора</p>
            )}
          </div>
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:gap-3">
            <Link
              href="/orders/new"
              onClick={event => {
                if (pathname === '/orders/new') {
                  event.preventDefault()
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }
              }}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-zinc-800 focus-visible:ring-4 focus-visible:ring-blue-200 sm:flex-none sm:px-5"
            >
              <span className="text-xl font-normal leading-none" aria-hidden="true">+</span> Новый заказ
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClientOpen(true)}
              className="min-h-12 flex-1 gap-2 rounded-xl px-4 text-sm sm:flex-none sm:px-5"
              aria-haspopup="dialog"
            >
              <span className="text-xl font-normal leading-none" aria-hidden="true">+</span> Клиент
            </Button>
          </div>
        </div>
      </header>
      <QuickClientDialog open={clientOpen} onOpenChange={setClientOpen} />
    </>
  )
}

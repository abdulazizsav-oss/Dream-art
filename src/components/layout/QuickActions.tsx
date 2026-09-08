'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { QuickClientDialog } from '@/components/clients/QuickClientDialog'
import { BrandLogo } from './BrandLogo'

export function QuickActions({ userName }: { userName: string }) {
  const pathname = usePathname()
  const clientId = pathname.match(/^\/clients\/([0-9a-f-]{36})$/i)?.[1]
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
          <Link href="/dashboard" aria-label="Dream Art — на главную" className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 xl:hidden">
            <BrandLogo variant="compact" />
          </Link>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-zinc-900">Dream Art <span className="font-normal text-zinc-400">/ {userName || 'Администратор'}</span></p>
            {process.env.NODE_ENV === 'development' ? (
              <p className="mt-0.5 text-[11px] text-amber-700">Локальная версия · рабочая база</p>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-500">Рабочее место администратора</p>
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
            <Link
              href={clientId ? `/orders/new?client_id=${clientId}` : '/orders/new'}
              onClick={event => {
                if (pathname === '/orders/new') {
                  event.preventDefault()
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }
              }}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-zinc-900 px-2 text-sm font-semibold text-white outline-none transition-colors hover:bg-zinc-800 focus-visible:ring-4 focus-visible:ring-blue-200 sm:flex-none sm:gap-2 sm:px-5"
            >
              <span className="text-xl font-normal leading-none" aria-hidden="true">+</span> Новый заказ
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClientOpen(true)}
              className="min-h-12 flex-1 gap-1 rounded-xl px-2 text-sm sm:flex-none sm:gap-2 sm:px-5"
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

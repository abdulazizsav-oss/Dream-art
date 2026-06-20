'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Camera, ClipboardList,
  CalendarDays, Wallet, Shield,
} from 'lucide-react'

interface MobileNavProps {
  role: string
}

const baseItems = [
  { href: '/dashboard',  label: 'Главная',  icon: LayoutDashboard },
  { href: '/equipment',  label: 'Техника',  icon: Camera },
  { href: '/orders',     label: 'Аренда',   icon: ClipboardList },
  { href: '/calendar',   label: 'Кал.',     icon: CalendarDays },
]

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname()

  // Финансы + Пользователи — только для главного администратора
  const items = role === 'super_admin'
    ? [
        ...baseItems,
        { href: '/finance',    label: 'Финансы', icon: Wallet },
        { href: '/admin/users', label: 'Польз.',  icon: Shield },
      ]
    : baseItems

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t safe-area-pb">
      <div className="flex items-stretch">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[64px] text-[10px] font-medium transition-colors',
                active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <Icon className={cn('w-6 h-6', active ? 'text-blue-600' : 'text-gray-400')} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Camera, Users, ClipboardList,
  CalendarDays, Wallet, LogOut, Shield, Tag, Layers,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface SidebarProps {
  role: string
  userName: string
}

const baseNavItems = [
  { href: '/dashboard',  label: 'Дашборд',   icon: LayoutDashboard },
  { href: '/equipment',  label: 'Техника',    icon: Camera },
  { href: '/clients',    label: 'Клиенты',    icon: Users },
  { href: '/orders',     label: 'Аренда',     icon: ClipboardList },
  { href: '/calendar',   label: 'Календарь',  icon: CalendarDays },
]

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const navItems = [
    ...baseNavItems,
    { href: '/admin/categories', label: 'Категории',    icon: Layers },
    { href: '/admin/brands',    label: 'Бренды',        icon: Tag },
    // Финансы — только для главного администратора
    ...(role === 'super_admin'
      ? [
          { href: '/finance',    label: 'Финансы',      icon: Wallet },
          { href: '/admin/users', label: 'Пользователи', icon: Shield },
        ]
      : []),
  ]

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="hidden lg:flex w-64 flex-col bg-white border-r h-screen sticky top-0 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          DA
        </div>
        <div className="min-w-0">
          <span className="font-bold text-gray-900 text-sm">Dream Art</span>
          <p className="text-xs text-gray-400 truncate">CRM система</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px]',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', active ? 'text-blue-600' : 'text-gray-400')} />
              {label}
              {href === '/admin/users' && (
                <span className="ml-auto text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">
                  SA
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-4 border-t space-y-1">
        <div className="px-4 py-2.5 rounded-xl bg-gray-50">
          <p className="text-xs font-medium text-gray-700 truncate">{userName || 'Администратор'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {role === 'super_admin' ? 'Главный администратор' : 'Администратор'}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-gray-500 hover:text-red-600 min-h-[44px] px-4"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Выйти
        </Button>
      </div>
    </aside>
  )
}

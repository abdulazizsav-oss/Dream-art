import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { NavigationProgress } from '@/components/layout/NavigationProgress'
import { QuickActions } from '@/components/layout/QuickActions'
import { getMyProfile } from '@/lib/supabase/getRole'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getMyProfile()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <NavigationProgress />
      <Sidebar role={profile?.role ?? 'admin'} userName={profile?.full_name ?? ''} />
      <div className="min-w-0 flex-1">
        <QuickActions userName={profile?.full_name ?? ''} />
        <main className="min-w-0 p-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] md:p-6 md:pb-[calc(7rem+env(safe-area-inset-bottom,0px))] xl:p-8 xl:pb-8">
          {children}
        </main>
      </div>
      {/* iPad and phone navigation; desktop sidebar starts at 1280px. */}
      <MobileNav role={profile?.role ?? 'admin'} />
    </div>
  )
}

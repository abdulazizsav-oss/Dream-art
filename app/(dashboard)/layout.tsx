import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { NavigationProgress } from '@/components/layout/NavigationProgress'
import { getMyProfile } from '@/lib/supabase/getRole'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getMyProfile()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <NavigationProgress />
      <Sidebar role={profile?.role ?? 'admin'} userName={profile?.full_name ?? ''} />
      <main className="flex-1 min-w-0 p-4 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] md:p-6 md:pb-[calc(8rem+env(safe-area-inset-bottom,0px))] lg:p-8 lg:pb-8">
        {children}
      </main>
      {/* Mobile bottom navigation */}
      <MobileNav role={profile?.role ?? 'admin'} />
    </div>
  )
}

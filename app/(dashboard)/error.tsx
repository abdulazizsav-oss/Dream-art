'use client'

import { Button } from '@/components/ui/button'

export default function DashboardError({ unstable_retry }: { unstable_retry: () => void }) {
  return <div role="alert" className="mx-auto max-w-xl space-y-4 rounded-2xl border bg-white p-6">
    <h1 className="text-xl font-semibold">Не удалось загрузить раздел</h1>
    <p className="text-sm text-zinc-600">Данные сейчас недоступны. Это не означает, что записи удалены или список пуст. Проверьте соединение и повторите загрузку.</p>
    <Button type="button" onClick={unstable_retry}>Повторить загрузку</Button>
  </div>
}

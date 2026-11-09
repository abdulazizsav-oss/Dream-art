import Link from 'next/link'

export default function RecordNotFound() {
  return <div className="mx-auto max-w-xl space-y-4 rounded-xl border bg-white p-6">
    <h1 className="text-xl font-semibold">Запись не найдена</h1>
    <p className="text-sm text-zinc-600">Проверьте ссылку или найдите запись в нужном разделе.</p>
    <div className="flex flex-wrap gap-3">
      {([['/orders', 'Аренда'], ['/clients', 'Клиенты'], ['/equipment', 'Техника']] as const).map(([href, label]) =>
        <Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium">{label}</Link>)}
    </div>
  </div>
}

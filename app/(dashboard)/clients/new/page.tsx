import { PageHeader } from '@/components/layout/PageHeader'
import { ClientForm } from '@/components/clients/ClientForm'

export default function NewClientPage() {
  return (
    <div>
      <PageHeader title="Добавить клиента" />
      <div className="bg-white rounded-xl border p-6">
        <ClientForm />
      </div>
    </div>
  )
}

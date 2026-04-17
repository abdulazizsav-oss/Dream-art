'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Shield, UserCog, Trash2, Plus } from 'lucide-react'

interface UserRow {
  id: string
  email: string
  full_name: string
  role: string
  created_at: string
}

export function AdminUsersClient({ users }: { users: UserRow[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!email || !password || !fullName) {
      toast.error('Заполните все поля')
      return
    }
    setLoading(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName, role }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'Ошибка создания')
    } else {
      toast.success('Пользователь создан')
      setShowForm(false)
      setEmail(''); setPassword(''); setFullName('')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleDelete(userId: string) {
    if (!confirm('Удалить пользователя?')) return
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Пользователь удалён')
      router.refresh()
    } else {
      toast.error('Ошибка удаления')
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      toast.success('Роль обновлена')
      router.refresh()
    } else {
      toast.error('Ошибка обновления роли')
    }
  }

  return (
    <div className="space-y-4">
      {/* Users list */}
      <div className="bg-white rounded-2xl border divide-y">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between px-5 py-4 gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {u.role === 'super_admin'
                  ? <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  : <UserCog className="w-4 h-4 text-gray-400 flex-shrink-0" />
                }
                <p className="font-medium text-sm truncate">{u.full_name || u.email}</p>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Select
                defaultValue={u.role}
                onValueChange={v => handleRoleChange(u.id, v)}
              >
                <SelectTrigger className="w-36 min-h-[40px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="super_admin">Гл. администратор</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-700 min-h-[40px] min-w-[40px]"
                onClick={() => handleDelete(u.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <p className="text-center py-10 text-gray-400 text-sm">Нет пользователей</p>
        )}
      </div>

      {/* Add user form */}
      {!showForm ? (
        <Button
          className="w-full min-h-[48px]"
          variant="outline"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Добавить администратора
        </Button>
      ) : (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <h3 className="font-semibold">Новый администратор</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Имя</Label>
              <Input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Имя Фамилия"
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="min-h-[44px]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Пароль</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Роль</Label>
              <Select value={role} onValueChange={v => setRole(v as typeof role)}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="super_admin">Гл. администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button onClick={handleCreate} disabled={loading} className="min-h-[44px] flex-1">
              {loading ? 'Создание...' : 'Создать'}
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setShowForm(false)}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

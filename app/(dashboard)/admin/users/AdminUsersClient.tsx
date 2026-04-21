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
import { Shield, UserCog, Trash2, Plus, KeyRound, ChevronDown, ChevronUp } from 'lucide-react'

interface UserRow {
  id: string
  email: string
  nickname: string
  full_name: string
  role: string
  created_at: string
}

export function AdminUsersClient({ users }: { users: UserRow[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin')
  const [loading, setLoading] = useState(false)

  // PIN change per user
  const [pinUserId, setPinUserId] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  async function handleCreate() {
    if (!nickname.trim() || !password || !fullName.trim()) {
      toast.error('Заполните все поля')
      return
    }
    if (role === 'admin' && !/^\d{4,8}$/.test(password)) {
      toast.error('PIN администратора: 4–8 цифр')
      return
    }
    setLoading(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nickname.trim(), password, full_name: fullName.trim(), role }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'Ошибка создания')
    } else {
      toast.success('Пользователь создан')
      setShowForm(false)
      setNickname(''); setPassword(''); setFullName('')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`Удалить "${name}"?`)) return
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

  async function handleChangePin(userId: string) {
    if (!newPin) { toast.error('Введите новый PIN'); return }
    const user = users.find(u => u.id === userId)
    if (user?.role === 'admin' && !/^\d{4,8}$/.test(newPin)) {
      toast.error('PIN: 4–8 цифр')
      return
    }
    setPinLoading(true)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPin }),
    })
    if (res.ok) {
      toast.success('PIN изменён')
      setPinUserId(null)
      setNewPin('')
    } else {
      toast.error('Ошибка смены PIN')
    }
    setPinLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Users list */}
      <div className="bg-white rounded-2xl border divide-y">
        {users.map(u => (
          <div key={u.id} className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {u.role === 'super_admin'
                    ? <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    : <UserCog className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                  <p className="font-semibold text-sm">{u.full_name}</p>
                  <span className="text-xs text-zinc-400 font-mono bg-zinc-100 px-2 py-0.5 rounded-full">
                    @{u.nickname}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 ml-6">
                  {u.role === 'super_admin' ? 'Главный администратор' : 'Администратор'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setPinUserId(pinUserId === u.id ? null : u.id); setNewPin('') }}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  PIN
                  {pinUserId === u.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <Select defaultValue={u.role} onValueChange={v => handleRoleChange(u.id, v)}>
                  <SelectTrigger className="w-36 min-h-[36px] text-xs">
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
                  className="text-red-400 hover:text-red-600 min-h-[36px] min-w-[36px]"
                  onClick={() => handleDelete(u.id, u.full_name)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Inline PIN change */}
            {pinUserId === u.id && (
              <div className="flex items-end gap-2 pl-6 pb-1">
                <div className="space-y-1 flex-1 max-w-[200px]">
                  <Label className="text-xs">
                    {u.role === 'admin' ? 'Новый PIN (4–8 цифр)' : 'Новый пароль'}
                  </Label>
                  <Input
                    type="password"
                    inputMode={u.role === 'admin' ? 'numeric' : 'text'}
                    maxLength={u.role === 'admin' ? 8 : 100}
                    value={newPin}
                    onChange={e => setNewPin(e.target.value)}
                    placeholder={u.role === 'admin' ? '1234' : 'Новый пароль'}
                    className="min-h-[38px] text-sm"
                    autoFocus
                  />
                </div>
                <Button
                  size="sm"
                  className="min-h-[38px]"
                  disabled={pinLoading}
                  onClick={() => handleChangePin(u.id)}
                >
                  {pinLoading ? '...' : 'Сохранить'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[38px]"
                  onClick={() => { setPinUserId(null); setNewPin('') }}
                >
                  Отмена
                </Button>
              </div>
            )}
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
              <Label>Имя и фамилия</Label>
              <Input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Иван Иванов"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Никнейм
                <span className="text-zinc-400 font-normal text-xs ml-1">(только a–z, 0–9, _)</span>
              </Label>
              <Input
                value={nickname}
                onChange={e => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="ivan_admin"
                className="min-h-[44px] font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {role === 'admin' ? 'PIN (4–8 цифр)' : 'Пароль'}
              </Label>
              <Input
                type="password"
                inputMode={role === 'admin' ? 'numeric' : 'text'}
                maxLength={role === 'admin' ? 8 : 100}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={role === 'admin' ? '1234' : 'Сложный пароль'}
                className="min-h-[44px]"
              />
              {role === 'admin' && (
                <p className="text-xs text-zinc-400">Только цифры, 4–8 символов</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button onClick={handleCreate} disabled={loading} className="min-h-[44px] flex-1">
              {loading ? 'Создание...' : 'Создать'}
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => { setShowForm(false); setNickname(''); setPassword(''); setFullName('') }}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

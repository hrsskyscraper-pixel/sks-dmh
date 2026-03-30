'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  employeeId: string
  email: string
  defaultName: string
  teams: { id: string; name: string }[]
}

export function OnboardingDialog({ employeeId, email, defaultName, teams }: Props) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [teamId, setTeamId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setError('氏名を入力してください'); return }
    if (!teamId) { setError('店舗／部署を選択してください'); return }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/join-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, name: name.trim(), teamId }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '送信に失敗しました')
      setSubmitting(false)
      return
    }

    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Dialog open modal>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>システム参加依頼</DialogTitle>
            <DialogDescription>
              以下の情報を入力して、参加依頼を送信してください。
              管理者の確認後、システムをご利用いただけます。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email">メールアドレス</Label>
              <Input id="email" value={email} disabled className="mt-1 bg-gray-100" />
            </div>

            <div>
              <Label htmlFor="name">氏名</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="氏名を入力"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="team">店舗／部署</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <DialogFooter>
            <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-orange-500 hover:bg-orange-600">
              {submitting ? '送信中...' : '参加依頼'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

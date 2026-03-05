'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, Users2 } from 'lucide-react'
import { setViewAs } from '@/app/(dashboard)/actions'

interface TestEmployee {
  id: string
  name: string
  role: string
  employment_type: string
}

export function TestUserGuide({ employees }: { employees: TestEmployee[] }) {
  const roleLabel: Record<string, string> = {
    employee: '社員',
    manager: 'マネージャー',
    admin: '開発者',
    ops_manager: '運用管理者',
  }

  const roleOrder = ['admin', 'ops_manager', 'manager', 'employee']
  const sorted = [...employees].sort(
    (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  )

  return (
    <div className="p-4 space-y-4">
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2 text-blue-800">
            <Eye className="w-5 h-5" />
            プロトタイプ閲覧モード
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-700 space-y-2">
          <p>
            このサイトのプロトタイプをご覧いただきありがとうございます。
          </p>
          <p>
            下のリストからユーザーを選ぶと、そのユーザーの視点でサイト全体を閲覧できます。
            ロールによって見える画面が異なりますので、複数のユーザーでお試しください。
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-1.5 px-1">
          <Users2 className="w-4 h-4" />
          ユーザーを選択してください
        </h2>
        {sorted.map((emp) => (
          <form key={emp.id} action={setViewAs.bind(null, emp.id)}>
            <Button
              type="submit"
              variant="outline"
              className="w-full justify-between h-auto py-3 px-4"
            >
              <div className="text-left">
                <div className="font-medium">{emp.name}</div>
                <div className="text-xs text-muted-foreground">
                  {roleLabel[emp.role] ?? emp.role} / {emp.employment_type}
                </div>
              </div>
              <Eye className="w-4 h-4 text-muted-foreground" />
            </Button>
          </form>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Shield, User, Crown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Employee, Role } from '@/types/database'

interface Props {
  employees: Employee[]
}

const ROLE_LABELS: Record<Role, string> = {
  employee: '社員',
  manager: 'マネージャー',
  admin: '管理者',
}

const ROLE_COLORS: Record<Role, string> = {
  employee: 'bg-gray-100 text-gray-700',
  manager: 'bg-blue-100 text-blue-700',
  admin: 'bg-purple-100 text-purple-700',
}

const ROLE_ICONS: Record<Role, React.ReactNode> = {
  employee: <User className="w-3 h-3" />,
  manager: <Shield className="w-3 h-3" />,
  admin: <Crown className="w-3 h-3" />,
}

export function EmployeeManager({ employees: initialEmployees }: Props) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  const handleRoleChange = (employeeId: string, newRole: Role) => {
    startTransition(async () => {
      const { error } = await supabase
        .from('employees')
        .update({ role: newRole })
        .eq('id', employeeId)

      if (error) {
        toast.error('更新に失敗しました')
        return
      }

      setEmployees(prev =>
        prev.map(e => e.id === employeeId ? { ...e, role: newRole } : e)
      )
      toast.success('ロールを更新しました')
    })
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        {employees.length}名
      </p>
      {employees.map(employee => (
        <Card key={employee.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-9 h-9 flex-shrink-0">
                <AvatarFallback className="text-sm bg-orange-200 text-orange-700">
                  {employee.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{employee.name}</p>
                <p className="text-xs text-muted-foreground truncate">{employee.email}</p>
                {employee.hire_date && (
                  <p className="text-xs text-muted-foreground">
                    入社: {new Date(employee.hire_date).toLocaleDateString('ja-JP')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${ROLE_COLORS[employee.role]} text-xs border-0 flex items-center gap-1`}>
                  {ROLE_ICONS[employee.role]}
                  {ROLE_LABELS[employee.role]}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={isPending}>
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(['employee', 'manager', 'admin'] as Role[])
                      .filter(r => r !== employee.role)
                      .map(role => (
                        <DropdownMenuItem
                          key={role}
                          onClick={() => handleRoleChange(employee.id, role)}
                          className="text-sm"
                        >
                          {ROLE_LABELS[role]}に変更
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

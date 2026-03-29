import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Trophy } from 'lucide-react'

interface Props {
  employeeId: string
  employeeRole: string
  projectSkillIds: string[]
}

export async function CheckpointRecords({ employeeId, employeeRole, projectSkillIds }: Props) {
  const db = employeeRole === 'testuser' ? createAdminClient() : await createClient()

  // CPスキル取得
  const { data: cpSkills } = await db
    .from('skills')
    .select('id, name, category')
    .eq('is_checkpoint', true)
    .order('order_index')

  if (!cpSkills?.length) return null

  // プロジェクトに含まれるCPスキルのみ
  const pSkillIdSet = new Set(projectSkillIds)
  const projectCpSkills = cpSkills.filter(s => pSkillIdSet.has(s.id))
  if (!projectCpSkills.length) return null

  // 全認定済みachievementsを取得（CPスキルのみ）
  const cpSkillIds = projectCpSkills.map(s => s.id)
  const { data: certifiedAchievements } = await db
    .from('achievements')
    .select('skill_id, employee_id, cumulative_hours_at_achievement')
    .eq('status', 'certified')
    .in('skill_id', cpSkillIds)
    .not('cumulative_hours_at_achievement', 'is', null)

  if (!certifiedAchievements?.length) return null

  // 各CPスキルの最短記録を計算
  const recordBySkill: Record<string, { employeeId: string; hours: number }> = {}
  for (const a of certifiedAchievements) {
    const hours = a.cumulative_hours_at_achievement ?? Infinity
    const current = recordBySkill[a.skill_id]
    if (!current || hours < current.hours) {
      recordBySkill[a.skill_id] = { employeeId: a.employee_id, hours }
    }
  }

  // 記録保持者の情報を取得
  const holderIds = [...new Set(Object.values(recordBySkill).map(r => r.employeeId))]
  const { data: holders } = await db
    .from('employees')
    .select('id, name, avatar_url')
    .in('id', holderIds)
  const holderMap = Object.fromEntries((holders ?? []).map(e => [e.id, e]))

  // 表示対象があるもののみ
  const records = projectCpSkills
    .filter(s => recordBySkill[s.id])
    .map(s => ({
      skill: s,
      record: recordBySkill[s.id],
      holder: holderMap[recordBySkill[s.id].employeeId],
    }))

  if (!records.length) return null

  // 現在の社員の達成状況
  const { data: myAchievements } = await db
    .from('achievements')
    .select('skill_id')
    .eq('employee_id', employeeId)
    .eq('status', 'certified')
    .in('skill_id', cpSkillIds)
  const myCertifiedIds = new Set((myAchievements ?? []).map(a => a.skill_id))

  return (
    <div className="px-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-yellow-500" />
            チェックポイント最短記録
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {records.map(({ skill, record, holder }) => {
              const isAchieved = myCertifiedIds.has(skill.id)
              return (
                <div key={skill.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${isAchieved ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
                  <Badge className="text-[9px] bg-red-500 text-white border-0 flex-shrink-0">CP</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{skill.name}</p>
                    <p className="text-[10px] text-gray-500">{record.hours}h で達成</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Avatar className="w-5 h-5">
                      <AvatarImage src={holder?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-yellow-100 text-yellow-700 text-[8px] font-bold">{holder?.name?.charAt(0) ?? '?'}</AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] text-gray-600 font-medium">{holder?.name ?? '不明'}</span>
                  </div>
                  {isAchieved && <span className="text-[10px] text-green-600 font-bold flex-shrink-0">達成済</span>}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

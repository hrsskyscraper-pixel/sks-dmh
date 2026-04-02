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
  const db = createAdminClient()

  // CPスキル取得
  const { data: cpSkills } = await db
    .from('skills')
    .select('id, name, category')
    .eq('is_checkpoint', true)
    .order('order_index')

  if (!cpSkills?.length) return null

  // プロジェクトに含まれるCPスキル（未割当の場合は全CPスキル）
  const pSkillIdSet = new Set(projectSkillIds)
  const projectCpSkills = pSkillIdSet.size > 0
    ? cpSkills.filter(s => pSkillIdSet.has(s.id))
    : cpSkills
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

  // 各CPスキルのTOP3を計算
  const top3BySkill: Record<string, { employeeId: string; hours: number; rank: number }[]> = {}
  for (const a of certifiedAchievements) {
    const hours = a.cumulative_hours_at_achievement ?? Infinity
    if (!top3BySkill[a.skill_id]) top3BySkill[a.skill_id] = []
    top3BySkill[a.skill_id].push({ employeeId: a.employee_id, hours, rank: 0 })
  }
  for (const skillId of Object.keys(top3BySkill)) {
    top3BySkill[skillId].sort((a, b) => a.hours - b.hours)
    top3BySkill[skillId] = top3BySkill[skillId].slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 }))
  }

  // 記録保持者の情報を取得
  const allHolderIds = new Set<string>()
  for (const entries of Object.values(top3BySkill)) {
    for (const e of entries) allHolderIds.add(e.employeeId)
  }
  const { data: holders } = await db
    .from('employees')
    .select('id, name, avatar_url')
    .in('id', [...allHolderIds])
  const holderMap = Object.fromEntries((holders ?? []).map(e => [e.id, e]))

  // 表示対象があるもののみ
  const records = projectCpSkills
    .filter(s => top3BySkill[s.id]?.length)
    .map(s => ({
      skill: s,
      top3: top3BySkill[s.id],
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
            チェックポイント最短記録 TOP3
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-1.5">
            {records.map(({ skill, top3 }) => {
              const isAchieved = myCertifiedIds.has(skill.id)
              const MEDALS = ['🥇', '🥈', '🥉']
              return (
                <div key={skill.id} className={`rounded-lg px-3 py-2 ${isAchieved ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
                  <div className="flex items-center gap-1.5 mb-1 sm:mb-0 sm:inline-flex sm:w-[160px] sm:flex-shrink-0">
                    <Badge className="text-[9px] bg-red-500 text-white border-0 px-1.5">CP</Badge>
                    <p className="text-sm font-semibold text-gray-800 truncate" title={skill.name}>{skill.name}</p>
                    {isAchieved && <span className="text-[10px] text-green-600 font-bold flex-shrink-0">達成済</span>}
                  </div>
                  <div className="flex items-center gap-2 sm:inline-flex sm:flex-1 sm:min-w-0">
                    {[1, 2, 3].map(rank => {
                      const entry = top3.find(e => e.rank === rank)
                      const holder = entry ? holderMap[entry.employeeId] : null
                      const isMe = entry?.employeeId === employeeId
                      const RANK_STYLES = [
                        'bg-yellow-400 text-white',
                        'bg-gray-400 text-white',
                        'bg-amber-600 text-white',
                      ]
                      return (
                        <div key={rank} className="flex items-center gap-1 flex-1 min-w-0" title={entry ? `${holder?.name ?? '不明'} ${entry.hours}h` : ''}>
                          {entry ? (
                            <>
                              <span className={`text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${RANK_STYLES[rank - 1]}`}>{rank}</span>
                              <Avatar className="w-6 h-6 flex-shrink-0">
                                <AvatarImage src={holder?.avatar_url ?? undefined} />
                                <AvatarFallback className={`text-[8px] font-bold ${isMe ? 'bg-orange-200 text-orange-700' : 'bg-gray-200 text-gray-600'}`}>{holder?.name?.charAt(0) ?? '?'}</AvatarFallback>
                              </Avatar>
                              <span className={`text-[11px] flex-shrink-0 ${isMe ? 'font-bold text-orange-500' : 'text-gray-400'}`}>{entry.hours}h</span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-300 text-center w-full">-</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import type { Phase, EmploymentType } from '@/types/database'

interface MilestoneRow {
  phase: Phase
  employment_type: EmploymentType
  end_hours: number
}

interface Props {
  initialMilestones: MilestoneRow[]
}

const PHASES: Phase[] = ['4月', '5月〜6月', '7月〜8月']

const PHASE_LABELS: Record<EmploymentType, Record<Phase, string>> = {
  '社員': { '4月': '1ヶ月目', '5月〜6月': '2〜3ヶ月目', '7月〜8月': '4〜5ヶ月目' },
  'メイト': { '4月': 'ステージ1', '5月〜6月': 'ステージ2', '7月〜8月': 'ステージ3' },
}

const PHASE_DESCRIPTIONS: Record<Phase, string> = {
  '4月':     '入社後 〜 このフェーズ完了まで',
  '5月〜6月': '前フェーズ完了後 〜 このフェーズ完了まで',
  '7月〜8月': '前フェーズ完了後 〜 このフェーズ完了まで',
}

type ValuesMap = Record<EmploymentType, Record<Phase, string>>

function initValues(milestones: MilestoneRow[]): ValuesMap {
  const result: ValuesMap = {
    '社員': {} as Record<Phase, string>,
    'メイト': {} as Record<Phase, string>,
  }
  for (const type of ['社員', 'メイト'] as EmploymentType[]) {
    for (const phase of PHASES) {
      const row = milestones.find(m => m.phase === phase && m.employment_type === type)
      result[type][phase] = String(row?.end_hours ?? '')
    }
  }
  return result
}

export function MilestoneSettings({ initialMilestones }: Props) {
  const [values, setValues] = useState<ValuesMap>(() => initValues(initialMilestones))
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  const getStartHours = (type: EmploymentType, phaseIndex: number): number => {
    if (phaseIndex === 0) return 0
    const prevPhase = PHASES[phaseIndex - 1]
    return Number(values[type][prevPhase]) || 0
  }

  const handleSave = (employmentType: EmploymentType) => {
    let prev = 0
    for (const phase of PHASES) {
      const val = Number(values[employmentType][phase])
      if (!val || val <= 0) {
        toast.error(`${PHASE_LABELS[employmentType][phase]}フェーズの目標時間を入力してください`)
        return
      }
      if (val <= prev) {
        toast.error(`${PHASE_LABELS[employmentType][phase]}フェーズの目標時間は前フェーズより大きい値にしてください`)
        return
      }
      prev = val
    }

    startTransition(async () => {
      const updates = PHASES.map(phase => ({
        phase,
        employment_type: employmentType,
        end_hours: Number(values[employmentType][phase]),
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('phase_milestones')
        .upsert(updates, { onConflict: 'phase,employment_type' })

      if (error) {
        toast.error('保存に失敗しました')
        return
      }
      toast.success(`${employmentType}のマイルストーンを保存しました`)
    })
  }

  const renderForm = (employmentType: EmploymentType) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700">
          {employmentType === 'メイト' ? 'ステージ別' : '月次別'} 標準完了目標時間
        </CardTitle>
        <CardDescription className="text-xs">
          累積勤務時間がこの値に達するまでに、各{employmentType === 'メイト' ? 'ステージ' : 'フェーズ'}を完了していることが標準ペースです。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PHASES.map((phase, i) => {
          const startHours = getStartHours(employmentType, i)
          const endHours = Number(values[employmentType][phase]) || 0
          const label = PHASE_LABELS[employmentType][phase]
          return (
            <div key={phase} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {startHours}h → {endHours > 0 ? `${endHours}h` : '—'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">{PHASE_DESCRIPTIONS[phase]}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">完了目標</span>
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    type="number"
                    min={startHours + 1}
                    value={values[employmentType][phase]}
                    onChange={e => setValues(prev => ({
                      ...prev,
                      [employmentType]: { ...prev[employmentType], [phase]: e.target.value },
                    }))}
                    className="w-24 h-9 rounded-md border border-input bg-background px-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <span className="text-sm text-gray-500">h</span>
                </div>
              </div>
            </div>
          )
        })}

        <div className="pt-2 border-t">
          <Button
            onClick={() => handleSave(employmentType)}
            disabled={isPending}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isPending ? '保存中...' : '保存する'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="p-4 space-y-4">
      <Tabs defaultValue="新卒">
        <TabsList className="w-full">
          <TabsTrigger value="新卒" className="flex-1">新卒</TabsTrigger>
          <TabsTrigger value="メイト" className="flex-1">メイト</TabsTrigger>
        </TabsList>
        <TabsContent value="新卒" className="mt-4">
          {renderForm('社員')}
        </TabsContent>
        <TabsContent value="メイト" className="mt-4">
          {renderForm('メイト')}
          <Card className="bg-gray-50 border-gray-200 mt-4">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-gray-700">設定例：</span>
                ステージ1完了 200h、ステージ2完了 400h、ステージ3完了 700h
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">
            変更はダッシュボードの標準進捗表示にすぐ反映されます。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

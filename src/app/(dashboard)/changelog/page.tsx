import { readFileSync } from 'fs'
import path from 'path'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'
import { Clock } from 'lucide-react'

export const metadata = {
  title: '更新履歴 | Growth Driver',
}

export const dynamic = 'force-dynamic'

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0
  for (const line of lines) {
    const trimmed = line
    if (/^# /.test(trimmed)) {
      elements.push(<h1 key={key++} className="text-2xl font-bold text-gray-800 mt-4 mb-3">{trimmed.slice(2)}</h1>)
    } else if (/^## /.test(trimmed)) {
      elements.push(
        <div key={key++} className="mt-6 mb-2 flex items-center gap-2">
          <div className="w-1 h-6 bg-orange-500 rounded-full" />
          <h2 className="text-lg font-bold text-gray-800">{trimmed.slice(3)}</h2>
        </div>
      )
    } else if (/^### /.test(trimmed)) {
      elements.push(<h3 key={key++} className="text-sm font-semibold text-orange-600 mt-3 mb-1">{trimmed.slice(4)}</h3>)
    } else if (/^- /.test(trimmed)) {
      // インライン **太字** を処理
      const text = trimmed.slice(2)
      const parts = text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="text-gray-900">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )
      elements.push(
        <li key={key++} className="text-sm text-gray-700 leading-relaxed pl-2 ml-4 list-disc">{parts}</li>
      )
    } else if (trimmed === '---') {
      elements.push(<hr key={key++} className="my-4 border-gray-200" />)
    } else if (trimmed.trim() === '') {
      elements.push(<div key={key++} className="h-1" />)
    } else {
      elements.push(<p key={key++} className="text-sm text-gray-700">{trimmed}</p>)
    }
  }
  return elements
}

export default async function ChangelogPage() {
  let content = ''
  try {
    const filePath = path.join(process.cwd(), 'CHANGELOG.md')
    content = readFileSync(filePath, 'utf-8')
  } catch {
    content = '# 更新履歴\n\n読み込みに失敗しました。'
  }

  return (
    <>
      <TopBar title="更新履歴" hideNotificationBell />
      <div className="p-4 max-w-2xl mx-auto">
        <Card>
          <CardContent className="px-5 py-5">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>このページは常に最新の状態に更新されます</span>
            </div>
            <div className="prose prose-sm max-w-none">
              {renderMarkdown(content)}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

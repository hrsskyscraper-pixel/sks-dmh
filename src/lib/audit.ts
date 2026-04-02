import { createAdminClient } from '@/lib/supabase/admin'

export async function writeAuditLog(params: {
  action: string
  actorId: string
  targetId?: string
  details?: Record<string, unknown>
}) {
  const db = createAdminClient()
  await db.from('admin_audit_log').insert({
    action: params.action,
    actor_id: params.actorId,
    target_id: params.targetId ?? null,
    details: params.details ?? {},
  })
}

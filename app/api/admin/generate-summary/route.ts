import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { generateLocationSummary } from "@/lib/locationSummary"

// POST /api/admin/generate-summary  (admin) — generate a summary for a community
// + period NOW and queue it for review (does not send). Used to test the flow
// without waiting for the cron.
export const runtime = "nodejs"

export async function POST(req: Request) {
  let body: { communityId?: string; from?: string; to?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const { communityId, from, to } = body
  if (!communityId || !from || !to) return NextResponse.json({ error: "communityId, from, to required" }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const { data: adminRow } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: "admin only" }, { status: 403 })

  const gen = await generateLocationSummary(supabase, communityId, from, to)
  if (!gen.ok) return NextResponse.json({ error: gen.error }, { status: gen.status })

  const { data: settings } = await supabase.from("community_settings")
    .select("summary_recipients").eq("community_id", communityId).maybeSingle()

  const { data: row, error } = await supabase.from("summary_review_queue").upsert({
    community_id: communityId, period_from: from, period_to: to,
    summary: gen.summary, meta: gen.meta, total_records: gen.totalRecords,
    status: "pending", recipients: (settings as any)?.summary_recipients || [],
    generated_at: new Date().toISOString(),
  }, { onConflict: "community_id,period_from,period_to" }).select("id").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (row as any)?.id })
}

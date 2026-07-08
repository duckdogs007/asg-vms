import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { renderSummaryEmailHtml } from "@/lib/locationSummary"

// POST /api/admin/send-summary  (admin) — approve a queued summary and email it
// to the recipients, then mark it sent. Human-in-the-loop release step.
export const runtime = "nodejs"

export async function POST(req: Request) {
  let body: { queueId?: string; recipients?: string[] }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }) }
  if (!body.queueId) return NextResponse.json({ ok: false, error: "queueId required" }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 })
  const { data: adminRow } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ ok: false, error: "admin only" }, { status: 403 })

  const { data: q } = await supabase.from("summary_review_queue").select("*").eq("id", body.queueId).maybeSingle()
  if (!q) return NextResponse.json({ ok: false, error: "Queue entry not found" }, { status: 404 })
  const row = q as any

  const recipients = (body.recipients?.length ? body.recipients : row.recipients) || []
  if (recipients.length === 0) return NextResponse.json({ ok: false, error: "No recipients configured for this summary." }, { status: 400 })

  const communityName = row.meta?.community || "the property"
  const result = await sendEmail({
    to:      recipients,
    subject: `ASG-PSP — Monthly Operations Summary · ${communityName} · ${row.period_from} to ${row.period_to}`,
    html:    renderSummaryEmailHtml(row.summary, row.meta),
  })

  const now = new Date().toISOString()
  await supabase.from("audit_logs").insert({
    user_email:    user.email || "unknown",
    action:        result.ok ? "email_sent" : "email_failed",
    resource_type: "Summary",
    resource_id:   row.id,
    detail:        result.ok
      ? `Monthly summary for ${communityName} (${row.period_from}–${row.period_to}) sent to ${recipients.join(", ")}`
      : `Monthly summary email FAILED: ${result.error || "unknown error"}`,
    created_at:    now,
  })

  if (!result.ok) return NextResponse.json({ ok: false, error: `Email delivery failed: ${result.error || "unknown error"}` }, { status: 502 })

  await supabase.from("summary_review_queue").update({
    status: "sent", reviewed_by: user.email, reviewed_at: now, sent_at: now,
  }).eq("id", row.id)

  return NextResponse.json({ ok: true, recipients })
}

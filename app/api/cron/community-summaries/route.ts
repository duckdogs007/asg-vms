import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateLocationSummary } from "@/lib/locationSummary"

// GET /api/cron/community-summaries
// Scheduled daily (see vercel.json). For each community whose policy has the
// monthly summary enabled and whose send-day is today, generate last month's
// summary and QUEUE it for supervisor review — it is never auto-sent to a client.
export const runtime = "nodejs"

export async function GET(req: Request) {
  // Vercel Cron sends "Authorization: Bearer ${CRON_SECRET}" when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization") || ""
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase service role not configured" }, { status: 500 })
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const now = new Date()
  const y = now.getUTCFullYear(), m = now.getUTCMonth() // current month 0-11
  const todayDom = now.getUTCDate()
  // Previous calendar month.
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
  const to   = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const { data: settings } = await supabase.from("community_settings")
    .select("community_id, summary_enabled, summary_frequency, summary_send_day, summary_recipients")
    .eq("summary_enabled", true)

  const results: any[] = []
  for (const s of (settings || []) as any[]) {
    // v1: monthly only. Trigger when today matches the configured send-day.
    if (s.summary_frequency !== "monthly") { results.push({ community_id: s.community_id, skipped: "not monthly" }); continue }
    if (Number(s.summary_send_day) !== todayDom) continue

    // Skip if already queued for this community + period.
    const { data: existing } = await supabase.from("summary_review_queue")
      .select("id").eq("community_id", s.community_id).eq("period_from", from).eq("period_to", to).maybeSingle()
    if (existing) { results.push({ community_id: s.community_id, skipped: "already queued" }); continue }

    const gen = await generateLocationSummary(supabase, s.community_id, from, to)
    if (!gen.ok) { results.push({ community_id: s.community_id, error: gen.error }); continue }

    const { error } = await supabase.from("summary_review_queue").insert({
      community_id: s.community_id, period_from: from, period_to: to,
      summary: gen.summary, meta: gen.meta, total_records: gen.totalRecords,
      status: "pending", recipients: s.summary_recipients || [],
    })
    results.push({ community_id: s.community_id, queued: !error, error: error?.message })
  }

  return NextResponse.json({ ok: true, period: { from, to }, ran: results.length, results })
}

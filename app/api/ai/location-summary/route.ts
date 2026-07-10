import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { generateLocationSummary } from "@/lib/locationSummary"
import { ADMIN_EMAILS } from "@/lib/admin"

// POST /api/ai/location-summary
// On-demand AI ops summary for a community + date range. Auth + caching live
// here; the generation itself is the shared generateLocationSummary().
export const runtime = "nodejs"

type Body = { communityId?: string; from?: string; to?: string; force?: boolean }

export async function POST(req: Request) {
  let input: Body
  try { input = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  const { communityId, from, to } = input
  if (!communityId || !from || !to) {
    return NextResponse.json({ error: "communityId, from and to are required" }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // Authorization: only reviewers (admin OR admin_super/supervisor) may generate
  // or read an ops summary — it aggregates cross-community activity and spends AI
  // budget. Mirrors checkCanApprove().
  let authorized = ADMIN_EMAILS.includes(user.email || "")
  if (!authorized) {
    const { data: adminRow } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle()
    authorized = !!adminRow
  }
  if (!authorized) {
    const { data: role } = await supabase.from("user_assignments").select("role")
      .eq("user_id", user.id).in("role", ["admin_super", "supervisor"]).maybeSingle()
    authorized = !!role
  }
  if (!authorized) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  // Return the cached summary unless a regenerate was requested.
  if (!input.force) {
    const { data: cached } = await supabase.from("ai_location_summaries")
      .select("summary, meta, generated_at, generated_by")
      .eq("community_id", communityId).eq("period_from", from).eq("period_to", to)
      .maybeSingle()
    if (cached) {
      const c = cached as any
      return NextResponse.json({
        summary: c.summary, meta: c.meta, cached: true,
        generatedAt: c.generated_at, generatedBy: c.generated_by,
      })
    }
  }

  const result = await generateLocationSummary(supabase, communityId, from, to)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}) },
      { status: result.status },
    )
  }

  const generatedAt = new Date().toISOString()
  // Write the cache with the service-role client so the tightened RLS on
  // ai_location_summaries (admin-only writes) can't be poisoned by users, while
  // supervisors still get their result cached. Falls back to the user client.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const writer = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } })
    : supabase
  await writer.from("ai_location_summaries").upsert({
    community_id: communityId, period_from: from, period_to: to,
    summary: result.summary, meta: result.meta, total_records: result.totalRecords,
    generated_at: generatedAt, generated_by: user.email || null,
  }, { onConflict: "community_id,period_from,period_to" })

  return NextResponse.json({ summary: result.summary, meta: result.meta, cached: false, generatedAt, generatedBy: user.email || null })
}

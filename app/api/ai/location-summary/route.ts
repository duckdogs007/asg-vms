import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { generateLocationSummary } from "@/lib/locationSummary"

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
  await supabase.from("ai_location_summaries").upsert({
    community_id: communityId, period_from: from, period_to: to,
    summary: result.summary, meta: result.meta, total_records: result.totalRecords,
    generated_at: generatedAt, generated_by: user.email || null,
  }, { onConflict: "community_id,period_from,period_to" })

  return NextResponse.json({ summary: result.summary, meta: result.meta, cached: false, generatedAt, generatedBy: user.email || null })
}

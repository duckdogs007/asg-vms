import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// GET — current user's assignment row (or null)
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data, error } = await supabase
    .from("user_assignments")
    .select("community_id, role, updated_at")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignment: data || null, last_sign_in_at: user.last_sign_in_at })
}

// POST — upsert the CURRENT user's own assignment.
// body: { community_id?: string|null }
// role is intentionally NOT accepted here — only admins can set role via
// PATCH /api/admin/users. set_my_assignment() never writes role.
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    community_id?: string | null
  } | null

  const cid = body?.community_id ?? null
  if (cid !== null && typeof cid !== "string") {
    return NextResponse.json({ error: "community_id must be a string or null" }, { status: 400 })
  }

  const { error } = await supabase.rpc("set_my_assignment", { p_community_id: cid })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

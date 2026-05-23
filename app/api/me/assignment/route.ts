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

// POST — upsert the CURRENT user's own assignment
// body: { community_id?: string|null, role?: string|null }
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    community_id?: string | null
    role?: string | null
  } | null

  // RLS only lets admins write user_assignments. For self-assign we need
  // a SECURITY DEFINER RPC or service-role. Going with the RPC.
  // Until that exists, only admins can save. (See follow-up note.)
  const { error } = await supabase.rpc("set_my_assignment", {
    p_community_id: body?.community_id ?? null,
    p_role:         body?.role         ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

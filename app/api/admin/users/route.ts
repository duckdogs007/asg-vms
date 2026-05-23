import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ADMIN_EMAILS } from "@/lib/admin"

export const dynamic = "force-dynamic"

async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) }
  if (!ADMIN_EMAILS.includes(user.email || ""))
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey)
    return { error: NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 }) }
  return {
    admin: createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const admin = gate.admin!

  // Pull all users (paginate if you ever exceed 1000)
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Admin allowlist tag
  const { data: admins } = await admin.from("admin_users").select("user_id")
  const adminSet = new Set((admins || []).map(a => a.user_id))

  // Assignments + community name lookup
  const { data: assigns } = await admin
    .from("user_assignments")
    .select("user_id, community_id, role")
  const assignMap = new Map(
    (assigns || []).map(a => [a.user_id as string, { community_id: a.community_id as string | null, role: a.role as string | null }])
  )

  const { data: communities } = await admin.from("communities").select("id, name")
  const commName = new Map((communities || []).map(c => [c.id as string, c.name as string]))

  // updated_at is bumped by GoTrue on every session/token refresh, so it
  // reflects real activity. last_sign_in_at only moves on fresh sign-in.
  const users = (data.users || []).map(u => {
    const a = assignMap.get(u.id)
    return {
      id:                  u.id,
      email:               u.email,
      created_at:          u.created_at,
      last_sign_in_at:     u.last_sign_in_at,
      updated_at:          u.updated_at,
      email_confirmed_at:  u.email_confirmed_at,
      banned_until:        (u as any).banned_until || null,
      user_metadata:       u.user_metadata || {},
      is_admin:            adminSet.has(u.id),
      community_id:        a?.community_id || null,
      community:           a?.community_id ? (commName.get(a.community_id) || null) : null,
      role:                a?.role || null,
    }
  })

  return NextResponse.json({ users })
}

// PATCH /api/admin/users  body: { user_id, community_id?: string|null, role?: string|null }
// Upserts a row in user_assignments.
export async function PATCH(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const admin = gate.admin!

  const body = await req.json().catch(() => null) as {
    user_id?: string
    community_id?: string | null
    role?: string | null
  } | null
  if (!body?.user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 })
  }

  const { error } = await admin
    .from("user_assignments")
    .upsert({
      user_id:      body.user_id,
      community_id: body.community_id ?? null,
      role:         body.role ?? null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: "user_id" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

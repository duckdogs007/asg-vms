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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const admin = gate.admin!

  const body = await req.json().catch(() => null) as {
    user_id?: string
    community_id?: string | null
    role?: string | null
  } | null

  if (!body?.user_id || !UUID_RE.test(body.user_id)) {
    return NextResponse.json({ error: "user_id must be a UUID" }, { status: 400 })
  }
  if (body.community_id !== undefined && body.community_id !== null && !UUID_RE.test(body.community_id)) {
    return NextResponse.json({ error: "community_id must be a UUID or null" }, { status: 400 })
  }
  if (body.role !== undefined && body.role !== null && body.role !== "admin_super") {
    return NextResponse.json({ error: "role must be null or 'admin_super'" }, { status: 400 })
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

// POST /api/admin/users
// body: { email, password, full_name?, community_id?: string|null, is_admin?: boolean }
// Creates a new auth user (pre-confirmed so they can sign in immediately),
// optionally assigns a community and/or grants admin.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const admin = gate.admin!

  const body = await req.json().catch(() => null) as {
    email?: string
    password?: string
    full_name?: string
    community_id?: string | null
    is_admin?: boolean
  } | null

  const email    = body?.email?.trim().toLowerCase() || ""
  const password = body?.password || ""

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }
  if (body?.community_id != null && !UUID_RE.test(body.community_id)) {
    return NextResponse.json({ error: "community_id must be a UUID or null" }, { status: 400 })
  }

  // Create the auth user, email pre-confirmed so they can sign in right away.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: body?.full_name?.trim() ? { full_name: body.full_name.trim() } : {},
  })
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message || "Failed to create user" }, { status: 500 })
  }
  const userId = created.user.id

  // Optional community assignment
  if (body?.community_id) {
    const { error: aErr } = await admin
      .from("user_assignments")
      .upsert({ user_id: userId, community_id: body.community_id, role: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    if (aErr) return NextResponse.json({ error: `User created, but assignment failed: ${aErr.message}`, user_id: userId }, { status: 500 })
  }

  // Optional admin grant
  if (body?.is_admin) {
    const { error: adErr } = await admin
      .from("admin_users")
      .upsert({ user_id: userId, email }, { onConflict: "user_id" })
    if (adErr) return NextResponse.json({ error: `User created, but admin grant failed: ${adErr.message}`, user_id: userId }, { status: 500 })
  }

  return NextResponse.json({ ok: true, user_id: userId })
}

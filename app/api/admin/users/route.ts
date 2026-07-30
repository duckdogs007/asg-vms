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

// Gate for CREATING users. Full admins (ADMIN_EMAILS, admin_users, or role
// admin_super) may create any account. Supervisors may create scoped accounts —
// Officer/Guest, in their own community only, never admin — enforced in POST.
async function requireUserCreator() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return { error: NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 }) }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let isFull = ADMIN_EMAILS.includes(user.email || "")
  if (!isFull) {
    const { data: adminRow } = await admin.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle()
    isFull = !!adminRow
  }
  const { data: assign } = await admin.from("user_assignments").select("role, community_id").eq("user_id", user.id).maybeSingle()
  const role = (assign as any)?.role as string | null | undefined
  if (isFull || role === "admin_super") {
    return { admin, level: "full", actorEmail: user.email || "" }
  }
  if (role === "supervisor") {
    return { admin, level: "supervisor", actorEmail: user.email || "", communityId: (assign as any)?.community_id ?? null }
  }
  return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
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

  // True last login / last logout per user, aggregated from auth.audit_log_entries
  // by the admin_login_logout_events() SECURITY DEFINER function (the auth schema
  // isn't reachable via PostgREST). Keyed by email (lowercased).
  const { data: events } = await admin.rpc("admin_login_logout_events")
  type EventRow = { email: string; last_login: string | null; last_logout: string | null }
  const eventMap = new Map(
    ((events || []) as EventRow[]).map(e => [(e.email || "").toLowerCase(), e])
  )

  // updated_at is bumped by GoTrue on every session/token refresh, so it
  // reflects real activity. last_sign_in_at only moves on fresh sign-in.
  const users = (data.users || []).map(u => {
    const a  = assignMap.get(u.id)
    const ev = eventMap.get((u.email || "").toLowerCase())
    return {
      id:                  u.id,
      email:               u.email,
      created_at:          u.created_at,
      last_sign_in_at:     u.last_sign_in_at,
      updated_at:          u.updated_at,
      // Prefer the audit-log login event; fall back to GoTrue's last_sign_in_at.
      last_login:          ev?.last_login || u.last_sign_in_at || null,
      last_logout:         ev?.last_logout || null,
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
  const VALID_ROLES = [null, "admin_super", "supervisor", "property_manager", "officer", "guest"]
  if (body.role !== undefined && !VALID_ROLES.includes(body.role ?? null)) {
    return NextResponse.json({ error: "role must be one of: null, admin_super, supervisor, property_manager, officer, guest" }, { status: 400 })
  }

  // Fetch existing row so we can do a partial update — only overwrite the
  // fields that were explicitly sent in this request.
  const { data: existing } = await admin
    .from("user_assignments")
    .select("community_id, role")
    .eq("user_id", body.user_id)
    .maybeSingle()

  const { error } = await admin
    .from("user_assignments")
    .upsert({
      user_id:      body.user_id,
      community_id: body.community_id !== undefined ? (body.community_id ?? null) : (existing?.community_id ?? null),
      role:         body.role         !== undefined ? (body.role         ?? null) : (existing?.role         ?? null),
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
  const gate = await requireUserCreator()
  if ("error" in gate) return gate.error
  const admin = gate.admin

  const body = await req.json().catch(() => null) as {
    email?: string
    password?: string
    full_name?: string
    community_id?: string | null
    is_admin?: boolean
    role?: string | null   // null/"officer" = officer, else guest/supervisor/property_manager/admin_super
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

  // Normalize the requested role ("officer" is represented as null).
  const VALID_ROLES = [null, "guest", "supervisor", "property_manager", "admin_super"]
  let role: string | null = body?.role === undefined || body?.role === "officer" ? null : body.role
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 })
  }
  let communityId: string | null = body?.community_id ?? null
  let grantAdmin = !!body?.is_admin

  // ── Supervisor guardrails (server-enforced; the client cannot bypass) ──
  // Supervisors may only create Officer/Guest accounts, always scoped to their
  // OWN community, and can never grant admin.
  if (gate.level === "supervisor") {
    if (role !== null && role !== "guest") {
      return NextResponse.json({ error: "Supervisors can only add Officer or Guest accounts." }, { status: 403 })
    }
    if (gate.communityId) {
      // Community-scoped supervisor: new user is forced into their community.
      communityId = gate.communityId
    } else {
      // All-locations supervisor: must choose a valid community for the new user.
      if (!communityId) {
        return NextResponse.json({ error: "Choose which community this user belongs to." }, { status: 400 })
      }
      const { data: exists } = await admin.from("communities").select("id").eq("id", communityId).maybeSingle()
      if (!exists) return NextResponse.json({ error: "Unknown community." }, { status: 400 })
    }
    grantAdmin = false
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

  // Community + role assignment
  if (communityId || role !== null) {
    const { error: aErr } = await admin
      .from("user_assignments")
      .upsert({ user_id: userId, community_id: communityId, role, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    if (aErr) return NextResponse.json({ error: `User created, but assignment failed: ${aErr.message}`, user_id: userId }, { status: 500 })
  }

  // Optional admin grant (full admins only)
  if (grantAdmin) {
    const { error: adErr } = await admin
      .from("admin_users")
      .upsert({ user_id: userId, email }, { onConflict: "user_id" })
    if (adErr) return NextResponse.json({ error: `User created, but admin grant failed: ${adErr.message}`, user_id: userId }, { status: 500 })
  }

  // Audit trail — who created whom.
  await admin.from("audit_logs").insert({
    user_email:    gate.actorEmail || "unknown",
    action:        "created",
    resource_type: "User",
    resource_id:   userId,
    detail:        `Created ${role || "officer"} ${email}${communityId ? "" : " (no community)"}${gate.level === "supervisor" ? " [supervisor]" : ""}`,
    created_at:    new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, user_id: userId })
}

// DELETE /api/admin/users  body: { user_id }
// Permanently removes an auth user and their assignment/admin rows. Blocks
// self-deletion and deletion of built-in allowlist admins.
export async function DELETE(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const admin = gate.admin!

  // Who is performing this (for the self-check + audit trail).
  const serverClient = await createSupabaseServerClient()
  const { data: { user: actor } } = await serverClient.auth.getUser()

  const body = await req.json().catch(() => null) as { user_id?: string } | null
  if (!body?.user_id || !UUID_RE.test(body.user_id)) {
    return NextResponse.json({ error: "user_id must be a UUID" }, { status: 400 })
  }
  if (actor && actor.id === body.user_id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 })
  }

  // Look up the target's email to protect built-in admins and to log it.
  const { data: target, error: getErr } = await admin.auth.admin.getUserById(body.user_id)
  if (getErr || !target?.user) {
    return NextResponse.json({ error: getErr?.message || "User not found" }, { status: 404 })
  }
  const targetEmail = target.user.email || ""
  if (ADMIN_EMAILS.includes(targetEmail)) {
    return NextResponse.json({ error: "This is a protected admin account and can't be deleted here." }, { status: 400 })
  }

  // Clean up app-side rows first, then the auth user.
  await admin.from("user_assignments").delete().eq("user_id", body.user_id)
  await admin.from("admin_users").delete().eq("user_id", body.user_id)

  const { error: delErr } = await admin.auth.admin.deleteUser(body.user_id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  await admin.from("audit_logs").insert({
    user_email:    actor?.email || "unknown",
    action:        "deleted",
    resource_type: "User",
    resource_id:   body.user_id,
    detail:        `Deleted user ${targetEmail}`,
    created_at:    new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ADMIN_EMAILS } from "@/lib/admin"

export const dynamic = "force-dynamic"

// Online = session token refreshed within this window
const ONLINE_WINDOW_MIN = 15

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (!ADMIN_EMAILS.includes(user.email || ""))
    return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey)
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. All auth users
  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

  // 2. Latest login + logout per email from auth.audit_log_entries
  //    (must run as RPC; PostgREST can't reach the auth schema directly)
  const { data: events, error: eventsErr } = await admin.rpc("admin_login_logout_events")
  if (eventsErr) return NextResponse.json({ error: `audit log: ${eventsErr.message}` }, { status: 500 })

  type EventRow = { email: string; last_login: string | null; last_logout: string | null }
  const eventMap = new Map<string, EventRow>(
    (events as EventRow[] | null || []).map(r => [r.email?.toLowerCase() || "", r])
  )

  // 3. Communities (id → name)
  const { data: communities } = await admin.from("communities").select("id, name")
  const commName = new Map((communities || []).map(c => [c.id as string, c.name as string]))

  // 4. Explicit assignments set on /admin/system Users tab
  const { data: assigns } = await admin
    .from("user_assignments")
    .select("user_id, community_id, role")
  const assignMap = new Map(
    (assigns || []).map(a => [a.user_id as string, { community_id: a.community_id as string | null, role: a.role as string | null }])
  )

  // 5. Stitch
  const now = Date.now()
  const onlineCutoff = now - ONLINE_WINDOW_MIN * 60 * 1000

  const users = (usersData.users || []).map(u => {
    const email = u.email || ""
    const ev = eventMap.get(email.toLowerCase())
    const updatedAt = u.updated_at ? new Date(u.updated_at).getTime() : 0
    const local = email.split("@")[0]?.toLowerCase() || ""

    const a = assignMap.get(u.id)
    const communityId = a?.community_id || null

    // off_duty_at should only show if the user is currently signed out —
    // i.e. their last logout is NEWER than their last login. Otherwise the
    // displayed "Off Duty" would be a stale past date even though they're
    // active right now. Same for is_online.
    const loginTs  = ev?.last_login  ? new Date(ev.last_login).getTime()  : 0
    const logoutTs = ev?.last_logout ? new Date(ev.last_logout).getTime() : 0
    const offDutyAt = logoutTs > loginTs ? ev?.last_logout ?? null : null

    return {
      id:           u.id,
      email,
      display_name: derivePersonName(local),
      community_id: communityId,
      community:    communityId ? (commName.get(communityId) || null) : null,
      role:         a?.role || null,
      on_duty_at:   ev?.last_login || null,
      off_duty_at:  offDutyAt,
      // online if their session refreshed in the last ONLINE_WINDOW_MIN
      // AND they haven't logged out since
      is_online:    updatedAt >= onlineCutoff && logoutTs <= loginTs,
    }
  })

  return NextResponse.json({ users })
}

// "dconner" → "D. Conner"; "elnathanuspriggs" → "E. Lnathanuspriggs"
function derivePersonName(local: string): string {
  if (!local) return ""
  if (local.length < 2) return local.toUpperCase()
  const initial = local[0].toUpperCase()
  const rest = local.slice(1)
  return `${initial}. ${rest[0].toUpperCase()}${rest.slice(1).toLowerCase()}`
}

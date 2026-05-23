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

  // 4. Most-recent officer_daily_logs per officer_name (last 90 days)
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: logs } = await admin
    .from("officer_daily_logs")
    .select("officer_name, community_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })

  // Build a guess: per surname (lowercased), the most recent community_id we saw.
  const surnameToCommunity = new Map<string, string>()
  for (const row of (logs || [])) {
    const officerName = (row.officer_name || "").toLowerCase()
    if (!officerName || !row.community_id) continue
    // Take the LAST token of the officer name as surname guess
    const tokens = officerName.split(/\s+/).filter(Boolean)
    const surname = tokens[tokens.length - 1]
    if (surname && !surnameToCommunity.has(surname)) {
      surnameToCommunity.set(surname, row.community_id)
    }
  }

  // 5. Stitch
  const now = Date.now()
  const onlineCutoff = now - ONLINE_WINDOW_MIN * 60 * 1000

  const users = (usersData.users || []).map(u => {
    const email = u.email || ""
    const ev = eventMap.get(email.toLowerCase())
    const updatedAt = u.updated_at ? new Date(u.updated_at).getTime() : 0

    // Surname guess from email local-part: strip the first char (e.g.
    // "dconner" → "conner", "jhall" → "hall"). Falls back to full local-part.
    const local = email.split("@")[0]?.toLowerCase() || ""
    const surnameGuess = local.length >= 2 ? local.slice(1) : local

    const communityId = surnameToCommunity.get(surnameGuess) || null

    return {
      id:           u.id,
      email,
      display_name: derivePersonName(local),
      community_id: communityId,
      community:    communityId ? (commName.get(communityId) || null) : null,
      on_duty_at:   ev?.last_login || null,
      off_duty_at:  ev?.last_logout || null,
      // online if their session refreshed in the last ONLINE_WINDOW_MIN
      // AND there isn't a logout newer than that refresh
      is_online:    updatedAt >= onlineCutoff && !(
        ev?.last_logout && new Date(ev.last_logout).getTime() > updatedAt
      ),
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

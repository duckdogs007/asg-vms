import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendEmail, buildWatchlistEmailHtml, logEmailDelivery } from "@/lib/email"

// POST /api/watchlist/notify  body: { id: string, event?: "added" | "updated" | "manual" }
//
// Looks up the watchlist row by id, finds active community-scoped
// notification_recipients, and sends a formatted email. Auth-required.
// `event` is reflected in the email subject + header so recipients can
// tell new bans from updates and manual resends.
export async function POST(req: Request) {
  let input: { id?: string; event?: "added" | "updated" | "manual" }
  try { input = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  if (!input?.id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const event = input.event || "manual"

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: row, error: rErr } = await supabase
    .from("watchlist")
    .select("id, first_name, last_name, dob, oln, sex, race, reason, comments, community_id, banned_by, ban_date, firearm_flag, photo_url")
    .eq("id", input.id)
    .maybeSingle()
  if (rErr || !row) {
    return NextResponse.json({ error: rErr?.message || "watchlist entry not found" }, { status: 404 })
  }
  const w = row as {
    id: string; first_name: string | null; last_name: string | null;
    dob: string | null; oln: string | null; sex: string | null; race: string | null;
    reason: string | null; comments: string | null; community_id: string | null;
    banned_by: string | null; ban_date: string | null; firearm_flag: boolean | null;
    photo_url: string | null
  }

  let communityName = ""
  if (w.community_id) {
    const { data: c } = await supabase
      .from("communities").select("name").eq("id", w.community_id).maybeSingle()
    communityName = ((c as { name?: string } | null)?.name) || ""
  }

  const { data: recList } = await supabase
    .from("notification_recipients")
    .select("email, communities")
    .eq("active", true)
  const recipients = (recList || [])
    .filter(r => !w.community_id || !(r as any).communities?.length || (r as any).communities.includes(w.community_id))
    .map(r => (r as any).email as string)
    .filter(Boolean)

  if (!recipients.length) {
    return NextResponse.json({ ok: true, sent: 0, note: "no active recipients" })
  }

  const headline = `${w.first_name || ""} ${w.last_name || ""}`.trim() || "Watchlist Entry"
  const verb     = event === "added" ? "Added" : event === "updated" ? "Updated" : "Notice"
  const subject  = `🚨 Watchlist ${verb} — ${headline}${communityName ? ` · ${communityName}` : ""}`
  const html     = buildWatchlistEmailHtml({
    first_name:   w.first_name,
    last_name:    w.last_name,
    dob:          w.dob,
    oln:          w.oln,
    sex:          w.sex,
    race:         w.race,
    reason:       w.reason,
    comments:     w.comments,
    community:    communityName || null,
    banned_by:    w.banned_by,
    ban_date:     w.ban_date,
    firearm_flag: w.firearm_flag,
    photo_url:    w.photo_url,
    event,
  })

  const result = await sendEmail({ to: recipients, subject, html, reply_to: user.email || undefined })

  await logEmailDelivery(supabase, {
    user_email:    user.email || null,
    resource_type: "Watchlist",
    resource_id:   w.id,
    recipients,
    result,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, sent: recipients.length, id: result.id })
}

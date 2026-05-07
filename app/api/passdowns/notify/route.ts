import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendEmail, buildPassdownEmailHtml } from "@/lib/email"

// POST /api/passdowns/notify  body: { id: string }
//
// Looks up the passdown_logs row by id, finds active notification_recipients
// scoped to the same community (or with no community filter), and sends a
// formatted email summary. Auth-required; the body only carries the id so
// the client can't dictate the email contents.
export async function POST(req: Request) {
  let input: { id?: string }
  try { input = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  if (!input?.id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // Look up the passdown
  const { data: passdown, error: pdErr } = await supabase
    .from("passdown_logs")
    .select("id, date, shift, officer_name, notes, community_id")
    .eq("id", input.id)
    .maybeSingle()
  if (pdErr || !passdown) {
    return NextResponse.json({ error: pdErr?.message || "passdown not found" }, { status: 404 })
  }

  const pd = passdown as {
    id: string; date: string | null; shift: string | null;
    officer_name: string | null; notes: string; community_id: string | null
  }

  // Look up community name (optional — used in the subject line)
  let communityName = ""
  if (pd.community_id) {
    const { data: c } = await supabase
      .from("communities").select("name").eq("id", pd.community_id).maybeSingle()
    communityName = ((c as { name?: string } | null)?.name) || ""
  }

  // Active recipients, optionally scoped to this community
  const { data: recList } = await supabase
    .from("notification_recipients")
    .select("email, communities")
    .eq("active", true)
  const recipients = (recList || [])
    .filter(r => !pd.community_id || !(r as any).communities?.length || (r as any).communities.includes(pd.community_id))
    .map(r => (r as any).email as string)
    .filter(Boolean)

  if (!recipients.length) {
    return NextResponse.json({ ok: true, sent: 0, note: "no active recipients" })
  }

  const subject = `📋 Passdown — ${communityName || "ASG VMS"} · ${pd.date || ""} · ${pd.shift || ""}`.trim()
  const html = buildPassdownEmailHtml({
    date:         pd.date,
    shift:        pd.shift,
    officer_name: pd.officer_name,
    community:    communityName || null,
    notes:        pd.notes || "",
  })

  const result = await sendEmail({ to: recipients, subject, html, reply_to: user.email || undefined })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, sent: recipients.length, id: result.id })
}

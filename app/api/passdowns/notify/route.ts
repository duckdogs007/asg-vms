import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendEmail, buildPassdownEmailHtml, logEmailDelivery } from "@/lib/email"

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

  // Recipients, resolved in priority order:
  //  1) the "Passdown" delivery list configured for this community
  //     (Admin → Post Orders → Report Delivery), so passdowns route the same
  //     way client reports do;
  //  2) the legacy active notification_recipients list (community-scoped);
  //  3) the ASG supervisors fallback so a passdown is never sent to nobody.
  let recipients: string[] = []

  if (pd.community_id) {
    const { data: rdr } = await supabase
      .from("report_delivery_recipients")
      .select("email")
      .eq("community_id", pd.community_id)
      .eq("report_type", "passdown")
    recipients = (rdr || []).map(r => (r as any).email as string).filter(Boolean)
  }

  if (!recipients.length) {
    const { data: recList } = await supabase
      .from("notification_recipients")
      .select("email, communities")
      .eq("active", true)
    recipients = (recList || [])
      .filter(r => !pd.community_id || !(r as any).communities?.length || (r as any).communities.includes(pd.community_id))
      .map(r => (r as any).email as string)
      .filter(Boolean)
  }

  if (!recipients.length) recipients = ["ASG-Supervisors@teamasg.com"]

  // De-dupe (case-insensitive) in case the same address appears in multiple lists.
  recipients = Array.from(new Map(recipients.map(e => [e.toLowerCase(), e])).values())

  const subject = `📋 Passdown — ${communityName || "ASG-PSP"} · ${pd.date || ""} · ${pd.shift || ""}`.trim()
  const html = buildPassdownEmailHtml({
    date:         pd.date,
    shift:        pd.shift,
    officer_name: pd.officer_name,
    community:    communityName || null,
    notes:        pd.notes || "",
  })

  const result = await sendEmail({ to: recipients, subject, html, reply_to: user.email || undefined })

  await logEmailDelivery(supabase, {
    user_email:    user.email || null,
    resource_type: "Passdown",
    resource_id:   pd.id,
    recipients,
    result,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, sent: recipients.length, id: result.id })
}

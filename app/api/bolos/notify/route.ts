import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendEmail, buildBoloEmailHtml, logEmailDelivery } from "@/lib/email"
import { createSignedUrlFor, EMAIL_SIGNED_TTL } from "@/lib/storage"

// POST /api/bolos/notify  body: { id: string }
//
// Looks up the bolos row by id, finds active notification_recipients
// scoped to the same community (or with no community filter), and sends
// a formatted email. Auth-required; the body only carries the id so
// the client can't spoof email contents.
export async function POST(req: Request) {
  let input: { id?: string }
  try { input = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  if (!input?.id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: bolo, error: bErr } = await supabase
    .from("bolos")
    .select("id, name, description, reason, vehicle, community_id, added_by, photo_url")
    .eq("id", input.id)
    .maybeSingle()
  if (bErr || !bolo) {
    return NextResponse.json({ error: bErr?.message || "bolo not found" }, { status: 404 })
  }
  const b = bolo as {
    id: string; name: string | null; description: string | null; reason: string | null;
    vehicle: string | null; community_id: string | null; added_by: string | null;
    photo_url: string | null
  }

  let communityName = ""
  if (b.community_id) {
    const { data: c } = await supabase
      .from("communities").select("name").eq("id", b.community_id).maybeSingle()
    communityName = ((c as { name?: string } | null)?.name) || ""
  }

  const { data: recList } = await supabase
    .from("notification_recipients")
    .select("email, communities")
    .eq("active", true)
  const recipients = (recList || [])
    .filter(r => !b.community_id || !(r as any).communities?.length || (r as any).communities.includes(b.community_id))
    .map(r => (r as any).email as string)
    .filter(Boolean)

  if (!recipients.length) {
    return NextResponse.json({ ok: true, sent: 0, note: "no active recipients" })
  }

  // Buckets are private (#16) — mint a long-lived signed URL for the inline
  // email image (~30 days, then expires). BOLO photos live in contact-photos.
  const photoUrl = b.photo_url
    ? await createSignedUrlFor(supabase, b.photo_url, "contact-photos", EMAIL_SIGNED_TTL)
    : null

  const headline = b.name || (b.description ? b.description.slice(0, 60) : "New BOLO")
  const subject  = `🔍 BOLO — ${headline}${communityName ? ` · ${communityName}` : ""}`
  const html = buildBoloEmailHtml({
    name:        b.name,
    description: b.description,
    reason:      b.reason,
    vehicle:     b.vehicle,
    community:   communityName || null,
    added_by:    b.added_by,
    photo_url:   photoUrl,
  })

  const result = await sendEmail({ to: recipients, subject, html, reply_to: user.email || undefined })

  await logEmailDelivery(supabase, {
    user_email:    user.email || null,
    resource_type: "BOLO",
    resource_id:   b.id,
    recipients,
    result,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, sent: recipients.length, id: result.id })
}

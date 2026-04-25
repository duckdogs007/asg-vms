import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

type AlertType = "watchlist_hit" | "incident_high_priority" | "panic_sos"

interface AlertPayload {
  type:         AlertType
  severity?:    "critical" | "high" | "medium"
  community_id?: string | null
  community?:    string
  subject?:      string
  body?:         string
  payload?:      Record<string, unknown>
}

// Sends via FormSubmit.co — no API key required.
// First-ever POST to a new recipient triggers a one-time confirmation email
// from FormSubmit; the recipient must click the activation link before later
// alerts will deliver. Subsequent alerts deliver automatically.
async function sendViaFormSubmit(
  recipient: string,
  subject: string,
  body: string,
  meta: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(recipient)}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        _subject:   subject,
        _template:  "table",
        _captcha:   "false",
        Alert:      subject,
        Message:    body,
        ...meta,
      }),
    })
    if (!r.ok) {
      const text = await r.text()
      return { ok: false, error: `FormSubmit ${r.status}: ${text.slice(0, 300)}` }
    }
    const json = await r.json().catch(() => ({}))
    if (json && json.success === "false") {
      return { ok: false, error: `FormSubmit refused: ${json.message || "unknown"}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export async function POST(req: Request) {
  let input: AlertPayload
  try { input = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  if (!input?.type) return NextResponse.json({ error: "type required" }, { status: 400 })

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: recList, error: recErr } = await supabase
    .from("notification_recipients").select("email,communities").eq("active", true)
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  const cid = input.community_id ?? null
  const recipients = (recList || [])
    .filter(r => !cid || !r.communities?.length || r.communities.includes(cid))
    .map(r => r.email as string)

  if (recipients.length === 0) {
    return NextResponse.json({ error: "no recipients in notification_recipients table" }, { status: 422 })
  }

  const subject = input.subject || `ASG VMS Alert — ${input.type.replace(/_/g, " ")}`
  const body    = input.body    || ""
  const meta    = { ...(input.payload || {}), TriggeredBy: user.email || "" }

  const results = await Promise.all(
    recipients.map(r => sendViaFormSubmit(r, subject, body, meta))
  )
  const failures = results.filter(r => !r.ok)
  const ok       = failures.length === 0

  await supabase.from("alerts").insert({
    type:         input.type,
    severity:     input.severity || "high",
    community_id: cid,
    payload:      input.payload || {},
    recipients,
    triggered_by: user.email || null,
    status:       ok ? "sent" : "failed",
    error:        ok ? null   : failures.map(f => f.error).join(" | "),
  })

  if (!ok) return NextResponse.json({ error: failures.map(f => f.error).join(" | ") }, { status: 502 })
  return NextResponse.json({ ok: true, recipients })
}

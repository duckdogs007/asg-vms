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

// Sends via Web3Forms (web3forms.com). One Access Key = one recipient inbox.
// Set WEB3FORMS_ACCESS_KEY in Vercel + .env.local. Sign up takes ~60 seconds
// at https://web3forms.com — they email you the key.
async function sendViaWeb3Forms(
  subject: string,
  body: string,
  meta: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY
  if (!accessKey) return { ok: false, error: "WEB3FORMS_ACCESS_KEY not set" }
  try {
    const r = await fetch("https://api.web3forms.com/submit", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        access_key: accessKey,
        subject,
        from_name:  "ASG VMS",
        message:    body,
        ...meta,
      }),
    })
    const json = await r.json().catch(() => ({} as any))
    if (!r.ok || json?.success === false) {
      return { ok: false, error: `Web3Forms ${r.status}: ${json?.message || "unknown"}` }
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
  const meta    = {
    ...(input.payload || {}),
    TriggeredBy: user.email || "",
    Recipients:  recipients.join(", "),
  }

  const result = await sendViaWeb3Forms(subject, body, meta)

  await supabase.from("alerts").insert({
    type:         input.type,
    severity:     input.severity || "high",
    community_id: cid,
    payload:      input.payload || {},
    recipients,
    triggered_by: user.email || null,
    status:       result.ok ? "sent" : "failed",
    error:        result.ok ? null   : result.error,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true, recipients })
}

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

const RESEND_FROM = process.env.RESEND_FROM_EMAIL || "ASG VMS <onboarding@resend.dev>"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function renderHtml(subject: string, body: string, meta: Record<string, unknown>): string {
  const rows = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#475569;font-weight:600;">${escapeHtml(k)}</td><td style="padding:6px 12px;color:#0f172a;">${escapeHtml(String(v))}</td></tr>`)
    .join("")
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f1f5f9;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:white;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#991b1b;color:white;padding:16px 20px;font-size:18px;font-weight:700;">${escapeHtml(subject)}</div>
      <div style="padding:20px;color:#0f172a;">
        <div style="white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(body)}</div>
        ${rows ? `<table style="margin-top:16px;border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e2e8f0;border-radius:6px;">${rows}</table>` : ""}
        <div style="margin-top:20px;font-size:12px;color:#64748b;">ASG VMS — automated alert. Sent ${new Date().toLocaleString("en-US")}.</div>
      </div>
    </div>
  </body></html>`
}

async function sendViaResend(to: string[], subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
    })
    if (!r.ok) {
      const text = await r.text()
      return { ok: false, error: `Resend ${r.status}: ${text.slice(0, 300)}` }
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

  // Auth check — only signed-in users may fire alerts
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // Recipients: filter by community if provided, else all active
  let q = supabase.from("notification_recipients").select("email,communities").eq("active", true)
  const { data: recList, error: recErr } = await q
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  const cid = input.community_id ?? null
  const recipients = (recList || [])
    .filter(r => !cid || !r.communities?.length || r.communities.includes(cid))
    .map(r => r.email as string)

  if (recipients.length === 0) {
    return NextResponse.json({ error: "no recipients" }, { status: 422 })
  }

  const subject = input.subject || `ASG VMS Alert — ${input.type.replace(/_/g, " ")}`
  const body    = input.body    || ""
  const html    = renderHtml(subject, body, input.payload || {})

  const result = await sendViaResend(recipients, subject, html)

  // Log every fire — even failures — for audit
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

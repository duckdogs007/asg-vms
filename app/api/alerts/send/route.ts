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

// Sends to a Microsoft Teams "Workflows" Incoming Webhook (Power Automate).
// Set TEAMS_WEBHOOK_URL in Vercel env. The URL is itself the credential.
async function sendToTeams(
  subject: string,
  body: string,
  meta: Record<string, unknown>,
  severity: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.TEAMS_WEBHOOK_URL
  if (!url) return { ok: false, error: "TEAMS_WEBHOOK_URL not set" }

  const color = severity === "critical" ? "Attention"
              : severity === "high"     ? "Warning"
              : "Default"

  // Pull Community out so we can render it prominently above the body
  const community = (meta.Community as string) || ""

  const facts = Object.entries(meta)
    .filter(([k, v]) => k !== "Community" && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => ({ title: k, value: String(v) }))

  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl:  null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type:    "AdaptiveCard",
          version: "1.5",
          msteams: { width: "Full" },
          body: [
            {
              type: "TextBlock",
              text: subject,
              weight: "Bolder",
              size: "Large",
              color,
              wrap: true,
            },
            ...(community
              ? [{
                  type: "TextBlock",
                  text: `📍 ${community}`,
                  weight: "Bolder",
                  size: "Medium",
                  color,
                  spacing: "Small",
                  wrap: true,
                }]
              : []),
            ...(body
              ? [{ type: "TextBlock", text: body, wrap: true, spacing: "Small" }]
              : []),
            ...(facts.length
              ? [{ type: "FactSet", facts, spacing: "Medium" }]
              : []),
            {
              type: "TextBlock",
              text: `ASG VMS · ${new Date().toLocaleString("en-US", {
                timeZone: "America/New_York",
                dateStyle: "medium",
                timeStyle: "short",
              })} ET`,
              size: "Small",
              isSubtle: true,
              spacing: "Medium",
            },
          ],
        },
      },
    ],
  }

  try {
    const r = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(card),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => "")
      return { ok: false, error: `Teams ${r.status}: ${text.slice(0, 300)}` }
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

  // Teams webhook is broadcast to a channel — recipients table now informational
  // (lets us add per-community routing later).
  const subject  = input.subject || `ASG VMS Alert — ${input.type.replace(/_/g, " ")}`
  const body     = input.body    || ""
  const severity = input.severity || "high"
  const meta     = {
    ...(input.payload || {}),
    TriggeredBy: user.email || "",
    AlertType:   input.type,
    Severity:    severity,
  }

  const result = await sendToTeams(subject, body, meta, severity)

  await supabase.from("alerts").insert({
    type:         input.type,
    severity,
    community_id: cid,
    payload:      input.payload || {},
    recipients,
    triggered_by: user.email || null,
    status:       result.ok ? "sent" : "failed",
    error:        result.ok ? null   : result.error,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true, channel: "teams" })
}

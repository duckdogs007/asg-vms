import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendEmail, buildAlertEmailHtml, logEmailDelivery } from "@/lib/email"

// Mirrors sendToTeams in ../send/route.ts — extract to lib/teamsNotify.ts if a
// third caller appears.
async function sendToTeams(
  subject: string,
  body: string,
  meta: Record<string, unknown>,
  severity: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.TEAMS_WEBHOOK_URL
  if (!url) return { ok: false, error: "TEAMS_WEBHOOK_URL not set" }

  const color    = severity === "critical" ? "Attention" : severity === "high" ? "Warning" : "Default"
  const community = (meta.Community as string) || ""
  const facts = Object.entries(meta)
    .filter(([k, v]) => k !== "Community" && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => ({ title: k, value: String(v) }))

  const card = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl:  null,
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type:    "AdaptiveCard",
        version: "1.5",
        msteams: { width: "Full" },
        body: [
          { type: "TextBlock", text: subject, weight: "Bolder", size: "Large", color, wrap: true },
          ...(community ? [{ type: "TextBlock", text: `📍 ${community}`, weight: "Bolder", size: "Medium", color, spacing: "Small", wrap: true }] : []),
          ...(body      ? [{ type: "TextBlock", text: body, wrap: true, spacing: "Small" }] : []),
          ...(facts.length ? [{ type: "FactSet", facts, spacing: "Medium" }] : []),
          {
            type: "TextBlock",
            text: `[Re-notify] ASG-PSP · ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET`,
            size: "Small", isSubtle: true, spacing: "Medium",
          },
        ],
      },
    }],
  }

  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) })
    if (!r.ok) {
      const text = await r.text().catch(() => "")
      return { ok: false, error: `Teams ${r.status}: ${text.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function POST(req: Request) {
  let body: { alertId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  if (!body?.alertId) return NextResponse.json({ error: "alertId required" }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: alert } = await supabase
    .from("alerts").select("*").eq("id", body.alertId).single()
  if (!alert) return NextResponse.json({ error: "alert not found" }, { status: 404 })

  // Re-fetch recipients in case the list has changed since original send
  const { data: recList } = await supabase
    .from("notification_recipients").select("email,communities").eq("active", true)
  const cid = alert.community_id
  const recipients = (recList || [])
    .filter((r: { email: string; communities?: string[] }) => !cid || !r.communities?.length || r.communities.includes(cid))
    .map((r: { email: string }) => r.email)

  const subject  = `[Re-notify] ASG-PSP Alert — ${alert.type.replace(/_/g, " ")}`
  const severity = alert.severity
  const meta = {
    ...(alert.payload || {}),
    RenotifiedBy: user.email || "",
    AlertType:    alert.type,
    Severity:     severity,
  }

  const teams = await sendToTeams(subject, "", meta, severity)

  let emailResult: { ok: boolean; error?: string } = { ok: true }
  if (recipients.length) {
    emailResult = await sendEmail({
      to:      recipients,
      subject: `🚨 ${subject}`,
      html:    buildAlertEmailHtml({ subject, body: "", meta, severity }),
    })
  }

  const status = (teams.ok || emailResult.ok) ? "sent" : "failed"
  const error  = [
    !teams.ok       ? `teams: ${teams.error}`       : null,
    !emailResult.ok ? `email: ${emailResult.error}` : null,
  ].filter(Boolean).join(" | ") || null

  await supabase.from("alerts").update({ status, error }).eq("id", body.alertId)

  if (recipients.length) {
    await logEmailDelivery(supabase, {
      user_email:    user.email || null,
      resource_type: "Alert",
      resource_id:   body.alertId,
      recipients,
      result:        emailResult,
    })
  }

  if (status === "failed") return NextResponse.json({ error }, { status: 502 })
  return NextResponse.json({ ok: true, channels: { teams: teams.ok, email: emailResult.ok, recipients_count: recipients.length } })
}

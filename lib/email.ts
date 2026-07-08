// Server-side Resend wrapper. RESEND_API_KEY is a server-only secret;
// this file should never be imported from a client component.
//
// In Resend "test" mode (using the default onboarding@resend.dev sender),
// emails can ONLY be delivered to the API key owner's verified email
// address. To send to arbitrary recipients, verify a domain at
// https://resend.com/domains and update RESEND_FROM_EMAIL to use it.

import type { SupabaseClient } from "@supabase/supabase-js"

export interface SendEmailInput {
  to:      string[]
  subject: string
  html:    string
  cc?:     string[]
  reply_to?: string
}

export interface SendEmailResult {
  ok:    boolean
  id?:   string
  error?: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key  = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || "ASG-PSP <noreply@asg-psp.com>"

  if (!key) return { ok: false, error: "RESEND_API_KEY not set" }
  if (!input.to.length) return { ok: true } // no recipients == no-op (not failure)

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to:       input.to,
        cc:       input.cc,
        subject:  input.subject,
        html:     input.html,
        reply_to: input.reply_to,
      }),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => "")
      return { ok: false, error: `Resend ${r.status}: ${text.slice(0, 300)}` }
    }
    const j = await r.json().catch(() => ({} as any))
    return { ok: true, id: j?.id as string | undefined }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

// ── Audit log helper ──────────────────────────────────────────

// Records a row in audit_logs for each email-delivery attempt. Surfaces
// in the /admin Audit Log tab. Skips logging when the email was a no-op
// (no recipients configured + no error) so the audit doesn't fill with
// "Sent to 0 recipients" noise.
export async function logEmailDelivery(
  supabase: SupabaseClient,
  opts: {
    user_email:    string | null
    resource_type: "Alert" | "Passdown" | "BOLO" | "Watchlist"
    resource_id:   string
    recipients:    string[]
    result:        SendEmailResult
  }
): Promise<void> {
  if (!opts.recipients.length && opts.result.ok) return
  const detail = opts.result.ok
    ? `Email sent to ${opts.recipients.length} recipient${opts.recipients.length === 1 ? "" : "s"}: ${opts.recipients.join(", ")}`
    : `Email failed: ${opts.result.error || "unknown error"}`
  await supabase.from("audit_logs").insert({
    user_email:    opts.user_email || "system",
    action:        opts.result.ok ? "email_sent" : "email_failed",
    resource_type: opts.resource_type,
    resource_id:   opts.resource_id,
    detail,
    created_at:    new Date().toISOString(),
  })
}

// ── Shared HTML templates ─────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const ET_NOW = () => new Date().toLocaleString("en-US", {
  timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short",
})

export function buildAlertEmailHtml(opts: {
  subject:  string
  body?:    string
  meta?:    Record<string, unknown>
  severity?: "critical" | "high" | "medium" | string
}): string {
  const subject = escapeHtml(opts.subject)
  const body    = opts.body ? escapeHtml(opts.body) : ""
  const sev     = (opts.severity || "high").toLowerCase()
  const accent  = sev === "critical" ? "#b91c1c" : sev === "high" ? "#c2410c" : "#374151"

  const factRows = Object.entries(opts.meta || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#6b7280;font-weight:600;font-size:13px;vertical-align:top;">${escapeHtml(k)}</td>
        <td style="padding:4px 0;color:#111827;font-size:14px;">${escapeHtml(String(v))}</td>
      </tr>`).join("")

  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
      <div style="border-left:4px solid ${accent};padding:14px 18px;background:#fafafa;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-weight:700;">${escapeHtml(sev.toUpperCase())} ALERT</div>
        <h2 style="margin:6px 0 0;color:${accent};font-size:18px;">${subject}</h2>
      </div>
      ${body ? `<p style="padding:14px 18px 0;color:#374151;line-height:1.5;font-size:14px;">${body}</p>` : ""}
      ${factRows ? `<table style="margin:14px 18px;border-collapse:collapse;">${factRows}</table>` : ""}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 18px 12px;" />
      <p style="padding:0 18px 18px;color:#9ca3af;font-size:11px;">ASG-PSP · ${escapeHtml(ET_NOW())} ET</p>
    </div>
  `
}

export function buildWatchlistEmailHtml(opts: {
  first_name:   string | null
  last_name:    string | null
  dob:          string | null
  oln:          string | null
  sex:          string | null
  race:         string | null
  reason:       string | null
  comments:     string | null
  community:    string | null
  banned_by:    string | null
  ban_date:     string | null
  firearm_flag: boolean | null
  photo_url:    string | null
  event:        "added" | "updated" | "manual"
}): string {
  const headline = `${opts.first_name || ""} ${opts.last_name || ""}`.trim() || "Watchlist Entry"
  const eventLabel =
    opts.event === "added"   ? "BANNED PERSON ADDED" :
    opts.event === "updated" ? "BANNED PERSON UPDATED" :
                               "WATCHLIST ENTRY"
  const facts: Array<[string, string | null]> = [
    ["Reason",     opts.reason],
    ["DOB",        opts.dob],
    ["Driver License", opts.oln],
    ["Sex",        opts.sex],
    ["Race",       opts.race],
    ["Location",   opts.community],
    ["Banned by",  opts.banned_by],
    ["Ban date",   opts.ban_date],
  ]
  const factRows = facts
    .filter(([, v]) => v && v.trim() !== "")
    .map(([k, v]) => `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#6b7280;font-weight:600;font-size:13px;vertical-align:top;">${escapeHtml(k)}</td>
        <td style="padding:4px 0;color:#111827;font-size:14px;">${escapeHtml(v as string)}</td>
      </tr>`).join("")
  const photoBlock = opts.photo_url
    ? `<div style="margin:14px 18px;"><img src="${escapeHtml(opts.photo_url)}" alt="" style="max-width:100%;max-height:280px;border-radius:6px;border:1px solid #e5e7eb;" /></div>`
    : ""
  const firearmBlock = opts.firearm_flag
    ? `<div style="margin:14px 18px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:14px;font-weight:700;">🔫 Subject is known to carry a firearm.</div>`
    : ""
  const commentsBlock = opts.comments
    ? `<div style="margin:0 18px;padding:14px;border:1px solid #fed7aa;border-radius:6px;background:#fff7ed;color:#7c2d12;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.comments)}</div>`
    : ""
  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
      <div style="border-left:4px solid #b91c1c;padding:14px 18px;background:#fef2f2;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#991b1b;font-weight:700;">🚨 ${eventLabel}</div>
        <h2 style="margin:6px 0 0;color:#991b1b;font-size:18px;">${escapeHtml(headline)}</h2>
      </div>
      ${photoBlock}
      ${firearmBlock}
      ${factRows ? `<table style="margin:14px 18px;border-collapse:collapse;">${factRows}</table>` : ""}
      ${commentsBlock}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 18px 12px;" />
      <p style="padding:0 18px 18px;color:#9ca3af;font-size:11px;">ASG-PSP · ${escapeHtml(ET_NOW())} ET</p>
    </div>
  `
}

export function buildBoloEmailHtml(opts: {
  name:        string | null
  description: string | null
  reason:      string | null
  vehicle:     string | null
  community:   string | null
  added_by:    string | null
  photo_url:   string | null
}): string {
  const facts: Array<[string, string | null]> = [
    ["Name",        opts.name],
    ["Reason",      opts.reason],
    ["Vehicle",     opts.vehicle],
    ["Location",    opts.community],
    ["Issued by",   opts.added_by],
  ]
  const factRows = facts
    .filter(([, v]) => v && v.trim() !== "")
    .map(([k, v]) => `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#6b7280;font-weight:600;font-size:13px;vertical-align:top;">${escapeHtml(k)}</td>
        <td style="padding:4px 0;color:#111827;font-size:14px;">${escapeHtml(v as string)}</td>
      </tr>`).join("")

  const photoBlock = opts.photo_url
    ? `<div style="margin:14px 18px;"><img src="${escapeHtml(opts.photo_url)}" alt="" style="max-width:100%;max-height:280px;border-radius:6px;border:1px solid #e5e7eb;" /></div>`
    : ""

  const descriptionBlock = opts.description
    ? `<div style="margin:0 18px;padding:14px;border:1px solid #fecaca;border-radius:6px;background:#fff5f5;color:#7f1d1d;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.description)}</div>`
    : ""

  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
      <div style="border-left:4px solid #b91c1c;padding:14px 18px;background:#fef2f2;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#991b1b;font-weight:700;">🔍 BOLO ISSUED</div>
        <h2 style="margin:6px 0 0;color:#991b1b;font-size:18px;">${escapeHtml(opts.name || opts.description?.slice(0, 60) || "New BOLO")}</h2>
      </div>
      ${photoBlock}
      ${factRows ? `<table style="margin:14px 18px;border-collapse:collapse;">${factRows}</table>` : ""}
      ${descriptionBlock}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 18px 12px;" />
      <p style="padding:0 18px 18px;color:#9ca3af;font-size:11px;">ASG-PSP · ${escapeHtml(ET_NOW())} ET</p>
    </div>
  `
}

export function buildReportEmailHtml(r: any): string {
  const esc = (s: any) => escapeHtml(String(s ?? ""))
  const typeLabel =
    r._type === "Incident"          ? "Incident Report" :
    r._type === "Field Contact"     ? "Field Contact Report" :
    r._type === "Vehicle FI"        ? "Vehicle Field Interview" :
    r._type === "Parking Violation" ? "Parking Violation" :
    r._type === "Maintenance"       ? "Property Maintenance Report" :
                                      "Patrol / Daily Log"
  const accent =
    r._type === "Incident"          ? "#b91c1c" :
    r._type === "Field Contact"     ? "#7c3aed" :
    r._type === "Vehicle FI"        ? "#c2410c" :
    r._type === "Parking Violation" ? "#b45309" :
    r._type === "Maintenance"       ? "#065f46" : "#1d4ed8"

  const facts: Array<[string, string | null | undefined]> = [
    ["Date",              r.date],
    ["Time",              r.time],
    ["Officer",           r.officer_name || r.officer],
    ["Shift",             r.shift],
    ["Weather",           r.weather],
    ["Incident Type",     r.incident_type],
    ["Location",          r.location],
    ["Building / Apt",    (r.building || r.apartment) ? [r.building, r.apartment].filter(Boolean).join(" / ") : null],
    ["HOH",               r.hoh_name],
    ["Reliant #",         r.reliant_case_no],
    ["HPD #",             r.hpd_report_no],
    ["ASG #",             r.asg_report_no],
    ["Reliant Notified",  r.reliant_notified != null ? (r.reliant_notified ? "Yes" : "No") : null],
    ["Persons Involved",  r.persons_involved],
    ["Subject",           r.first_name ? `${r.first_name} ${r.last_name || ""}`.trim() : null],
    ["DOB",               r.dob],
    ["Sex",               r.sex],
    ["Race",              r.race],
    ["OLN",               r.oln],
    ["Address",           r.address],
    ["Reason",            r.reason],
    ["Make",              r.make],
    ["Model",             r.model],
    ["Color",             r.color],
    ["Year",              r.year],
    ["Plate",             r.plate],
    ["State",             r.state],
    ["Issue Type",        r.issue_type],
    ["Violation Type",    r.violation_type],
    ["Space",             r.space],
    ["Tow Requested",     r.tow_requested ? "Yes" : null],
  ]
  const factRows = facts
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#6b7280;font-weight:600;font-size:13px;vertical-align:top;white-space:nowrap;">${esc(k)}</td>
        <td style="padding:4px 0;color:#111827;font-size:14px;">${esc(v)}</td>
      </tr>`).join("")

  const textSections: Array<[string, string]> = (
    [
      r.narrative    ? ["Patrol Narrative",      r.narrative]    : null,
      r.description  ? ["Incident Description",  r.description]  : null,
      r.action_taken ? ["Action Taken",          r.action_taken] : null,
      r.notes        ? ["Notes",                 r.notes]        : null,
    ] as Array<[string, string] | null>
  ).filter((x): x is [string, string] => x !== null)

  const textBlocks = textSections.map(([label, content]) => `
    <div style="margin:0 0 14px;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${label}</div>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;color:#111827;font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(content)}</div>
    </div>`).join("")

  const photoCount = (Array.isArray(r.photo_urls) ? r.photo_urls.length : 0) + (r.photo_url ? 1 : 0)
  const photoNote = photoCount > 0
    ? `<div style="margin:0 0 14px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;color:#166534;font-size:13px;">📷 ${photoCount} photo${photoCount > 1 ? "s" : ""} attached — view in ASG-PSP</div>`
    : ""
  const followUpNote = (r.follow_up_required || r.follow_up)
    ? `<div style="padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;color:#9a3412;font-size:13px;font-weight:600;">⚠ Follow-up action required</div>`
    : ""

  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;">
      <div style="border-left:4px solid ${accent};padding:14px 18px;background:#f9fafb;margin-bottom:0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:${accent};font-weight:700;">AMERICAN SECURITY GROUP — ${esc(typeLabel)}</div>
        <h2 style="margin:4px 0 0;color:#111827;font-size:18px;">
          ${esc(r.date || "")}${r.time ? " · " + esc(r.time) : ""}${(r.officer_name || r.officer) ? " · " + esc(r.officer_name || r.officer) : ""}
        </h2>
        ${r.location ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">${esc(r.location)}</div>` : ""}
      </div>
      <div style="padding:16px 18px 0;">
        ${factRows ? `<table style="border-collapse:collapse;width:100%;margin-bottom:16px;">${factRows}</table>` : ""}
        ${textBlocks}
        ${photoNote}
        ${followUpNote}
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 18px 12px;" />
      <p style="padding:0 18px 18px;color:#9ca3af;font-size:11px;">ASG-PSP · ${escapeHtml(ET_NOW())} ET</p>
    </div>
  `
}

export function buildPassdownEmailHtml(opts: {
  date:         string | null
  shift:        string | null
  officer_name: string | null
  community:    string | null
  notes:        string
}): string {
  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
      <div style="border-left:4px solid #1d4ed8;padding:14px 18px;background:#eff6ff;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#1e40af;font-weight:700;">Passdown Log</div>
        <h2 style="margin:6px 0 0;color:#1e3a8a;font-size:18px;">${escapeHtml(opts.community || "—")} · ${escapeHtml(opts.date || "")} · ${escapeHtml(opts.shift || "")}</h2>
      </div>
      <table style="margin:14px 18px;border-collapse:collapse;">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-weight:600;font-size:13px;">Officer</td><td style="padding:4px 0;color:#111827;font-size:14px;">${escapeHtml(opts.officer_name || "—")}</td></tr>
      </table>
      <div style="margin:0 18px;padding:14px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;color:#111827;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.notes || "")}</div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 18px 12px;" />
      <p style="padding:0 18px 18px;color:#9ca3af;font-size:11px;">ASG-PSP · ${escapeHtml(ET_NOW())} ET</p>
    </div>
  `
}

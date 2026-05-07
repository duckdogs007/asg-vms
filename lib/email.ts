// Server-side Resend wrapper. RESEND_API_KEY is a server-only secret;
// this file should never be imported from a client component.
//
// In Resend "test" mode (using the default onboarding@resend.dev sender),
// emails can ONLY be delivered to the API key owner's verified email
// address. To send to arbitrary recipients, verify a domain at
// https://resend.com/domains and update RESEND_FROM_EMAIL to use it.

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
  const from = process.env.RESEND_FROM_EMAIL || "ASG VMS <onboarding@resend.dev>"

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
      <p style="padding:0 18px 18px;color:#9ca3af;font-size:11px;">ASG VMS · ${escapeHtml(ET_NOW())} ET</p>
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
      <p style="padding:0 18px 18px;color:#9ca3af;font-size:11px;">ASG VMS · ${escapeHtml(ET_NOW())} ET</p>
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
      <p style="padding:0 18px 18px;color:#9ca3af;font-size:11px;">ASG VMS · ${escapeHtml(ET_NOW())} ET</p>
    </div>
  `
}

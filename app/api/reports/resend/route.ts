import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendEmail, buildReportEmailHtml } from "@/lib/email"
import { ADMIN_EMAILS } from "@/lib/admin"

const TABLE_MAP: Record<string, string> = {
  incident:      "incident_reports",
  field_contact: "contact_history",
  vehicle_fi:    "vehicle_fi_logs",
  parking:       "parking_violations",
  daily_log:     "officer_daily_logs",
  maintenance:   "property_maintenance_reports",
}

const EMAIL_TYPE_MAP: Record<string, string> = {
  daily_log:     "Daily Log",
  incident:      "Incident",
  field_contact: "Field Contact",
  vehicle_fi:    "Vehicle FI",
  parking:       "Parking Violation",
  maintenance:   "Maintenance",
}

// Accepts URL slug format (incident, field-contact, vehicle-fi, parking, daily-log, maintenance)
// and converts to queue format
const SLUG_MAP: Record<string, string> = {
  "incident":      "incident",
  "field-contact": "field_contact",
  "vehicle-fi":    "vehicle_fi",
  "parking":       "parking",
  "daily-log":     "daily_log",
  "maintenance":   "maintenance",
}

export async function POST(req: NextRequest) {
  try {
    const { reportId, reportType } = await req.json()
    if (!reportId || !reportType) {
      return NextResponse.json({ ok: false, error: "Missing reportId or reportType" }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

    const isAdminEmail = ADMIN_EMAILS.includes(user.email || "")
    if (!isAdminEmail) {
      const { data: role } = await supabase
        .from("user_assignments").select("role")
        .eq("user_id", user.id).in("role", ["admin_super", "supervisor"]).maybeSingle()
      if (!role) return NextResponse.json({ ok: false, error: "Unauthorized — admin or supervisor required" }, { status: 403 })
    }

    const queueType = SLUG_MAP[reportType] ?? reportType
    const table     = TABLE_MAP[queueType]
    if (!table) return NextResponse.json({ ok: false, error: "Unknown report type" }, { status: 400 })

    const { data: report } = await supabase.from(table).select("*").eq("id", reportId).maybeSingle()
    if (!report) return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 })

    const SUPERVISOR_FALLBACK = "ASG-Supervisors@teamasg.com"
    let recipients: string[] = []

    if (report.community_id) {
      const { data: rdr } = await supabase
        .from("report_delivery_recipients").select("email")
        .eq("community_id", report.community_id)
        .eq("report_type", queueType)
      recipients = (rdr || []).map((r: any) => r.email).filter(Boolean)

      if (recipients.length === 0) {
        const { data: contacts } = await supabase
          .from("community_contacts").select("email")
          .eq("community_id", report.community_id)
        recipients = (contacts || []).map((c: any) => c.email).filter(Boolean)
      }
    }
    if (recipients.length === 0) recipients = [SUPERVISOR_FALLBACK]

    const emailType = EMAIL_TYPE_MAP[queueType] || "Report"
    const parts     = [emailType, report.date, report.officer_name || report.officer].filter(Boolean)

    const result = await sendEmail({
      to:      recipients,
      subject: `ASG VMS — ${parts.join(" · ")}`,
      html:    buildReportEmailHtml({ ...report, _type: emailType }),
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || "Email send failed" }, { status: 502 })
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_email:    user.email,
      action:        "email_sent",
      resource_type: "Report",
      resource_id:   reportId,
      detail:        `Report resent to ${recipients.join(", ")}`,
      created_at:    new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, recipients })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

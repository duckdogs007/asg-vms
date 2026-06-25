import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendEmail, buildReportEmailHtml } from "@/lib/email"
import { ADMIN_EMAILS } from "@/lib/admin"

const TABLE_MAP: Record<string, string> = {
  daily_log:     "officer_daily_logs",
  incident:      "incident_reports",
  field_contact: "contact_history",
  vehicle_fi:    "vehicle_fi_logs",
  parking:       "parking_violations",
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

export async function POST(req: NextRequest) {
  try {
    const { queueId } = await req.json()
    if (!queueId) return NextResponse.json({ ok: false, error: "Missing queueId" }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 })

    const isAdminEmail = ADMIN_EMAILS.includes(user.email || "")
    if (!isAdminEmail) {
      const { data: role } = await supabase
        .from("user_assignments").select("role")
        .eq("user_id", user.id).in("role", ["admin_super", "supervisor"]).maybeSingle()
      if (!role) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 })
    }

    const { data: qRow } = await supabase
      .from("report_queue").select("*").eq("id", queueId).maybeSingle()
    if (!qRow) return NextResponse.json({ ok: false, error: "Queue entry not found" }, { status: 404 })

    const table = TABLE_MAP[qRow.report_type]
    if (!table) return NextResponse.json({ ok: false, error: "Unknown report type" }, { status: 400 })

    const { data: report } = await supabase.from(table).select("*").eq("id", qRow.report_id).maybeSingle()
    if (!report) return NextResponse.json({ ok: false, error: "Source report not found" }, { status: 404 })

    const SUPERVISOR_FALLBACK = "ASG-Supervisors@teamasg.com"

    let recipients: string[] = []
    if (qRow.community_id) {
      const { data: contacts } = await supabase
        .from("community_contacts").select("email, name")
        .eq("community_id", qRow.community_id)
      recipients = (contacts || []).map((c: any) => c.email).filter(Boolean)
    }
    if (recipients.length === 0) recipients = [SUPERVISOR_FALLBACK]

    const now       = new Date().toISOString()
    const emailType = EMAIL_TYPE_MAP[qRow.report_type] || "Report"
    const parts     = [emailType, report.date, report.officer_name || report.officer].filter(Boolean)

    await sendEmail({
      to:      recipients,
      subject: `ASG VMS — ${parts.join(" · ")}`,
      html:    buildReportEmailHtml({ ...report, _type: emailType }),
    })

    const { error: updateErr } = await supabase.from("report_queue").update({
      status:      "sent",
      reviewed_by: user.email,
      reviewed_at: now,
      sent_at:     now,
    }).eq("id", queueId)
    if (updateErr) throw new Error("Queue status update failed: " + updateErr.message)

    return NextResponse.json({ ok: true, recipients })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

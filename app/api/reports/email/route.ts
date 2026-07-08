import { NextRequest, NextResponse } from "next/server"
import { sendEmail, buildReportEmailHtml } from "@/lib/email"

export async function POST(req: NextRequest) {
  try {
    const { to, report } = await req.json()
    if (!to || !report) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 })
    }
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
    if (!recipients.length) {
      return NextResponse.json({ ok: false, error: "No recipients" }, { status: 400 })
    }
    const typeLabel =
      report._type === "Incident"          ? "Incident Report" :
      report._type === "Field Contact"     ? "Field Contact Report" :
      report._type === "Vehicle FI"        ? "Vehicle Field Interview" :
      report._type === "Parking Violation" ? "Parking Violation" :
                                             "Patrol / Daily Log"
    const parts = [typeLabel, report.date, report.officer_name || report.officer].filter(Boolean)
    const result = await sendEmail({
      to: recipients,
      subject: `ASG-PSP — ${parts.join(" · ")}`,
      html: buildReportEmailHtml(report),
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

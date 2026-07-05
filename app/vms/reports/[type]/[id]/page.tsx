"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { SignedImage } from "@/components/SignedImage"
import { checkCanApprove } from "@/lib/admin"

const TYPE_CONFIG: Record<string, { table: string; label: string; color: string }> = {
  "incident":       { table: "incident_reports",             label: "Incident Report",    color: "red"     },
  "field-contact":  { table: "contact_history",              label: "Field Contact",      color: "purple"  },
  "vehicle-fi":     { table: "vehicle_fi_logs",              label: "Vehicle FI",         color: "orange"  },
  "parking":        { table: "parking_violations",           label: "Parking Violation",  color: "amber"   },
  "daily-log":      { table: "officer_daily_logs",           label: "Daily Activity Log", color: "blue"    },
  "maintenance":    { table: "property_maintenance_reports", label: "Maintenance Report", color: "emerald" },
  "gate-checklist": { table: "gate_checklists",              label: "Gate Checklist",     color: "slate"   },
}

// URL slug → report_queue report_type value
const SLUG_TO_QUEUE: Record<string, string> = {
  "incident":      "incident",
  "field-contact": "field_contact",
  "vehicle-fi":    "vehicle_fi",
  "parking":       "parking",
  "daily-log":     "daily_log",
  "maintenance":   "maintenance",
}

const TYPE_BADGE: Record<string, string> = {
  red:     "bg-red-100 text-red-700 border-red-200",
  purple:  "bg-purple-100 text-purple-700 border-purple-200",
  orange:  "bg-orange-100 text-orange-700 border-orange-200",
  amber:   "bg-amber-100 text-amber-800 border-amber-200",
  blue:    "bg-blue-100 text-blue-700 border-blue-200",
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
  slate:   "bg-slate-100 text-slate-700 border-slate-200",
}

type EditFieldDef = { key: string; label: string; type: "text" | "date" | "textarea" }

const EDIT_FIELDS: Record<string, EditFieldDef[]> = {
  "incident": [
    { key: "date",             label: "Date",              type: "date"     },
    { key: "time",             label: "Time",              type: "text"     },
    { key: "officer_name",     label: "Reporting Officer", type: "text"     },
    { key: "incident_type",    label: "Incident Type",     type: "text"     },
    { key: "location",         label: "Location",          type: "text"     },
    { key: "building",         label: "Building",          type: "text"     },
    { key: "apartment",        label: "Apartment",         type: "text"     },
    { key: "hoh_name",         label: "HOH / Tenant",      type: "text"     },
    { key: "persons_involved", label: "Persons Involved",  type: "text"     },
    { key: "description",      label: "Description",       type: "textarea" },
    { key: "action_taken",     label: "Action Taken",      type: "textarea" },
    { key: "reliant_case_no",  label: "Reliant Case #",    type: "text"     },
    { key: "hpd_report_no",    label: "HPD Report #",      type: "text"     },
    { key: "asg_report_no",    label: "ASG Report #",      type: "text"     },
  ],
  "field-contact": [
    { key: "officer_name", label: "Officer",      type: "text"     },
    { key: "contact_name", label: "Contact Name", type: "text"     },
    { key: "reason",       label: "Reason",       type: "text"     },
    { key: "notes",        label: "Notes",        type: "textarea" },
  ],
  "vehicle-fi": [
    { key: "date",         label: "Date",         type: "date"     },
    { key: "officer_name", label: "Officer",      type: "text"     },
    { key: "plate",        label: "Plate",        type: "text"     },
    { key: "state",        label: "State",        type: "text"     },
    { key: "make",         label: "Make",         type: "text"     },
    { key: "model",        label: "Model",        type: "text"     },
    { key: "color",        label: "Color",        type: "text"     },
    { key: "year",         label: "Year",         type: "text"     },
    { key: "notes",        label: "Notes",        type: "textarea" },
  ],
  "parking": [
    { key: "date",           label: "Date",           type: "date"     },
    { key: "officer_name",   label: "Officer",        type: "text"     },
    { key: "violation_type", label: "Violation Type", type: "text"     },
    { key: "plate",          label: "Plate",          type: "text"     },
    { key: "make",           label: "Make",           type: "text"     },
    { key: "color",          label: "Color",          type: "text"     },
    { key: "location",       label: "Location",       type: "text"     },
    { key: "notes",          label: "Notes",          type: "textarea" },
  ],
  "daily-log": [
    { key: "date",         label: "Date",      type: "date"     },
    { key: "officer_name", label: "Officer",   type: "text"     },
    { key: "shift",        label: "Shift",     type: "text"     },
    { key: "narrative",    label: "Narrative", type: "textarea" },
  ],
  "maintenance": [
    { key: "officer_name", label: "Officer",     type: "text"     },
    { key: "issue_type",   label: "Issue Type",  type: "text"     },
    { key: "description",  label: "Description", type: "textarea" },
    { key: "notes",        label: "Notes",       type: "textarea" },
  ],
  "gate-checklist": [
    { key: "checklist_date",  label: "Date",             type: "date"     },
    { key: "guard_name",      label: "Guard",            type: "text"     },
    { key: "shift",           label: "Shift",            type: "text"     },
    { key: "additional_notes",label: "Additional Notes", type: "textarea" },
  ],
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div>
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm text-gray-900">{String(value)}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">{title}</div>
      {children}
    </div>
  )
}

// Kind slug → summary API kind param
const SLUG_TO_KIND: Record<string, string> = {
  "incident":      "incident",
  "field-contact": "contact",
  "vehicle-fi":    "vehicle_fi",
  "parking":       "parking",
  "daily-log":     "daily",
  "maintenance":   "maintenance",
}

export default function ReportDetailPage() {
  const params = useParams()
  const type   = params.type as string
  const id     = params.id   as string
  const config = TYPE_CONFIG[type]

  const [report,          setReport]          = useState<Record<string, any> | null>(null)
  const [queue,           setQueue]           = useState<Record<string, any> | null>(null)
  const [communityName,   setCommunityName]   = useState("")
  const [loading,         setLoading]         = useState(true)
  const [notFound,        setNotFound]        = useState(false)
  const [canEmail,        setCanEmail]        = useState(false)
  const [emailSending,    setEmailSending]    = useState(false)
  const [emailResult,     setEmailResult]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [summary,         setSummary]         = useState<string | null>(null)
  const [summaryLoading,  setSummaryLoading]  = useState(false)
  const [summaryError,    setSummaryError]    = useState<string | null>(null)

  // Edit mode
  const [editMode,    setEditMode]    = useState(false)
  const [editFields,  setEditFields]  = useState<Record<string, any>>({})
  const [editSaving,  setEditSaving]  = useState(false)
  const [editError,   setEditError]   = useState("")
  const editFormRef = useRef<HTMLDivElement>(null)

  // Approve from detail page
  const [approvingDetail,     setApprovingDetail]     = useState(false)
  const [approveDetailResult, setApproveDetailResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Return for revision from detail page
  const [returnOpen,   setReturnOpen]   = useState(false)
  const [returnNotes,  setReturnNotes]  = useState("")
  const [returnSaving, setReturnSaving] = useState(false)

  useEffect(() => { checkCanApprove().then(setCanEmail) }, [])

  useEffect(() => {
    if (!config) { setNotFound(true); setLoading(false); return }

    Promise.all([
      supabase.from(config.table).select("*").eq("id", id).maybeSingle(),
      supabase.from("report_queue")
        .select("*")
        .eq("report_type", SLUG_TO_QUEUE[type])
        .eq("report_id",   id)
        .maybeSingle(),
    ]).then(([{ data: rec }, { data: q }]) => {
      if (!rec) { setNotFound(true); setLoading(false); return }
      setReport(rec)
      setQueue(q ?? null)
      if (rec.community_id) {
        supabase.from("communities").select("name").eq("id", rec.community_id).maybeSingle()
          .then(({ data: c }) => setCommunityName(c?.name ?? ""))
      }
      setLoading(false)
      const narrative = [rec.narrative, rec.description, rec.notes, rec.action_taken].filter(Boolean).join("\n\n")
      if (narrative.trim()) fetchSummary(rec, narrative)
    })
  }, [type, id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSummary(rec: Record<string, any>, narrative: string) {
    setSummaryLoading(true)
    setSummaryError(null)
    setSummary(null)
    try {
      const fields: Record<string, any> = {}
      if (rec.incident_type)  fields.incident_type  = rec.incident_type
      if (rec.violation_type) fields.violation_type = rec.violation_type
      if (rec.issue_type)     fields.issue_type      = rec.issue_type
      if (rec.location)       fields.location        = rec.location
      if (rec.hoh_name)       fields.hoh             = rec.hoh_name
      if (rec.persons_involved) fields.persons_involved = rec.persons_involved
      if (rec.follow_up_required) fields.follow_up_required = "Yes"
      if (rec.firearm_flag)   fields.firearm_involved = "Yes"
      if (rec.bolo_match)     fields.bolo_match       = "Yes"
      if (rec.reliant_case_no) fields.reliant_case_no = rec.reliant_case_no
      if (rec.reliant_notified === false && rec.reliant_not_notified_reason)
        fields.reliant_not_notified = rec.reliant_not_notified_reason

      const res  = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: SLUG_TO_KIND[type], fields, narrative }),
      })
      const data = await res.json()
      if (!res.ok) { setSummaryError(data.error || "Summary failed."); return }
      setSummary(data.summary)
    } catch (e: any) {
      setSummaryError(e?.message || "Summary request failed.")
    } finally {
      setSummaryLoading(false)
    }
  }

  async function resendEmail() {
    setEmailSending(true); setEmailResult(null)
    try {
      const res  = await fetch("/api/reports/resend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: id, reportType: type }),
      })
      const data = await res.json()
      if (!res.ok) setEmailResult({ ok: false, msg: data.error || `Error ${res.status}` })
      else setEmailResult({ ok: true, msg: `Sent to ${(data.recipients as string[]).join(", ")}` })
    } catch (e: any) {
      setEmailResult({ ok: false, msg: e?.message || "Request failed" })
    } finally {
      setEmailSending(false)
    }
  }

  function openEdit() {
    if (!report) return
    const defs = EDIT_FIELDS[type] || []
    const initial: Record<string, any> = {}
    for (const f of defs) initial[f.key] = report[f.key] ?? ""
    setEditFields(initial)
    setEditError("")
    setEditMode(true)
    setReturnOpen(false)
    setApproveDetailResult(null)
    setTimeout(() => editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
  }

  async function saveEdit() {
    setEditSaving(true)
    setEditError("")
    const { error: updateErr } = await supabase.from(config.table).update(editFields).eq("id", id)
    if (updateErr) { setEditError(updateErr.message); setEditSaving(false); return }
    const { data: updated } = await supabase.from(config.table).select("*").eq("id", id).maybeSingle()
    if (updated) setReport(updated)
    setEditMode(false)
    setEditSaving(false)
  }

  async function approveFromDetail() {
    if (!queue?.id) return
    setApprovingDetail(true)
    setApproveDetailResult(null)
    const res = await fetch("/api/reports/queue/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId: queue.id }),
    })
    const data = await res.json()
    setApprovingDetail(false)
    if (data.ok) {
      const { data: q } = await supabase.from("report_queue").select("*")
        .eq("report_type", SLUG_TO_QUEUE[type]).eq("report_id", id).maybeSingle()
      setQueue(q ?? null)
      supabase.auth.getUser().then(({ data: { user } }) => {
        supabase.from("audit_logs").insert({
          user_email: user?.email || "unknown",
          action: "approved", resource_type: "Report Queue", resource_id: queue.id,
          detail: `Approved report — emailed to ${data.recipients?.join(", ") || "no contacts"}`,
          created_at: new Date().toISOString(),
        })
      })
      setApproveDetailResult({ ok: true, msg: `✅ Approved and sent to ${data.recipients?.join(", ") || "no contacts on file"}` })
    } else {
      setApproveDetailResult({ ok: false, msg: data.error || "Unknown error" })
    }
  }

  async function returnFromDetail() {
    if (!returnNotes.trim() || !queue?.id) return
    setReturnSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from("report_queue").update({
      status:         "needs_revision",
      revision_notes: returnNotes.trim(),
      reviewed_by:    user?.email || null,
      reviewed_at:    new Date().toISOString(),
    }).eq("id", queue.id)
    setReturnSaving(false)
    if (error) { alert("Failed: " + error.message); return }
    supabase.from("audit_logs").insert({
      user_email: user?.email || "unknown",
      action: "returned", resource_type: "Report Queue", resource_id: queue.id,
      detail: `Returned report for revision — ${returnNotes.trim().slice(0, 100)}`,
      created_at: new Date().toISOString(),
    })
    const { data: q } = await supabase.from("report_queue").select("*")
      .eq("report_type", SLUG_TO_QUEUE[type]).eq("report_id", id).maybeSingle()
    setQueue(q ?? null)
    setReturnOpen(false)
    setReturnNotes("")
  }

  if (loading)  return <div className="p-8 text-gray-400 text-sm">Loading…</div>
  if (notFound || !config) return (
    <div className="p-8">
      <div className="text-gray-500 text-sm mb-3">Report not found.</div>
      <Link href="/vms/reports" className="text-blue-700 text-sm hover:underline">← Back to Reports</Link>
    </div>
  )

  const r      = report!
  const isGateChecklist = type === "gate-checklist"
  const photos: string[] = r.photo_urls ?? r.general_photo_urls ?? (r.photo_url ? [r.photo_url] : [])

  const qStatus = queue?.status as string | undefined
  const qBadge  =
    qStatus === "sent"           ? { cls: "bg-green-100 text-green-700",  label: "✓ Sent to Client"      } :
    qStatus === "approved"       ? { cls: "bg-blue-100 text-blue-700",    label: "✓ Approved"            } :
    qStatus === "needs_revision" ? { cls: "bg-amber-100 text-amber-800",  label: "! Revision Requested"  } :
    qStatus === "pending"        ? { cls: "bg-yellow-100 text-yellow-700",label: "⏳ Pending Review"      } :
    null

  const locationLine = [
    r.location_type === "unit"        ? [r.building && `Bldg ${r.building}`, r.apartment && `Apt ${r.apartment}`].filter(Boolean).join(" / ") : null,
    r.location_type === "common_area" ? r.common_area : null,
    r.location,
  ].filter(Boolean).join(" · ") || null

  const hasPersonInfo  = r.hoh_name || r.persons_involved || r.persons_data?.length || r.contact_name || r.first_name || r.last_name
  const hasVehicleInfo = r.plate || r.make || r.vehicle || r.vehicles_data?.length
  const hasRefNums     = r.reliant_case_no || r.hpd_report_no || r.asg_report_no
  const hasNarrative   = r.narrative || r.description || r.notes || r.action_taken

  const canReviewAct = canEmail && SLUG_TO_QUEUE[type]
  const canApproveAct = canReviewAct && (qStatus === "pending" || qStatus === "needs_revision") && !!queue?.id

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      {/* Breadcrumb + action bar */}
      <div className="mb-4 no-print">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link href="/vms/reports" className="text-xs text-blue-700 hover:underline">← Reports</Link>
          <div className="flex items-center gap-2">
            {canEmail && (
              <button
                onClick={resendEmail}
                disabled={emailSending}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
              >
                {emailSending ? "Sending…" : "📧 Email Report"}
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200"
            >
              🖨 Print
            </button>
          </div>
        </div>
        {emailResult && (
          <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${emailResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {emailResult.ok ? `✓ ${emailResult.msg}` : `✕ ${emailResult.msg}`}
          </div>
        )}
      </div>

      {/* ── REVIEWER ACTION BAR ── */}
      {canReviewAct && (
        <div className="mb-5 no-print">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mr-1">Reviewer Actions</span>
            <button
              onClick={editMode ? () => setEditMode(false) : openEdit}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border-none cursor-pointer transition-colors ${
                editMode
                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
              }`}
            >
              {editMode ? "✕ Cancel Edit" : "✏️ Edit Report"}
            </button>
            {canApproveAct && !editMode && (
              <>
                <button
                  onClick={approveFromDetail}
                  disabled={approvingDetail}
                  className="px-3 py-1.5 text-xs font-semibold bg-green-700 hover:bg-green-800 text-white rounded-lg border-none cursor-pointer disabled:opacity-50"
                >
                  {approvingDetail ? "Approving…" : "✅ Approve & Send"}
                </button>
                <button
                  onClick={() => { setReturnOpen(o => !o); setReturnNotes("") }}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg border-none cursor-pointer"
                >
                  🔄 Return for Revision
                </button>
              </>
            )}
          </div>

          {approveDetailResult && (
            <div className={`mt-2 text-xs px-3 py-2 rounded-lg font-semibold ${approveDetailResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {approveDetailResult.msg}
            </div>
          )}

          {returnOpen && (
            <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-xs font-semibold text-amber-800 mb-2">Return to officer with notes:</div>
              <textarea
                value={returnNotes}
                onChange={e => setReturnNotes(e.target.value)}
                placeholder="What needs to be corrected or added?"
                className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                rows={3}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={returnFromDetail}
                  disabled={returnSaving || !returnNotes.trim()}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg border-none cursor-pointer disabled:opacity-50"
                >
                  {returnSaving ? "Returning…" : "↩ Return for Revision"}
                </button>
                <button
                  onClick={() => { setReturnOpen(false); setReturnNotes("") }}
                  className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs rounded-lg cursor-pointer hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary — Highlights / Followup */}
      {(summaryLoading || summary || summaryError) && (
        <div className={`mb-5 rounded-xl border px-4 py-3 ${
          summaryLoading ? "bg-gray-50 border-gray-200" :
          summaryError   ? "bg-amber-50 border-amber-200" :
                           "bg-blue-50 border-blue-200"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">Summary — Highlights / Followup</div>
            <div className="flex items-center gap-2">
              {!summaryLoading && report && (
                <button
                  onClick={() => {
                    const narrative = [report.narrative, report.description, report.notes, report.action_taken].filter(Boolean).join("\n\n")
                    fetchSummary(report, narrative)
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
                >
                  ↺ Regenerate
                </button>
              )}
              <span className="text-[10px] text-gray-400 italic">AI-generated</span>
            </div>
          </div>
          {summaryLoading && <div className="text-xs text-gray-400 animate-pulse">Generating summary…</div>}
          {summaryError   && <div className="text-xs text-amber-700">{summaryError}</div>}
          {summary && (
            <div className="text-sm text-gray-800 space-y-1">
              {summary.split("\n").filter(Boolean).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Type + status badges — visible in print */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${TYPE_BADGE[config.color] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
          {config.label}
        </span>
        {qBadge && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${qBadge.cls}`}>{qBadge.label}</span>
        )}
        {r.firearm_flag && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-700 text-white">🔫 Firearm</span>
        )}
        {r.follow_up_required && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">⚠ Follow-up Required</span>
        )}
      </div>

      {/* Approval stamp */}
      {qStatus === "sent" && queue?.reviewed_by && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="text-xs font-bold text-green-800 uppercase tracking-wide mb-1">Approved &amp; Sent</div>
          <div className="text-sm text-green-900">
            Approved by <span className="font-semibold">{queue.reviewed_by}</span>
            {queue.reviewed_at && (
              <> on {new Date(queue.reviewed_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</>
            )}
          </div>
          {queue.sent_at && queue.sent_at !== queue.reviewed_at && (
            <div className="text-xs text-green-700 mt-1">
              Sent to client {new Date(queue.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}

      {/* Revision notes */}
      {qStatus === "needs_revision" && queue?.revision_notes && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">Revision Requested</div>
          <div className="text-sm text-amber-900">{queue.revision_notes}</div>
          {queue.reviewed_by && (
            <div className="text-xs text-amber-700 mt-1">
              Returned by <span className="font-semibold">{queue.reviewed_by}</span>
              {queue.reviewed_at && (
                <> on {new Date(queue.reviewed_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</>
              )}
            </div>
          )}
        </div>
      )}

      {/* Core info */}
      <Section title="Report Details">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Date"           value={isGateChecklist ? r.checklist_date : r.date} />
          <Field label="Time"           value={isGateChecklist ? [r.start_time, r.end_time].filter(Boolean).join(" – ") : r.time} />
          <Field label="Shift"          value={r.shift} />
          <Field label="Officer"        value={isGateChecklist ? (r.guard_name || r.officer_name) : (r.officer_name || r.officer || r.created_by)} />
          <Field label="Community"      value={communityName} />
          {locationLine && <Field label="Location"  value={locationLine} />}
          <Field label="Incident Type"  value={r.incident_type} />
          <Field label="Violation Type" value={r.violation_type} />
          <Field label="Issue Type"     value={r.issue_type} />
          <Field label="Reason"         value={r.reason} />
          <Field label="Weather"        value={r.weather} />
          <Field label="Status"         value={r.status} />
        </div>
        {isGateChecklist && r.additional_notes && (
          <div className="mt-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Additional Notes</div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.additional_notes}</div>
          </div>
        )}
      </Section>

      {/* Persons */}
      {hasPersonInfo && (
        <Section title="Persons Involved">
          {/* Structured persons list (new incident reports) */}
          {r.persons_data?.length > 0 ? (
            <div className="space-y-3">
              {r.persons_data.map((p: any, i: number) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="text-xs font-semibold text-gray-400 mb-2">Person {i + 1}{p.role ? ` — ${p.role}` : ""}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {p.name && <Field label="Name" value={p.name} />}
                    {p.dob  && <Field label="DOB"  value={p.dob} />}
                    {p.sex  && <Field label="Sex"  value={p.sex} />}
                    {p.race && <Field label="Race" value={p.race} />}
                    {p.address && (
                      <div className="col-span-2 sm:col-span-3"><Field label="Address" value={p.address} /></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Legacy / other report types */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {(r.first_name || r.last_name) && (
                <Field label="Subject Name" value={[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")} />
              )}
              <Field label="HOH / Tenant"     value={r.hoh_name} />
              <Field label="Persons Involved" value={r.persons_involved} />
              <Field label="Contact Name"     value={r.contact_name} />
              <Field label="DOB"              value={r.dob} />
              <Field label="Sex"              value={r.sex} />
              <Field label="Race"             value={r.race} />
              <Field label="OLN"              value={r.oln} />
              <Field label="Address"          value={r.address} />
            </div>
          )}
          {/* HOH always shown when present, even with structured persons */}
          {r.persons_data?.length > 0 && r.hoh_name && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Field label="HOH / Tenant on Record" value={r.hoh_name} />
            </div>
          )}
        </Section>
      )}

      {/* Vehicle */}
      {hasVehicleInfo && (
        <Section title="Vehicle">
          {/* Structured vehicles list (new incident reports) */}
          {r.vehicles_data?.length > 0 ? (
            <div className="space-y-3">
              {r.vehicles_data.map((v: any, i: number) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="text-xs font-semibold text-gray-400 mb-2">Vehicle {i + 1}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {v.make        && <Field label="Make"    value={v.make} />}
                    {v.model       && <Field label="Model"   value={v.model} />}
                    {v.year        && <Field label="Year"    value={v.year} />}
                    {v.color       && <Field label="Color"   value={v.color} />}
                    {v.plate       && <Field label="Plate"   value={v.plate} />}
                    {v.plate_state && <Field label="State" value={v.plate_state} />}
                    {v.description && (
                      <div className="col-span-2 sm:col-span-3"><Field label="Notes" value={v.description} /></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Legacy / other report types */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Plate"   value={r.plate === "NONE" || r.plate === "NOT_DISPLAYED" ? "None / Not Displayed" : r.plate} />
              <Field label="State"   value={r.plate === "NONE" || r.plate === "NOT_DISPLAYED" ? undefined : r.state} />
              <Field label="Make"    value={r.make} />
              <Field label="Model"   value={r.model} />
              <Field label="Color"   value={r.color} />
              <Field label="Year"    value={r.year} />
              <Field label="Vehicle" value={r.vehicle} />
            </div>
          )}
          {r.bolo_match && (
            <div className="mt-3 inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">⚠ BOLO Match</div>
          )}
          {r.tow_requested && (
            <div className="mt-2 text-xs text-gray-600">Tow requested{r.tow_requested_by ? ` by ${r.tow_requested_by}` : ""}{r.tow_reason ? ` — ${r.tow_reason}` : ""}</div>
          )}
        </Section>
      )}

      {/* Reference numbers */}
      {hasRefNums && (
        <Section title="Reference Numbers">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Reliant (SOC) Case #" value={r.reliant_case_no} />
            <Field label="HPD Report #"          value={r.hpd_report_no} />
            <Field label="ASG Report #"          value={r.asg_report_no} />
          </div>
          {r.reliant_notified === true && (
            <div className="mt-2 text-xs text-green-700">✓ Reliant notified{r.reliant_notified_at ? ` — ${r.reliant_notified_at}` : ""}</div>
          )}
          {r.reliant_notified === false && r.reliant_not_notified_reason && (
            <div className="mt-2 text-xs text-amber-700">Reliant not notified: {r.reliant_not_notified_reason}</div>
          )}
        </Section>
      )}

      {/* Narrative / description / notes */}
      {hasNarrative && (
        <Section title="Narrative">
          {r.narrative && (
            <div className="mb-4">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Patrol Narrative</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.narrative}</div>
            </div>
          )}
          {r.description && (
            <div className="mb-4">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.description}</div>
            </div>
          )}
          {r.action_taken && (
            <div className="mb-4">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Action Taken</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.action_taken}</div>
            </div>
          )}
          {r.notes && (
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.notes}</div>
            </div>
          )}
        </Section>
      )}

      {/* Shift Verification (#52) */}
      {Array.isArray(r.shift_checklist) && r.shift_checklist.length > 0 && (
        <Section title="Shift Verification">
          <div className="space-y-3">
            {(r.shift_checklist as { question: string; answer: string; explanation?: string }[]).map((item, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <div className="text-sm text-gray-800">{item.question}</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                    !item.answer        ? "bg-gray-100 text-gray-500" :
                    item.answer === "yes" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {!item.answer ? "—" : item.answer === "yes" ? "✓ Yes" : "✗ No"}
                  </span>
                  {item.explanation && (
                    <span className="text-xs text-gray-600 italic">{item.explanation}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <Section title={`Photos (${photos.length})`}>
          <div className="flex flex-wrap gap-3">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <SignedImage
                  src={url}
                  bucket="contact-photos"
                  alt={`Photo ${i + 1}`}
                  className="w-28 h-32 object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
                />
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Footer meta */}
      <div className="text-[10px] text-gray-400 mt-6 space-y-0.5">
        <div>Report ID: {id}</div>
        {r.created_at && (
          <div>Submitted {new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}{queue?.submitted_by ? ` by ${queue.submitted_by}` : ""}</div>
        )}
        {queue?.reviewed_by && queue?.reviewed_at && (
          <div>
            {qStatus === "sent" ? "Approved" : "Reviewed"} by {queue.reviewed_by} · {new Date(queue.reviewed_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>

      {/* ── INLINE EDIT FORM — below report so content stays visible ── */}
      {editMode && (
        <div ref={editFormRef} className="mt-6 bg-white border border-blue-300 rounded-xl p-5 no-print">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-bold text-gray-800">Edit Report</div>
            <button onClick={() => setEditMode(false)} className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer bg-transparent border-none">✕ Cancel</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(EDIT_FIELDS[type] || []).map(f => (
              <div key={f.key} className={f.type === "textarea" ? "col-span-full" : ""}>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{f.label}</label>
                {f.type === "textarea" ? (
                  <textarea
                    value={editFields[f.key] ?? ""}
                    onChange={e => setEditFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    rows={5}
                  />
                ) : (
                  <input
                    type={f.type}
                    value={editFields[f.key] ?? ""}
                    onChange={e => setEditFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                )}
              </div>
            ))}
          </div>
          {editError && <div className="mt-3 text-xs text-red-600 font-medium">{editError}</div>}
          <div className="flex gap-2 mt-5">
            <button
              onClick={saveEdit}
              disabled={editSaving}
              className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg border-none cursor-pointer disabled:opacity-50"
            >
              {editSaving ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-600 text-sm rounded-lg cursor-pointer hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { SignedImage } from "@/components/SignedImage"

const TYPE_CONFIG: Record<string, { table: string; label: string; color: string }> = {
  "incident":      { table: "incident_reports",             label: "Incident Report",    color: "red"     },
  "field-contact": { table: "contact_history",              label: "Field Contact",      color: "purple"  },
  "vehicle-fi":    { table: "vehicle_fi_logs",              label: "Vehicle FI",         color: "orange"  },
  "parking":       { table: "parking_violations",           label: "Parking Violation",  color: "amber"   },
  "daily-log":     { table: "officer_daily_logs",           label: "Daily Activity Log", color: "blue"    },
  "maintenance":   { table: "property_maintenance_reports", label: "Maintenance Report", color: "emerald" },
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

export default function ReportDetailPage() {
  const params = useParams()
  const type   = params.type as string
  const id     = params.id   as string
  const config = TYPE_CONFIG[type]

  const [report,        setReport]        = useState<Record<string, any> | null>(null)
  const [queue,         setQueue]         = useState<Record<string, any> | null>(null)
  const [communityName, setCommunityName] = useState("")
  const [loading,       setLoading]       = useState(true)
  const [notFound,      setNotFound]      = useState(false)

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
    })
  }, [type, id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading)  return <div className="p-8 text-gray-400 text-sm">Loading…</div>
  if (notFound || !config) return (
    <div className="p-8">
      <div className="text-gray-500 text-sm mb-3">Report not found.</div>
      <Link href="/vms/reports" className="text-blue-700 text-sm hover:underline">← Back to Reports</Link>
    </div>
  )

  const r      = report!
  const photos: string[] = r.photo_urls ?? (r.photo_url ? [r.photo_url] : [])

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

  const hasPersonInfo  = r.hoh_name || r.persons_involved || r.contact_name || r.first_name || r.last_name
  const hasVehicleInfo = r.plate || r.make || r.vehicle
  const hasRefNums     = r.reliant_case_no || r.hpd_report_no || r.asg_report_no
  const hasNarrative   = r.narrative || r.description || r.notes || r.action_taken

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* Breadcrumb + type badge */}
      <div className="mb-5">
        <Link href="/vms/reports" className="text-xs text-blue-700 hover:underline">← Reports</Link>
        <div className="flex flex-wrap items-center gap-2 mt-3">
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
      </div>

      {/* Revision notes */}
      {qStatus === "needs_revision" && queue?.revision_notes && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">Revision Requested</div>
          <div className="text-sm text-amber-900">{queue.revision_notes}</div>
        </div>
      )}

      {/* Core info */}
      <Section title="Report Details">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Date"           value={r.date} />
          <Field label="Time"           value={r.time} />
          <Field label="Shift"          value={r.shift} />
          <Field label="Officer"        value={r.officer_name || r.officer || r.created_by} />
          <Field label="Community"      value={communityName} />
          {locationLine && <Field label="Location"  value={locationLine} />}
          <Field label="Incident Type"  value={r.incident_type} />
          <Field label="Violation Type" value={r.violation_type} />
          <Field label="Issue Type"     value={r.issue_type} />
          <Field label="Reason"         value={r.reason} />
          <Field label="Weather"        value={r.weather} />
          <Field label="Status"         value={r.status} />
        </div>
      </Section>

      {/* Persons */}
      {hasPersonInfo && (
        <Section title="Persons Involved">
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
        </Section>
      )}

      {/* Vehicle */}
      {hasVehicleInfo && (
        <Section title="Vehicle">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Plate"   value={r.plate === "NONE" || r.plate === "NOT_DISPLAYED" ? "None / Not Displayed" : r.plate} />
            <Field label="State"   value={r.plate === "NONE" || r.plate === "NOT_DISPLAYED" ? undefined : r.state} />
            <Field label="Make"    value={r.make} />
            <Field label="Model"   value={r.model} />
            <Field label="Color"   value={r.color} />
            <Field label="Year"    value={r.year} />
            <Field label="Vehicle" value={r.vehicle} />
          </div>
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
      </div>
    </div>
  )
}

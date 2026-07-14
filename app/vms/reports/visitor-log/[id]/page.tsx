"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { SignedImage } from "@/components/SignedImage"
import { ADMIN_EMAILS } from "@/lib/admin"

function utc(ts: string) {
  return ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z"
}

function fmtDateTime(ts: string | null) {
  if (!ts) return "—"
  return new Date(utc(ts)).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  // date-only strings (YYYY-MM-DD) — parse at noon to avoid timezone shift
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })
}

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
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

export default function VisitorLogDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [record,        setRecord]        = useState<Record<string, any> | null>(null)
  const [communityName, setCommunityName] = useState("")
  const [loading,       setLoading]       = useState(true)
  const [notFound,      setNotFound]      = useState(false)
  const [isAdmin,       setIsAdmin]       = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [photos,        setPhotos]        = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(ADMIN_EMAILS.includes(user?.email || ""))
    })
  }, [])

  async function deleteRecord() {
    if (!record) return
    const label = `${record.first_name || ""} ${record.last_name || ""}`.trim() || "this entry"
    if (!confirm(`Permanently delete visitor log for ${label}?\n\nThis cannot be undone.`)) return
    setDeleting(true)
    const { error } = await supabase.from("visitor_logs").delete().eq("id", id)
    if (error) { setDeleting(false); alert("Delete failed: " + error.message); return }
    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase.from("audit_logs").insert({
        user_email: user?.email || "unknown",
        action: "deleted", resource_type: "Visitor Log", resource_id: id,
        detail: `Deleted visitor log for ${label}`,
        created_at: new Date().toISOString(),
      })
    })
    router.replace("/vms/reports")
  }

  useEffect(() => {
    supabase.from("visitor_logs").select("*").eq("id", id).maybeSingle()
      .then(({ data }) => {
        if (!data) { setNotFound(true); setLoading(false); return }
        setRecord(data)
        // All photos captured for this person, across visits (item #58).
        if (data.visitor_id) {
          supabase.from("visitor_photos").select("*")
            .eq("visitor_id", data.visitor_id)
            .order("captured_at", { ascending: false })
            .then(({ data: ph }) => setPhotos(ph || []))
        }
        if (data.community_id) {
          supabase.from("communities").select("name").eq("id", data.community_id).maybeSingle()
            .then(({ data: c }) => setCommunityName(c?.name ?? ""))
        }
        setLoading(false)
      })
  }, [id])

  if (loading)  return <div className="p-8 text-gray-400 text-sm animate-pulse">Loading…</div>
  if (notFound) return (
    <div className="p-8">
      <div className="text-gray-500 text-sm mb-3">Visitor log entry not found.</div>
      <Link href="/vms/reports" className="text-blue-700 text-sm hover:underline">← Back to Reports</Link>
    </div>
  )

  const r = record!

  // Prefer DL-scanned name if available, fall back to manually entered
  const displayFirst  = r.dl_first_name  || r.first_name  || ""
  const displayMiddle = r.middle_name    || ""
  const displayLast   = r.dl_last_name   || r.last_name   || ""
  const fullName      = [displayFirst, displayMiddle, displayLast].filter(Boolean).join(" ") || "—"

  const checkInTs   = r.check_in_time || r.created_at
  const isDenied    = r.status === "denied" || !!r.denial_reason
  const hasVehicle  = !!r.vehicle_plate
  const hasDL       = r.dl_scanned || r.dl_number || r.oln
  const hasNotes    = r.notes || r.denial_reason
  const photo       = r.photo_url

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      {/* Nav */}
      <div className="mb-5 no-print flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-xs text-blue-700 hover:text-blue-900 bg-transparent border-none cursor-pointer p-0"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={deleteRecord}
              disabled={deleting}
              className="px-3 py-1.5 text-xs font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer border-none disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "🗑 Delete Record"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200 cursor-pointer border-none"
          >
            🖨 Print
          </button>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200">
          Visitor Log
        </span>
        {isDenied ? (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
            ✕ Entry Denied
          </span>
        ) : (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            ✓ Allowed Entry
          </span>
        )}
        {r.watchlist_hit && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-700 text-white">
            ⚠ Watchlist Hit
          </span>
        )}
        {r.dl_scanned && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
            🪪 DL Scanned
          </span>
        )}
      </div>

      {/* Check-In Details */}
      <Section title="Check-In Details">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Check-In Time"  value={fmtDateTime(checkInTs)} />
          <Field label="Community"      value={communityName} />
          <Field label="Person Type"    value={r.person_type} />
          <Field label="Entry Method"   value={r.entry_method} />
          <Field label="Status"         value={isDenied ? "Denied" : "Allowed"} />
        </div>
      </Section>

      {/* Visitor Information */}
      <Section title="Visitor">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="col-span-2 sm:col-span-3">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Name</div>
            <div className="text-lg font-semibold text-gray-900 capitalize">{fullName}</div>
          </div>
          <Field label="Destination Unit"   value={r.unit_number || r.apartment} />
          <Field label="Visiting Resident"  value={r.resident_name} />
          <Field label="Destination"        value={r.destination} />
          <Field label="Vehicle Plate"      value={r.vehicle_plate} />
        </div>
        {isDenied && r.denial_reason && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Denial Reason</div>
            <div className="text-sm text-red-900">{r.denial_reason}</div>
          </div>
        )}
      </Section>

      {/* Driver's License */}
      {hasDL && (
        <Section title="Driver's License / ID">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="DL Number"     value={r.dl_number || r.license_number || r.oln} />
            <Field label="State Issued"  value={r.dl_state || r.state_of_issue} />
            <Field label="Date of Birth" value={fmtDate(r.dob || r.visitor_dob)} />
            <Field label="Sex"           value={r.sex} />
            <Field label="Height"        value={r.height} />
            <Field label="Eye Color"     value={r.eye_color} />
            {(r.address || r.city || r.state_of_issue || r.zip) && (
              <div className="col-span-2 sm:col-span-3">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Address on File</div>
                <div className="text-sm text-gray-900">
                  {[r.address, r.city, r.state_of_issue, r.zip].filter(Boolean).join(", ")}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Vehicle */}
      {hasVehicle && (
        <Section title="Vehicle">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Plate" value={r.vehicle_plate} />
          </div>
        </Section>
      )}

      {/* Notes */}
      {hasNotes && !isDenied && r.notes && (
        <Section title="Notes">
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{r.notes}</div>
        </Section>
      )}

      {/* Photo */}
      {photo && (
        <Section title="Photo">
          <a href={photo} target="_blank" rel="noopener noreferrer" className="inline-block">
            <SignedImage
              src={photo}
              bucket="contact-photos"
              alt="Visitor photo"
              className="w-32 h-36 object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
            />
          </a>
        </Section>
      )}

      {/* Visitor photos — ID + Live, attached to the person across visits (#58) */}
      {photos.length > 0 && (
        <Section title={`Visitor Photos (${photos.length})`}>
          {(["id", "live"] as const).map(pt => {
            const group = photos.filter(p => p.photo_type === pt)
            if (group.length === 0) return null
            return (
              <div key={pt} className="mb-3 last:mb-0">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{pt === "id" ? "ID Photos" : "Live Photos"}</div>
                <div className="flex flex-wrap gap-2">
                  {group.map(p => (
                    <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="inline-block"
                      title={`${p.captured_at ? fmtDateTime(p.captured_at) : ""}${p.captured_by ? ` · ${p.captured_by}` : ""}`}>
                      <SignedImage src={p.url} bucket="photos" alt={`${pt} photo`}
                        className="w-24 h-28 object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="text-[10px] text-gray-400 mt-2">Photos attach to the person and appear on every check-in for {fullName}.</div>
        </Section>
      )}

      {/* Intel link */}
      <div className="mb-4 no-print">
        <Link
          href={`/vms/intel?search=${encodeURIComponent(fullName)}`}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-700 hover:text-indigo-900 font-medium"
        >
          🔍 View full Intel profile for {fullName}
        </Link>
      </div>

      {/* Footer */}
      <div className="text-[10px] text-gray-400 mt-2 space-y-0.5">
        <div>Record ID: {id}</div>
        {checkInTs && (
          <div>Logged {fmtDateTime(checkInTs)}</div>
        )}
      </div>
    </div>
  )
}

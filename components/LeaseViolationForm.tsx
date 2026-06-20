"use client"

// Lease-violation stage (item 24): issue a lease-violation onto a report record.
// Two modes:
//   A) existingRecord provided -> UPDATE that incident_reports row with the
//      violation stage (community/unit/HOH shown read-only as context).
//   B) standalone -> INSERT a brand-new incident_reports row carrying the
//      violation stage, with a community picker + structured location + HOH snapshot.
// In both modes an offenders sub-form is captured into violation_offenders, with
// an inline ban-list cross-check via the match_ban_list RPC.

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import LocationField, { LocationValue, EMPTY_LOCATION } from "@/components/LocationField"
import { buildHohSnapshot, EMPTY_SNAPSHOT } from "@/lib/hohSnapshot"

const inputCls = "w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
const labelCls = "block text-xs font-medium text-gray-600 mb-1"
const textareaCls = inputCls + " resize-y"

type Community = { id: string; name: string }

type ExistingRecord = {
  id: string
  community_id: string
  building?: string | null
  apartment?: string | null
  hoh_name?: string | null
  location?: string | null
} | null

type RecordSource = "officer" | "reliant" | "management"
type ViolationCategory = "security_community" | "lease_compliance"
type NoticeLevel = "1st" | "2nd" | "final" | "fine_lease_action"
type DistributionMethod = "door" | "mailed" | "emailed" | "handed"
type OffenderRelationship = "hoh" | "dependent" | "guest" | "other_unknown"

type ViolationType = {
  id: string
  category: string
  label: string
  active: boolean
  sort_order: number | null
}

type Offender = {
  first: string
  last: string
  relationship: OffenderRelationship
  description: string
  ban_match: boolean
  ban_watchlist_id: string | null
  checking: boolean
}

const NOTICE_LEVELS: { value: NoticeLevel; label: string }[] = [
  { value: "1st", label: "1st notice" },
  { value: "2nd", label: "2nd notice" },
  { value: "final", label: "Final notice" },
  { value: "fine_lease_action", label: "Fine or lease action" },
]

const DISTRIBUTION_METHODS: { value: DistributionMethod; label: string }[] = [
  { value: "door", label: "Posted on door" },
  { value: "mailed", label: "Mailed" },
  { value: "emailed", label: "Emailed" },
  { value: "handed", label: "Handed to resident" },
]

const RELATIONSHIPS: { value: OffenderRelationship; label: string }[] = [
  { value: "hoh", label: "HOH" },
  { value: "dependent", label: "Dependent" },
  { value: "guest", label: "Guest" },
  { value: "other_unknown", label: "Other / unknown" },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyOffender(): Offender {
  return {
    first: "",
    last: "",
    relationship: "guest",
    description: "",
    ban_match: false,
    ban_watchlist_id: null,
    checking: false,
  }
}

export default function LeaseViolationForm({
  communities,
  defaultCommunityId,
  existingRecord,
  isAdmin,
  onSaved,
}: {
  communities: Community[]
  defaultCommunityId: string
  existingRecord?: ExistingRecord
  isAdmin: boolean
  onSaved?: () => void
}) {
  // Mode B (standalone) fields
  const [communityId, setCommunityId] = useState(defaultCommunityId)
  const [recordSource, setRecordSource] = useState<RecordSource>("officer")
  const [locationValue, setLocationValue] = useState<LocationValue>(EMPTY_LOCATION)
  const [eventDate, setEventDate] = useState<string>(today())
  const [description, setDescription] = useState("")

  // Violation-stage fields (both modes)
  const [category, setCategory] = useState<ViolationCategory>("security_community")
  const [violationTypeId, setViolationTypeId] = useState("")
  const [otherType, setOtherType] = useState("")
  const [noticeLevel, setNoticeLevel] = useState<NoticeLevel>("1st")
  const [distributionMethod, setDistributionMethod] = useState<DistributionMethod>("door")
  const [lvlPostedDate, setLvlPostedDate] = useState<string>(today())
  const [hohAck, setHohAck] = useState(false)
  const [issuedBy, setIssuedBy] = useState("")

  // Offenders
  const [offenders, setOffenders] = useState<Offender[]>([emptyOffender()])

  // Lookups + status
  const [violationTypes, setViolationTypes] = useState<ViolationType[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // The community used for ban-list checks: existing record's community (Mode A)
  // or the picked community (Mode B).
  const activeCommunityId = existingRecord ? existingRecord.community_id : communityId

  // Load active violation types once.
  useEffect(() => {
    let active = true
    supabase
      .from("violation_types")
      .select("*")
      .eq("active", true)
      .order("category")
      .order("sort_order")
      .then(({ data }) => {
        if (!active) return
        setViolationTypes((data as ViolationType[]) || [])
      })
    return () => { active = false }
  }, [])

  // Default "Issued by" to the logged-in user's email-derived name.
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      const email = data?.user?.email
      if (!email) return
      const name = email
        .split("@")[0]
        .replace(/\./g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
      setIssuedBy((prev) => prev || name)
    })
    return () => { active = false }
  }, [])

  // When record_source is 'management', force the lease_compliance category.
  useEffect(() => {
    if (recordSource === "management" && category !== "lease_compliance") {
      setCategory("lease_compliance")
      setViolationTypeId("")
    }
  }, [recordSource, category])

  const typesForCategory = violationTypes.filter((t) => t.category === category)

  function setOffender(idx: number, patch: Partial<Offender>) {
    setOffenders((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function addOffender() {
    setOffenders((rows) => [...rows, emptyOffender()])
  }

  function removeOffender(idx: number) {
    setOffenders((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)))
  }

  async function checkBan(idx: number) {
    const o = offenders[idx]
    const first = o.first.trim()
    const last = o.last.trim()
    if (!first || !last || !activeCommunityId) return
    setOffender(idx, { checking: true })
    try {
      const { data } = await supabase.rpc("match_ban_list", {
        p_community_id: activeCommunityId,
        p_first_name: first,
        p_last_name: last,
      })
      const watchlistId = (data as string) || null
      setOffender(idx, {
        ban_match: !!watchlistId,
        ban_watchlist_id: watchlistId,
        checking: false,
      })
    } catch {
      setOffender(idx, { checking: false })
    }
  }

  function resolveViolationType(): string | null {
    if (violationTypeId === "__other__") {
      return otherType.trim() || null
    }
    const t = violationTypes.find((v) => v.id === violationTypeId)
    return t ? t.label : null
  }

  function resetForm() {
    setLocationValue(EMPTY_LOCATION)
    setEventDate(today())
    setDescription("")
    setCategory(recordSource === "management" ? "lease_compliance" : "security_community")
    setViolationTypeId("")
    setOtherType("")
    setNoticeLevel("1st")
    setDistributionMethod("door")
    setLvlPostedDate(today())
    setHohAck(false)
    setOffenders([emptyOffender()])
  }

  async function insertOffenders(reportId: string) {
    const rows = offenders
      .filter((o) => o.first.trim() || o.last.trim())
      .map((o) => ({
        report_id: reportId,
        name: `${o.first.trim()} ${o.last.trim()}`.trim(),
        relationship: o.relationship,
        description: o.description.trim() || null,
        ban_match: o.ban_match,
        ban_watchlist_id: o.ban_watchlist_id,
      }))
    if (rows.length === 0) return
    const { error: offErr } = await supabase.from("violation_offenders").insert(rows)
    if (offErr) throw offErr
  }

  async function handleSubmit() {
    setError(null)
    setSuccess(null)

    const violationType = resolveViolationType()
    if (!violationType) {
      setError("Select a violation type (or enter an “Other” type).")
      return
    }
    if (!category) {
      setError("Choose a violation category.")
      return
    }

    setSaving(true)
    try {
      const ackAt = hohAck ? new Date().toISOString() : null

      if (existingRecord) {
        // Mode A — issue the violation stage onto the existing incident.
        const { error: updErr } = await supabase
          .from("incident_reports")
          .update({
            lvl_issued: true,
            violation_category: category,
            violation_type: violationType,
            notice_level: noticeLevel,
            distribution_method: distributionMethod,
            lvl_posted_date: lvlPostedDate || null,
            hoh_ack: hohAck,
            hoh_ack_at: ackAt,
            issued_by: issuedBy.trim() || null,
            // record_source intentionally left as-is.
          })
          .eq("id", existingRecord.id)
        if (updErr) throw updErr

        await insertOffenders(existingRecord.id)
        setSuccess("Lease violation issued onto the report.")
        onSaved?.()
      } else {
        // Mode B — standalone: create a new incident_reports row.
        const isUnit = locationValue.location_type === "unit"
        const snapshot = isUnit
          ? await buildHohSnapshot(communityId, locationValue.unit_number, eventDate)
          : EMPTY_SNAPSHOT

        const payload: any = {
          community_id: communityId,
          date: eventDate || null,
          time: null,
          incident_type: null,
          description: description.trim() || null,
          officer_name: issuedBy.trim() || null,
          record_source: recordSource,
          lvl_issued: true,
          violation_category: category,
          violation_type: violationType,
          notice_level: noticeLevel,
          distribution_method: distributionMethod,
          lvl_posted_date: lvlPostedDate || null,
          hoh_ack: hohAck,
          hoh_ack_at: ackAt,
          issued_by: issuedBy.trim() || null,
          location: locationValue.location || null,
          location_type: locationValue.location_type,
          building: locationValue.building,
          apartment: locationValue.apartment,
          common_area: locationValue.common_area,
          // HOH only applies to a residential unit, never a common area.
          hoh_name: isUnit ? snapshot.hoh_name : null,
          hoh_resident_id: isUnit ? snapshot.hoh_resident_id : null,
          household_snapshot: isUnit ? snapshot.household_snapshot : null,
          created_at: new Date().toISOString(),
        }

        const { data: inserted, error: insErr } = await supabase
          .from("incident_reports")
          .insert(payload)
          .select("id")
          .single()
        if (insErr) throw insErr

        await insertOffenders((inserted as any).id)
        setSuccess("Lease violation record created.")
        resetForm()
        onSaved?.()
      }
    } catch (e: any) {
      setError(e?.message || "Failed to save the lease violation.")
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        Issuing a lease violation requires Supervisor/Admin access.
      </div>
    )
  }

  const communityName = (id: string) =>
    communities.find((c) => c.id === id)?.name || id

  return (
    <div className="space-y-5">
      {existingRecord ? (
        // Mode A context (read-only).
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-medium text-gray-900">Issuing onto existing report</div>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <div><span className="text-gray-500">Community:</span> {communityName(existingRecord.community_id)}</div>
            <div>
              <span className="text-gray-500">Unit:</span>{" "}
              {existingRecord.building || existingRecord.apartment
                ? `${existingRecord.building ?? ""}${existingRecord.apartment ? "-" + existingRecord.apartment : ""}`
                : existingRecord.location || "—"}
            </div>
            <div><span className="text-gray-500">HOH:</span> {existingRecord.hoh_name || "—"}</div>
          </div>
        </div>
      ) : (
        // Mode B inputs.
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Community</label>
            <select
              value={communityId}
              onChange={(e) => setCommunityId(e.target.value)}
              className={inputCls}
            >
              <option value="">Select community…</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Record source</label>
            <select
              value={recordSource}
              onChange={(e) => setRecordSource(e.target.value as RecordSource)}
              className={inputCls}
            >
              <option value="officer">Community violation (officer)</option>
              <option value="management">Late rent / lease compliance (management)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Location</label>
            <LocationField
              communityId={communityId}
              value={locationValue}
              onChange={setLocationValue}
              inputCls={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Event date</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description of the violation"
              className={textareaCls}
            />
          </div>
        </div>
      )}

      {/* Violation stage (both modes) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>Category</label>
          <div className="flex gap-2">
            {(["security_community", "lease_compliance"] as ViolationCategory[]).map((c) => {
              const disabled = recordSource === "management" && c !== "lease_compliance" && !existingRecord
              const active = category === c
              return (
                <button
                  key={c}
                  type="button"
                  disabled={disabled}
                  onClick={() => { setCategory(c); setViolationTypeId("") }}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300"
                  } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {c === "security_community" ? "Security / community" : "Lease compliance"}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className={labelCls}>Violation type</label>
          <select
            value={violationTypeId}
            onChange={(e) => setViolationTypeId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select type…</option>
            {typesForCategory.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
            <option value="__other__">Other (specify)</option>
          </select>
          {violationTypeId === "__other__" && (
            <input
              value={otherType}
              onChange={(e) => setOtherType(e.target.value)}
              placeholder="Describe the violation type"
              className={inputCls + " mt-2"}
            />
          )}
        </div>

        <div>
          <label className={labelCls}>Notice level</label>
          <select
            value={noticeLevel}
            onChange={(e) => setNoticeLevel(e.target.value as NoticeLevel)}
            className={inputCls}
          >
            {NOTICE_LEVELS.map((n) => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Distribution method</label>
          <select
            value={distributionMethod}
            onChange={(e) => setDistributionMethod(e.target.value as DistributionMethod)}
            className={inputCls}
          >
            {DISTRIBUTION_METHODS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>LVL posted date</label>
          <input
            type="date"
            value={lvlPostedDate}
            onChange={(e) => setLvlPostedDate(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Issued by</label>
          <input
            value={issuedBy}
            onChange={(e) => setIssuedBy(e.target.value)}
            placeholder="Your name"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={hohAck}
              onChange={(e) => setHohAck(e.target.checked)}
              className="h-4 w-4"
            />
            HOH delivery acknowledged
          </label>
        </div>
      </div>

      {/* Offenders sub-form */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-900">Offenders</div>
          <button
            type="button"
            onClick={addOffender}
            className="text-sm text-blue-600 hover:underline"
          >
            + Add offender
          </button>
        </div>

        {offenders.map((o, idx) => (
          <div key={idx} className="rounded-md border border-gray-200 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First name</label>
                <input
                  value={o.first}
                  onChange={(e) => setOffender(idx, { first: e.target.value })}
                  onBlur={() => checkBan(idx)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Last name</label>
                <input
                  value={o.last}
                  onChange={(e) => setOffender(idx, { last: e.target.value })}
                  onBlur={() => checkBan(idx)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Relationship</label>
                <select
                  value={o.relationship}
                  onChange={(e) => setOffender(idx, { relationship: e.target.value as OffenderRelationship })}
                  className={inputCls}
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Description (optional)</label>
                <input
                  value={o.description}
                  onChange={(e) => setOffender(idx, { description: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => checkBan(idx)}
                  disabled={!o.first.trim() || !o.last.trim() || o.checking}
                  className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 disabled:opacity-40"
                >
                  {o.checking ? "Checking…" : "Check ban list"}
                </button>
                {o.ban_match && (
                  <span className="text-xs font-semibold text-red-600">⛔ On ban list</span>
                )}
              </div>
              {offenders.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeOffender(idx)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {success && <div className="text-sm text-green-600">{success}</div>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="px-4 py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : existingRecord ? "Issue lease violation" : "Create lease violation"}
      </button>
    </div>
  )
}

"use client"

// Unit Activity History (#25): a per-unit cross-record timeline that reads the
// `public.unit_activity` database view. The view unions incident_reports,
// parking_violations, vehicle_fi_logs and visitor_logs into a single
// chronological feed, each event attributed to the Head of Household at the
// time it occurred. Self-contained: drives its own community/building/apartment
// /date filters off the shared "asg-current-community-id" localStorage key.
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"

const inputCls = "w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
const labelCls = "block text-xs font-medium text-gray-600 mb-1"

// Tailwind badge styling per record_type.
const TYPE_BADGE: Record<string, string> = {
  "Incident":         "bg-red-100 text-red-700 border border-red-200",
  "Lease Violation":  "bg-amber-100 text-amber-800 border border-amber-200",
  "Parking":          "bg-yellow-100 text-yellow-800 border border-yellow-200",
  "Vehicle FI":       "bg-orange-100 text-orange-800 border border-orange-200",
  "Visitor":          "bg-purple-100 text-purple-700 border border-purple-200",
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0]
}

function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}

function fmtDateTime(value: string): string {
  if (!value) return "—"
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

function fmtDateOnly(value: string): string {
  if (!value) return "—"
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export default function UnitActivityTab() {
  const [communities,    setCommunities]    = useState<any[]>([])
  const [communityId,    setCommunityId]    = useState("")
  const [building,       setBuilding]       = useState("")
  const [apartment,      setApartment]      = useState("")
  const [fromDate,       setFromDate]       = useState(daysAgoISO(90))
  const [toDate,         setToDate]         = useState(todayISO())
  const [leaseOnly,      setLeaseOnly]      = useState(false)

  const [rows,           setRows]           = useState<any[]>([])
  const [loading,        setLoading]        = useState(false)
  const [loadedOnce,     setLoadedOnce]     = useState(false)

  // Load the community list once, then default the selection to the shared
  // localStorage key (mirrors PostOrdersTab) or the first community.
  useEffect(() => {
    let active = true
    async function initCommunities() {
      const { data } = await supabase.from("communities").select("id,name").order("name")
      if (!active) return
      const list = data || []
      setCommunities(list)
      const saved = typeof window !== "undefined"
        ? localStorage.getItem("asg-current-community-id") || ""
        : ""
      const initial = list.find((c: any) => c.id === saved) || list[0]
      if (initial) setCommunityId(initial.id)
    }
    initCommunities()
    return () => { active = false }
  }, [])

  // Auto-load whenever the selected community changes (the required filter).
  useEffect(() => {
    if (communityId) void loadActivity(communityId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId])

  async function loadActivity(cid?: string) {
    const id = cid || communityId
    if (!id) return
    setLoading(true)

    let query = supabase
      .from("unit_activity")
      .select("*")
      .eq("community_id", id)

    if (building.trim())  query = query.eq("building", building.trim())
    if (apartment.trim()) query = query.eq("apartment", apartment.trim())
    if (fromDate)         query = query.gte("event_at", fromDate)
    if (toDate)           query = query.lte("event_at", toDate + "T23:59:59")
    if (leaseOnly)        query = query.eq("record_type", "Lease Violation")

    query = query.order("event_at", { ascending: false }).limit(500)

    const { data } = await query
    setRows(data || [])
    setLoading(false)
    setLoadedOnce(true)
  }

  function selectCommunity(id: string) {
    setCommunityId(id)
    if (typeof window !== "undefined" && id) {
      const c = communities.find((x: any) => x.id === id)
      localStorage.setItem("asg-current-community-id", id)
      if (c) localStorage.setItem("asg-current-community-name", c.name)
    }
  }

  // Per-type breakdown for the summary header.
  const breakdown: Record<string, number> = {}
  for (const r of rows) {
    const t = r.record_type || "Other"
    breakdown[t] = (breakdown[t] || 0) + 1
  }

  // Group the (already sorted) rows by calendar date for visual grouping.
  const groups: { date: string; items: any[] }[] = []
  for (const r of rows) {
    const day = r.event_at ? new Date(r.event_at).toISOString().split("T")[0] : "—"
    const last = groups[groups.length - 1]
    if (last && last.date === day) last.items.push(r)
    else groups.push({ date: day, items: [r] })
  }

  return (
    <div>
      {/* FILTER BAR */}
      <div className="bg-white border border-gray-300 rounded-md p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className={labelCls}>Community</label>
            <select className={inputCls} value={communityId} onChange={e => selectCommunity(e.target.value)}>
              {communities.length === 0 && <option value="">Loading…</option>}
              {communities.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Building</label>
            <input className={inputCls} value={building} onChange={e => setBuilding(e.target.value)} placeholder="Any" />
          </div>
          <div>
            <label className={labelCls}>Apartment</label>
            <input className={inputCls} value={apartment} onChange={e => setApartment(e.target.value)} placeholder="Any" />
          </div>
          <div>
            <label className={labelCls}>From</label>
            <input type="date" className={inputCls} value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" className={inputCls} value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3 mt-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={leaseOnly} onChange={e => setLeaseOnly(e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            Lease Violations only
          </label>
          <button onClick={() => loadActivity()} disabled={!communityId || loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 border-none cursor-pointer disabled:opacity-50">
            {loading ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {/* SUMMARY HEADER */}
      <div className="mb-3">
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-sm font-semibold text-gray-800">{rows.length} event{rows.length === 1 ? "" : "s"}</span>
          {Object.keys(breakdown).sort().map(t => (
            <span key={t} className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${TYPE_BADGE[t] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
              {t}: {breakdown[t]}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Activity is attributed to the Head of Household at the time of each event.
        </p>
      </div>

      {/* STATES */}
      {loading && <div className="text-gray-500 text-sm py-10 text-center">Loading activity…</div>}

      {!loading && loadedOnce && rows.length === 0 && (
        <div className="text-gray-500 text-sm py-10 text-center">No activity for this filter</div>
      )}

      {/* TIMELINE */}
      {!loading && rows.length > 0 && (
        <div className="space-y-4">
          {/* TODO: tenancy markers from tenancy_history once archival is live */}
          {groups.map(group => (
            <div key={group.date}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {fmtDateOnly(group.date)}
              </div>
              <div className="space-y-2">
                {group.items.map((r: any) => {
                  const refs = [
                    r.reliant_case_no ? { label: "Reliant", val: r.reliant_case_no } : null,
                    r.hpd_report_no   ? { label: "HPD",     val: r.hpd_report_no }   : null,
                    r.asg_report_no   ? { label: "ASG",     val: r.asg_report_no }   : null,
                  ].filter(Boolean) as { label: string; val: string }[]

                  const loc = [r.building, r.apartment].filter(Boolean).join(" / ")

                  return (
                    <div key={`${r.source_table}-${r.source_id}`}
                      className="bg-white border border-gray-300 rounded-md p-3 flex flex-col gap-1.5">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${TYPE_BADGE[r.record_type] || "bg-gray-100 text-gray-700 border border-gray-200"}`}>
                          {r.record_type}
                        </span>
                        <span className="text-xs text-gray-500">{fmtDateTime(r.event_at)}</span>
                        {loc && <span className="text-xs text-gray-600 font-medium">{loc}</span>}
                        {r.record_source && r.record_source !== "officer" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-600 border border-gray-200">
                            {r.record_source}
                          </span>
                        )}
                      </div>

                      {r.detail && <div className="text-sm text-gray-800">{r.detail}</div>}

                      <div className="flex items-center flex-wrap gap-2">
                        {r.hoh_name && <span className="text-xs text-gray-600">HOH: {r.hoh_name}</span>}
                        {refs.map(ref => (
                          <span key={ref.label}
                            className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-[11px] font-mono text-gray-700">
                            {ref.label} {ref.val}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

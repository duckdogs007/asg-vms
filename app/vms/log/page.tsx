"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Community } from "@/lib/types"

// One visitor-log line item. Columns come from public.visitor_logs.
interface LogRow {
  id:             string
  first_name:     string | null
  last_name:      string | null
  middle_name:    string | null
  person_type:    string | null
  visitor_type:   string | null
  community_id:   string | null
  unit_number:    string | null
  resident_name:  string | null
  dl_scanned:     boolean | null
  watchlist_hit:  boolean | null
  dob:            string | null
  oln:            string | null
  address:        string | null
  city:           string | null
  state_of_issue: string | null
  zip:            string | null
  sex:            string | null
  created_at:     string | null
}

function asUTC(ts: string): string {
  return ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z"
}
function dayLabel(ts: string | null): string {
  if (!ts) return "Unknown date"
  return new Date(asUTC(ts)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}
function timeLabel(ts: string | null): string {
  if (!ts) return ""
  return new Date(asUTC(ts)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}
function fmtDOB(d: string | null): string {
  if (!d) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : d
}

export default function VmsScanLogPage() {
  const [communities, setCommunities] = useState<Community[]>([])
  const [communityId, setCommunityId] = useState("")   // "" = all locations
  const [scannedOnly, setScannedOnly] = useState(false)
  const [rows,        setRows]        = useState<LogRow[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    supabase.from("communities").select("id,name").order("name").then(({ data }) => {
      if (data) setCommunities(data as Community[])
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from("visitor_logs")
      .select("id, first_name, last_name, middle_name, person_type, visitor_type, community_id, unit_number, resident_name, dl_scanned, watchlist_hit, dob, oln, address, city, state_of_issue, zip, sex, created_at")
      .order("created_at", { ascending: false })
      .limit(300)
    if (communityId)  q = q.eq("community_id", communityId)
    if (scannedOnly)  q = q.eq("dl_scanned", true)
    const { data } = await q
    setRows((data as LogRow[]) || [])
    setLoading(false)
  }, [communityId, scannedOnly])

  useEffect(() => { load() }, [load])

  const communityName = (id: string | null) =>
    id ? (communities.find(c => c.id === id)?.name || "—") : "—"

  // Group the (already date-sorted) rows into date buckets for headers.
  const groups: { label: string; items: LogRow[] }[] = []
  for (const r of rows) {
    const label = dayLabel(r.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(r)
    else groups.push({ label, items: [r] })
  }

  return (
    <div className="p-4 sm:p-5 pb-16 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">Scan Log</h1>
      <p className="text-sm text-gray-500 mb-5">
        Recent visitor check-ins, newest first. Driver-license scans are auto-logged; each line shows the captured details.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={communityId}
          onChange={e => setCommunityId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <option value="">All locations</option>
          {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={scannedOnly} onChange={e => setScannedOnly(e.target.checked)} className="w-4 h-4" />
          Scanned only
        </label>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-md border-none cursor-pointer disabled:opacity-50"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
        <span className="text-xs text-gray-400 ml-auto">{rows.length} entr{rows.length === 1 ? "y" : "ies"}{rows.length >= 300 ? " (most recent 300)" : ""}</span>
      </div>

      {loading && rows.length === 0 && (
        <div className="text-gray-400 text-sm py-12 text-center">Loading…</div>
      )}
      {!loading && rows.length === 0 && (
        <div className="text-gray-400 text-sm py-12 text-center">No visitor entries recorded yet.</div>
      )}

      {groups.map(g => (
        <div key={g.label} className="mb-6">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 sticky top-0 bg-white/90 py-1">{g.label}</div>
          <div className="flex flex-col gap-1.5">
            {g.items.map(r => {
              const name = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ").trim() || "Unknown"
              const type = r.person_type || r.visitor_type || "Visitor"
              const addr = [r.address, r.city, [r.state_of_issue, r.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")
              const meta = [
                r.unit_number ? `Unit ${r.unit_number}` : null,
                r.resident_name ? `visiting ${r.resident_name}` : null,
                r.dob ? `DOB ${fmtDOB(r.dob)}` : null,
                r.oln ? `OLN ${r.oln}` : null,
                r.sex || null,
              ].filter(Boolean).join(" · ")
              return (
                <div
                  key={r.id}
                  className={`bg-white border rounded-lg px-4 py-2.5 ${r.watchlist_hit ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                >
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-gray-400 tabular-nums">{timeLabel(r.created_at)}</span>
                        {r.dl_scanned
                          ? <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800">📷 Scanned</span>
                          : <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-600">📝 Manual</span>}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800">{type}</span>
                        {r.watchlist_hit && (
                          <span className="px-2 py-0.5 bg-red-700 text-white rounded text-[10px] font-bold uppercase">⛔ Watchlist</span>
                        )}
                        <span className="font-bold text-gray-900 capitalize truncate">{name}</span>
                      </div>
                      {meta && <div className="text-sm text-gray-600 mt-1">{meta}</div>}
                      {addr && <div className="text-xs text-gray-400 mt-0.5 truncate">{addr}</div>}
                    </div>
                    <div className="text-right text-xs text-gray-500 shrink-0">
                      <div className="font-semibold text-gray-700">📍 {communityName(r.community_id)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="mt-8">
        <Link href="/vms" className="text-sm text-blue-700 hover:text-blue-900">← Back to Check-In</Link>
      </div>
    </div>
  )
}

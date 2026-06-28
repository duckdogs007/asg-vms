"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Community } from "@/lib/types"

type ResultType = "Visitor" | "Resident" | "Watchlist" | "Vehicle Alert" | "BOLO" | "Parking" | "Vehicle FI" | "Denied Entry"

interface SearchResult {
  type:     ResultType
  name:     string
  detail:   string
  location: string
  date?:    string | null
  firearm?: boolean
  link?:    string
}

const TYPE_BADGE: Record<ResultType, string> = {
  "Visitor":      "bg-indigo-100 text-indigo-800",
  "Resident":     "bg-green-100  text-green-800",
  "Watchlist":    "bg-red-100    text-red-800",
  "Vehicle Alert":"bg-orange-100 text-orange-800",
  "BOLO":         "bg-amber-100  text-amber-800",
  "Parking":      "bg-yellow-100 text-yellow-800",
  "Vehicle FI":   "bg-purple-100 text-purple-800",
  "Denied Entry": "bg-rose-100   text-rose-800",
}

const TYPE_ICON: Record<ResultType, string> = {
  "Visitor":      "🛂",
  "Resident":     "🏠",
  "Watchlist":    "🚨",
  "Vehicle Alert":"🚗",
  "BOLO":         "📋",
  "Parking":      "🅿️",
  "Vehicle FI":   "🔍",
  "Denied Entry": "⛔",
}

function fmtDate(ts: string | null | undefined): string {
  if (!ts) return ""
  const s = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z"
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function VmsSearchPage() {

  const [communities, setCommunities] = useState<Community[]>([])
  const [query,       setQuery]       = useState("")
  const [results,     setResults]     = useState<SearchResult[]>([])
  const [loading,     setLoading]     = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    supabase.from("communities").select("id,name").then(({ data }) => {
      if (data) setCommunities(data)
    })
  }, [])

  function locationName(id: string | null | undefined): string {
    if (!id) return "—"
    return communities.find(c => c.id === id)?.name || "—"
  }

  async function runSearch() {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setHasSearched(true)
    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase.from("audit_logs").insert({
        user_email: user?.email || "unknown",
        action: "searched", resource_type: "VMS Search", resource_id: "",
        detail: `Searched: "${q}"`, created_at: new Date().toISOString(),
      })
    })
    const output: SearchResult[] = []

    // VISITORS — dedupe per person to most-recent visit
    const { data: logs } = await supabase
      .from("visitor_logs")
      .select("first_name, last_name, unit_number, community_id, created_at")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(100)
    if (logs) {
      const seen = new Set<string>()
      for (const v of logs) {
        const k = `${(v.first_name || "").toLowerCase()}|${(v.last_name || "").toLowerCase()}`
        if (seen.has(k)) continue
        seen.add(k)
        output.push({
          type:     "Visitor",
          name:     `${v.first_name || ""} ${v.last_name || ""}`.trim(),
          detail:   v.unit_number ? `Unit ${v.unit_number}` : "",
          location: locationName(v.community_id),
          date:     v.created_at,
        })
      }
    }

    // RESIDENTS
    const { data: residents } = await supabase
      .from("residents")
      .select("name, unit_number, community_id, relationship")
      .or(`name.ilike.%${q}%,unit_number.ilike.%${q}%`)
      .not("name", "is", null)
      .limit(50)
    if (residents) {
      residents.forEach(r => {
        output.push({
          type:     "Resident",
          name:     r.name,
          detail:   `Unit ${r.unit_number}${r.relationship ? ` · ${r.relationship}` : ""}`,
          location: locationName(r.community_id),
        })
      })
    }

    // WATCHLIST
    const { data: watch } = await supabase
      .from("watchlist")
      .select("first_name, last_name, oln, reason, firearm_flag, community_id, property")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,oln.ilike.%${q}%,property.ilike.%${q}%`)
      .limit(50)
    if (watch) {
      watch.forEach(w => {
        const loc = locationName(w.community_id)
        output.push({
          type:     "Watchlist",
          name:     `${w.first_name || ""} ${w.last_name || ""}`.trim(),
          detail:   w.reason || "—",
          location: loc !== "—" ? loc : (w.property || "—"),
          firearm:  !!w.firearm_flag,
        })
      })
    }

    // VEHICLE WATCHLIST — global, no community_id
    const { data: vehicles } = await supabase
      .from("vehicle_watchlist")
      .select("plate, state, reason")
      .ilike("plate", `%${q}%`)
      .limit(50)
    if (vehicles) {
      vehicles.forEach(v => {
        output.push({
          type:     "Vehicle Alert",
          name:     `${v.plate}${v.state ? ` (${v.state})` : ""}`,
          detail:   v.reason || "—",
          location: "All locations",
        })
      })
    }

    // BOLOs — search name, plate, vehicle description
    const { data: bolos } = await supabase
      .from("bolos")
      .select("id, name, vehicle, reason, plate, plate_state, active, community_id")
      .or(`name.ilike.%${q}%,plate.ilike.%${q}%,vehicle.ilike.%${q}%,reason.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(50)
    if (bolos) {
      bolos.forEach(b => {
        const label = [b.name, b.plate ? `Plate: ${b.plate}${b.plate_state ? ` (${b.plate_state})` : ""}` : null]
          .filter(Boolean).join(" · ")
        output.push({
          type:     "BOLO",
          name:     label || "BOLO",
          detail:   [b.vehicle, b.reason].filter(Boolean).join(" · ") || "—",
          location: locationName(b.community_id),
          link:     `/vms/intel/bolo/${b.id}`,
        })
      })
    }

    // PARKING VIOLATIONS — search plate and HOH name
    const { data: parking } = await supabase
      .from("parking_violations")
      .select("id, plate, state, violation_type, community_id, date, hoh_name")
      .or(`plate.ilike.%${q}%,hoh_name.ilike.%${q}%`)
      .order("date", { ascending: false })
      .limit(50)
    if (parking) {
      parking.forEach(p => {
        const plateLabel = p.plate ? `${p.plate}${p.state ? ` (${p.state})` : ""}` : "—"
        output.push({
          type:     "Parking",
          name:     plateLabel,
          detail:   [p.violation_type, p.hoh_name ? `HOH: ${p.hoh_name}` : null].filter(Boolean).join(" · ") || "—",
          location: locationName(p.community_id),
          date:     p.date,
          link:     `/vms/reports/parking/${p.id}`,
        })
      })
    }

    // VEHICLE FI LOGS — search plate and HOH name
    const { data: vfi } = await supabase
      .from("vehicle_fi_logs")
      .select("id, plate, state, reason, community_id, date, hoh_name")
      .or(`plate.ilike.%${q}%,hoh_name.ilike.%${q}%`)
      .order("date", { ascending: false })
      .limit(50)
    if (vfi) {
      vfi.forEach(v => {
        const plateLabel = v.plate ? `${v.plate}${v.state ? ` (${v.state})` : ""}` : "—"
        output.push({
          type:     "Vehicle FI",
          name:     plateLabel,
          detail:   [v.reason, v.hoh_name ? `HOH: ${v.hoh_name}` : null].filter(Boolean).join(" · ") || "—",
          location: locationName(v.community_id),
          date:     v.date,
          link:     `/vms/reports/vehicle_fi/${v.id}`,
        })
      })
    }

    // DENIED ENTRIES — search name and OLN
    const { data: denied } = await supabase
      .from("denied_entries")
      .select("first_name, last_name, oln, reason, community_name, attempted_at")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,oln.ilike.%${q}%`)
      .order("attempted_at", { ascending: false })
      .limit(50)
    if (denied) {
      denied.forEach(d => {
        output.push({
          type:     "Denied Entry",
          name:     `${d.first_name || ""} ${d.last_name || ""}`.trim() || "Unknown",
          detail:   d.reason || "—",
          location: d.community_name || "—",
          date:     d.attempted_at,
        })
      })
    }

    setResults(output)
    setLoading(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") runSearch()
  }

  return (
    <div className="p-4 sm:p-5 pb-16 max-w-5xl">

      <h1 className="text-2xl font-bold mb-1">Search</h1>
      <p className="text-sm text-gray-500 mb-5">
        Cross-location lookup — visitors, residents, watchlist, BOLOs, vehicle alerts, parking, and denied entries.
      </p>

      {/* SEARCH BAR */}
      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Search name, apartment, OLN, or plate..."
          autoFocus
          className="flex-1 px-3 py-2.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          onClick={runSearch}
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold rounded-md border-none cursor-pointer disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* RESULTS */}
      {!hasSearched && (
        <div className="text-gray-400 text-sm py-12 text-center">
          Enter a name, unit, OLN, or plate to begin.
        </div>
      )}

      {hasSearched && !loading && results.length === 0 && (
        <div className="text-gray-400 text-sm py-12 text-center">
          No matches found for &ldquo;{query}&rdquo;.
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {results.length} result{results.length === 1 ? "" : "s"}
          </div>
          <div className="flex flex-col gap-2">
            {results.map((r, i) => {
              const card = (
                <div
                  className={`bg-white border rounded-lg px-4 py-3 transition-colors ${
                    r.firearm
                      ? "border-red-300 bg-red-50"
                      : r.link
                      ? "border-gray-200 hover:border-blue-300 cursor-pointer"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${TYPE_BADGE[r.type]}`}>
                          {TYPE_ICON[r.type]} {r.type}
                        </span>
                        <span className="font-bold text-gray-900 capitalize">{r.name}</span>
                        {r.firearm && (
                          <span className="px-2 py-0.5 bg-red-700 text-white rounded text-[10px] font-bold uppercase animate-pulse">
                            🔫 Firearm
                          </span>
                        )}
                      </div>
                      {r.detail && (
                        <div className="text-sm text-gray-600 mt-1 truncate">{r.detail}</div>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-500 shrink-0">
                      <div className="font-semibold text-gray-700">📍 {r.location}</div>
                      {r.date && <div className="text-gray-400 mt-0.5">
                        {r.type === "Denied Entry" ? "Attempted" : "Last seen"} {fmtDate(r.date)}
                      </div>}
                    </div>
                  </div>
                </div>
              )
              return r.link
                ? <Link key={i} href={r.link}>{card}</Link>
                : <div key={i}>{card}</div>
            })}
          </div>
        </>
      )}

      <div className="mt-8">
        <Link href="/vms" className="text-sm text-blue-700 hover:text-blue-900">← Back to Check-In</Link>
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { VisitorLog } from "@/lib/types"
import { ADMIN_EMAILS } from "@/lib/admin"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function utc(ts: string) {
  if (!ts) return ts
  return ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z"
}

function formatTime(ts: string) {
  return new Date(utc(ts)).toLocaleString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit"
  })
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(utc(ts)).getTime()
  if (diff < 0) return "Just now"
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1)  return "Just now"
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24)  return `${hrs}h ago`
  return `${days}d ago`
}

function formatHour(h: number) {
  if (h === 0)  return "12:00 AM"
  if (h < 12)  return `${h}:00 AM`
  if (h === 12) return "12:00 PM"
  return `${h - 12}:00 PM`
}

function todayStr() { return new Date().toISOString().split("T")[0] }
function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + "T12:00:00")
  const end = new Date(to   + "T12:00:00")
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// Compute the same-length window immediately before [from, to].
function priorRange(from: string, to: string): { from: string; to: string } {
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  const priorTo   = new Date(new Date(from).getTime() - 86400000)
  const priorFrom = new Date(priorTo.getTime() - (days - 1) * 86400000)
  return {
    from: priorFrom.toISOString().split("T")[0],
    to:   priorTo.toISOString().split("T")[0],
  }
}

// Render a delta hint for prior-period comparison stats.
function deltaSub(curr: number, prior: number | null, periodLabel: string): string | undefined {
  if (prior === null) return undefined
  if (prior === 0)    return curr > 0 ? `first activity in ${periodLabel}` : undefined
  const pct = Math.round(((curr - prior) / prior) * 100)
  if (pct === 0)      return `flat vs prior ${periodLabel}`
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs prior ${periodLabel}`
}

interface DatePreset { label: string; from: () => string; to: () => string }
const DATE_PRESETS: DatePreset[] = [
  { label: "Today",         from: () => todayStr(),       to: () => todayStr() },
  { label: "Last 7 days",   from: () => daysAgoStr(6),    to: () => todayStr() },
  { label: "Last 30 days",  from: () => daysAgoStr(29),   to: () => todayStr() },
  { label: "This month",    from: () => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0] }, to: () => todayStr() },
  { label: "Year to date",  from: () => { const d = new Date(); return `${d.getFullYear()}-01-01` }, to: () => todayStr() },
]

interface Stats {
  total: number
  visitors: number
  deliveries: number
  contractors: number
  employees: number
  residents: number
  peakHour: string
  peakHourCount: number
  peakDay: string
  avgPerHour: string
  topUnit: string
  topUnits: { unit: string; count: number }[]
  repeatVisitors: { name: string; count: number }[]
  repeat: number
  missingUnit: number
  byDay: Record<string, number>
  byHour: Record<number, number>
}

const EMPTY_STATS: Stats = {
  total: 0, visitors: 0, deliveries: 0, contractors: 0, employees: 0, residents: 0,
  peakHour: "—", peakHourCount: 0, peakDay: "—", avgPerHour: "—",
  topUnit: "—", topUnits: [], repeatVisitors: [], repeat: 0, missingUnit: 0,
  byDay: {}, byHour: {}
}

export default function ReportsPage() {

  const [community,      setCommunity]      = useState("")
  const [communityName,  setCommunityName]  = useState("")
  const [communities,    setCommunities]    = useState<{ id: string; name: string }[]>([])
  const [visits,         setVisits]         = useState<VisitorLog[]>([])
  const [dateFrom,       setDateFrom]       = useState(daysAgoStr(30))
  const [dateTo,         setDateTo]         = useState(todayStr())
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState("")
  const [logLimit,       setLogLimit]       = useState(50)
  const [isAdmin,        setIsAdmin]        = useState(false)
  const [userEmail,      setUserEmail]      = useState("")
  const [deleting,       setDeleting]       = useState<string | null>(null)
  const [entryLogSearch, setEntryLogSearch] = useState("")
  const [priorTotal,     setPriorTotal]     = useState<number | null>(null)

  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  // Parking violations for the selected community + date range (filtered by the
  // violation `date`). Surfaced as its own section so officer-enforcement data
  // shows up in platform reporting, not just the Officer Reports tab.
  const [parking, setParking] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const email = user?.email || ""
      setUserEmail(email)
      setIsAdmin(ADMIN_EMAILS.includes(email))
    })
  }, [])

  useEffect(() => {
    supabase.from("communities").select("id,name").order("name").then(({ data }) => {
      if (!data) return
      setCommunities(data)
      // Default to the location chosen at sign-on (confirm-location), mirrored
      // to localStorage. Fall back to St Luke then the first community.
      const savedId    = typeof window !== "undefined" ? localStorage.getItem("asg-current-community-id") || "" : ""
      const savedMatch = data.find(c => c.id === savedId)
      const stLuke     = data.find(c => c.name.toLowerCase().includes("st. luke") || c.name.toLowerCase().includes("st luke"))
      const chosen     = savedMatch || stLuke || data[0]
      if (chosen) setCommunity(chosen.id)
    })
  }, [])

  // Look up the selected community's name (for CSV export and labels).
  useEffect(() => {
    if (!community) { setCommunityName(""); return }
    supabase.from("communities").select("name").eq("id", community).maybeSingle()
      .then(({ data }) => {
        const row = data as { name: string } | null
        setCommunityName(row?.name || "")
      })
  }, [community])

  useEffect(() => { if (community) loadData() }, [community, dateFrom, dateTo])

  useEffect(() => {
    if (!community) return
    // Listen for any change (INSERT/UPDATE/DELETE) on visitor_logs for this
    // community and just refetch — keeps stats and entry log consistent
    // when another tab edits/deletes a row.
    const channel = supabase
      .channel(`reports:${community}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_logs",
        filter: `community_id=eq.${community}` }, () => {
        loadData()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parking_violations",
        filter: `community_id=eq.${community}` }, () => {
        loadData()
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community])

  async function loadData() {
    setLoading(true); setError(""); setLogLimit(50); setPriorTotal(null)
    const { data, error } = await supabase
      .from("visitor_logs").select("*")
      .eq("community_id", community)
      .gte("created_at", dateFrom + "T00:00:00")
      .lte("created_at", dateTo   + "T23:59:59")
      .order("created_at", { ascending: false })
    setLoading(false)
    if (error) { setError("Failed to load data. Please try again."); return }
    const logs = data || []
    setVisits(logs)
    computeStats(logs)

    // Parking violations in range (by violation date), newest first.
    const { data: pv } = await supabase
      .from("parking_violations").select("*")
      .eq("community_id", community)
      .gte("date", dateFrom).lte("date", dateTo)
      .order("date", { ascending: false })
    setParking(pv || [])

    // Fire-and-forget: prior period count for comparison delta.
    const prior = priorRange(dateFrom, dateTo)
    supabase.from("visitor_logs")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community)
      .gte("created_at", prior.from + "T00:00:00")
      .lte("created_at", prior.to   + "T23:59:59")
      .then(({ count }) => setPriorTotal(count ?? 0))
  }

  function computeStats(logs: VisitorLog[]) {
    const type = (t: string) => logs.filter(v => v.person_type?.toLowerCase() === t.toLowerCase()).length

    // All time-bucket calculations route through utc() so timestamps without
    // a Z suffix aren't reinterpreted as local time.
    // By hour (local-display)
    const byHour: Record<number, number> = {}
    logs.forEach(v => { const h = new Date(utc(v.created_at)).getHours(); byHour[h] = (byHour[h] || 0) + 1 })
    const peakHourKey = Object.keys(byHour).length
      ? Object.keys(byHour).reduce((a, b) => byHour[+a] > byHour[+b] ? a : b)
      : null
    const peakHour      = peakHourKey !== null ? formatHour(+peakHourKey) : "—"
    const peakHourCount = peakHourKey !== null ? byHour[+peakHourKey] : 0

    // By day of week
    const byDow: Record<number, number> = {}
    logs.forEach(v => { const d = new Date(utc(v.created_at)).getDay(); byDow[d] = (byDow[d] || 0) + 1 })
    const peakDay = Object.keys(byDow).length
      ? DAYS[+Object.keys(byDow).reduce((a, b) => byDow[+a] > byDow[+b] ? a : b)]
      : "—"

    // By calendar date (for daily chart)
    const byDay: Record<string, number> = {}
    logs.forEach(v => {
      const d = new Date(utc(v.created_at)).toLocaleDateString("en-CA")
      byDay[d] = (byDay[d] || 0) + 1
    })

    // Avg per hour across full date range
    const dayCount = Math.max(1, Math.round(
      (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000
    ) + 1)
    const avgPerHour = logs.length > 0 ? (logs.length / (dayCount * 24)).toFixed(2) : "—"

    // Top units
    const units: Record<string, number> = {}
    logs.forEach(v => { if (v.unit_number) units[v.unit_number] = (units[v.unit_number] || 0) + 1 })
    const sortedUnits = Object.entries(units).sort((a, b) => b[1] - a[1])
    const topUnit  = sortedUnits[0]?.[0] || "—"
    const topUnits = sortedUnits.slice(0, 5).map(([unit, count]) => ({ unit, count }))

    // Repeat visitors — group case-insensitively so "John Doe" and "JOHN DOE"
    // count as the same person; preserve the first observed casing for display.
    const nameCount:   Record<string, number> = {}
    const nameDisplay: Record<string, string> = {}
    logs.forEach(v => {
      const display = `${v.first_name || ""} ${v.last_name || ""}`.trim()
      const key = display.toLowerCase()
      if (!key) return
      nameCount[key] = (nameCount[key] || 0) + 1
      if (!nameDisplay[key]) nameDisplay[key] = display
    })
    const repeatVisitors = Object.entries(nameCount)
      .filter(([, c]) => c > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({ name: nameDisplay[key], count }))

    setStats({
      total: logs.length,
      visitors:    type("visitor"),
      deliveries:  logs.filter(v => v.person_type?.toLowerCase().startsWith("delivery")).length,
      contractors: type("contractor"),
      employees:   type("employee"),
      residents:   type("resident"),
      peakHour, peakHourCount, peakDay, avgPerHour, topUnit, topUnits,
      repeatVisitors, repeat: repeatVisitors.length,
      missingUnit: logs.filter(v => !v.unit_number).length,
      byDay, byHour
    })
  }

  async function deleteEntry(v: VisitorLog) {
    if (!isAdmin) return
    const label = `${v.first_name} ${v.last_name} — ${formatTime(v.created_at)}`
    if (!confirm(`Delete this entry?\n\n${label}\n\nThis cannot be undone.`)) return
    setDeleting(v.id)
    const { error } = await supabase.from("visitor_logs").delete().eq("id", v.id)
    if (error) { setDeleting(null); alert("Delete failed: " + error.message); return }
    // Audit log
    supabase.from("audit_logs").insert({
      user_email:    userEmail,
      action:        "deleted",
      resource_type: "Visitor Log",
      resource_id:   v.id,
      detail:        `Deleted entry: ${label}`,
      created_at:    new Date().toISOString(),
    }).then(({ error: ae }) => { if (ae) console.error("[audit]", ae) })
    setVisits(prev => {
      const u = prev.filter(p => p.id !== v.id)
      computeStats(u)
      return u
    })
    setDeleting(null)
  }

  function exportCSV() {
    const header = ["Date/Time", "First Name", "Last Name", "Type", "Location", "Unit", "Resident"]
    const rows = visits.map(v => [
      formatTime(v.created_at),
      v.first_name || "", v.last_name || "",
      v.person_type || "",
      communityName || "",
      v.unit_number || "",
      v.resident_name || "",
    ])
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `entry-log-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportParkingCSV() {
    const header = ["Date", "Time", "Plate", "State", "Violation Type", "Lot/Area", "Space", "Make", "Model", "Color", "Year", "Officer", "Tow", "BOLO Match", "Notes"]
    const rows = parking.map(p => [
      p.date || "", p.time || "",
      p.plate || "", p.state || "",
      p.violation_type || "", p.location || "", p.space || "",
      p.make || "", p.model || "", p.color || "", p.year || "",
      p.officer_name || "",
      p.tow_requested ? "Yes" : "", p.bolo_match ? "Yes" : "",
      p.notes || "",
    ])
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `parking-violations-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasData    = !loading && community && visits.length > 0
  const allDates   = getDatesInRange(dateFrom, dateTo)
  const maxDayCount  = Math.max(1, ...allDates.map(d => stats.byDay[d] || 0))
  const maxHourCount = Math.max(1, ...Object.values(stats.byHour))
  const dayCount   = Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1

  // Filter the entry log by the search box (first/last name, unit, type, or resident).
  const filteredEntries = entryLogSearch.trim()
    ? visits.filter(v => {
        const q = entryLogSearch.toLowerCase()
        return (v.first_name || "").toLowerCase().includes(q)
            || (v.last_name  || "").toLowerCase().includes(q)
            || (v.unit_number || "").toLowerCase().includes(q)
            || (v.person_type || "").toLowerCase().includes(q)
            || (v.resident_name || "").toLowerCase().includes(q)
      })
    : visits

  function applyPreset(p: DatePreset) {
    setDateFrom(p.from())
    setDateTo(p.to())
  }
  const isPresetActive = (p: DatePreset) => dateFrom === p.from() && dateTo === p.to()

  return (
    <main className="p-5 max-w-6xl">

      {/* PAGE HEADER */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        {hasData && (
          <button onClick={exportCSV}
            className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 border-none cursor-pointer">
            ⬇ Export CSV
          </button>
        )}
      </div>

      {/* FILTERS */}
      <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 w-56">
            <label className="text-xs font-semibold text-gray-500">Location</label>
            <select value={community} onChange={e => setCommunity(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
              {communities.length === 0 && <option value="">Loading…</option>}
              {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
          </div>
          {community && !loading && (
            <div className="text-xs text-gray-400 self-end pb-2">
              {visits.length} entries · {dayCount} days
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {DATE_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1 text-xs font-semibold rounded-md border-none cursor-pointer transition-colors ${
                isPresetActive(p)
                  ? "bg-blue-700 text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-5">{error}</div>
      )}
      {loading && (
        <div className="text-gray-500 text-sm mb-4 animate-pulse">Loading...</div>
      )}

      {!community && !loading && (
        <div className="text-gray-400 text-sm py-16 text-center">Select a location to view analytics.</div>
      )}
      {community && !loading && visits.length === 0 && (
        <div className="text-gray-400 text-sm py-16 text-center flex flex-col items-center gap-3">
          <div>No entries found for this date range.</div>
          <div className="flex gap-2 flex-wrap justify-center">
            <button onClick={() => applyPreset(DATE_PRESETS[2])}
              className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 text-gray-700 cursor-pointer">
              Try Last 30 days
            </button>
            <button onClick={() => applyPreset(DATE_PRESETS[4])}
              className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-100 text-gray-700 cursor-pointer">
              Try Year to date
            </button>
          </div>
        </div>
      )}

      {hasData && (
        <>
          {/* ── TRAFFIC BREAKDOWN ── */}
          <Section label="Traffic Breakdown">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard title="Total Entries"  value={stats.total}       accent="blue"
                sub={deltaSub(stats.total, priorTotal, `${dayCount}d`)} />
              <StatCard title="Visitors"       value={stats.visitors}    accent="indigo" />
              <StatCard title="Deliveries"     value={stats.deliveries}  accent="sky" />
              <StatCard title="Contractors"    value={stats.contractors} accent="violet" />
              <StatCard title="Employees"      value={stats.employees}   accent="emerald" />
              <StatCard title="Residents"      value={stats.residents}   accent="green" />
            </div>
          </Section>

          {/* ── DAILY ACTIVITY CHART ── */}
          <Section label="Daily Activity">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-end gap-px" style={{ height: "100px" }}>
                {allDates.map(date => {
                  const count = stats.byDay[date] || 0
                  const pct   = (count / maxDayCount) * 100
                  const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
                  return (
                    <div key={date} title={`${label}: ${count}`}
                      className="flex flex-col items-center justify-end flex-1 min-w-0 h-full cursor-default group">
                      {count > 0 ? (
                        <div
                          className="w-full rounded-sm bg-blue-700 transition-all group-hover:opacity-80"
                          style={{ height: `${Math.max(3, (pct / 100) * 72)}px` }}
                        />
                      ) : (
                        // Empty days render as a thin dashed baseline so the eye
                        // reads "nothing happened" instead of "tiny activity".
                        <div className="w-full border-b border-dashed border-gray-300" style={{ height: "1px" }} />
                      )}
                    </div>
                  )
                })}
              </div>
              {/* X-axis labels — only show if 31 days or fewer */}
              {allDates.length <= 31 && (
                <div className="flex gap-px mt-1">
                  {allDates.map(date => {
                    const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
                    return (
                      <div key={date} className="flex-1 min-w-0 text-center text-[8px] text-gray-400 leading-tight truncate">
                        {label}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-2">
                Peak day: <strong className="text-gray-600">{Object.entries(stats.byDay).sort((a,b) => b[1]-a[1])[0]
                  ? `${new Date(Object.entries(stats.byDay).sort((a,b) => b[1]-a[1])[0][0] + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${Object.entries(stats.byDay).sort((a,b) => b[1]-a[1])[0][1]} entries)`
                  : "—"
                }</strong>
              </div>
            </div>
          </Section>

          {/* ── ANALYTICS SUMMARY ── */}
          <Section label="Analytics">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard title="Peak Hour"       value={stats.peakHour}   accent="orange" sub={`${stats.peakHourCount} entries that hour`} />
              <StatCard title="Peak Day"        value={stats.peakDay}    accent="orange" sub="busiest day of week" />
              <StatCard title="Avg / Hour"      value={stats.avgPerHour} accent="teal"   sub="entries per hour (24hr)" />
              <StatCard title="Top Unit"        value={stats.topUnit}    accent="teal"   sub={stats.topUnits[0] ? `${stats.topUnits[0].count} visits` : ""} />
              <StatCard title="Repeat Visitors" value={stats.repeat}     accent="gray"   sub="people with 2+ visits" />
              {stats.missingUnit > 0 && (
                <StatCard title="Missing Unit" value={stats.missingUnit} accent="red" sub="entries with no unit" />
              )}
            </div>
          </Section>

          {/* ── HOURLY DISTRIBUTION ── */}
          <Section label="Hourly Distribution">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-end gap-0.5" style={{ height: "80px" }}>
                {Array.from({ length: 24 }, (_, h) => {
                  const count  = stats.byHour[h] || 0
                  const pct    = (count / maxHourCount) * 100
                  const isPeak = formatHour(h) === stats.peakHour
                  return (
                    <div key={h} title={`${formatHour(h)}: ${count}`}
                      className="flex flex-col items-center justify-end flex-1 h-full group cursor-default">
                      <div
                        className="w-full rounded-sm transition-all group-hover:opacity-75"
                        style={{
                          height: count > 0 ? `${Math.max(3, (pct / 100) * 60)}px` : "2px",
                          backgroundColor: isPeak ? "#ea580c" : count > 0 ? "#3b82f6" : "#e5e7eb"
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-px mt-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center text-[7px] text-gray-400 leading-tight">
                    {h === 0 ? "12a" : h === 6 ? "6a" : h === 12 ? "12p" : h === 18 ? "6p" : h === 23 ? "11p" : ""}
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-sm bg-orange-500" />
                  Peak: {stats.peakHour}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-sm bg-blue-500" />
                  Activity
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-sm bg-gray-200" />
                  No entries
                </span>
              </div>
            </div>
          </Section>

          {/* ── TOP 5 UNITS ── */}
          {stats.topUnits.length > 0 && (
            <Section label="Top 5 Most Visited Units">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {stats.topUnits.map(({ unit, count }, i) => {
                  const pct = Math.round((count / stats.topUnits[0].count) * 100)
                  return (
                    <div key={unit} className={`flex items-center gap-4 px-4 py-3 ${i < stats.topUnits.length - 1 ? "border-b border-gray-100" : ""}`}>
                      <div className="w-6 text-center text-xs font-bold text-gray-400">#{i + 1}</div>
                      <div className="font-mono font-semibold text-blue-700 w-20 flex-shrink-0">{unit}</div>
                      <div className="flex-1">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-700 w-16 text-right">{count} visits</div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── REPEAT VISITORS ── */}
          {stats.repeatVisitors.length > 0 && (
            <Section label={`Repeat Visitors (${stats.repeat})`}>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {stats.repeatVisitors.map(({ name, count }, i) => {
                  const pct = Math.round((count / stats.repeatVisitors[0].count) * 100)
                  return (
                    <div key={name}
                      className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${i < stats.repeatVisitors.length - 1 ? "border-b border-gray-100" : ""}`}
                      onClick={() => window.location.href = `/vms/intel?search=${encodeURIComponent(name)}`}
                    >
                      <div className="w-6 text-center text-xs font-bold text-gray-400">#{i + 1}</div>
                      <div className="font-semibold text-gray-800 w-44 flex-shrink-0 truncate capitalize">{name}</div>
                      <div className="flex-1">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-indigo-700 w-16 text-right">{count} visits</div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── ENTRY LOG ── */}
          <Section label={`Entry Log${
            entryLogSearch.trim()
              ? ` — ${filteredEntries.length} match${filteredEntries.length === 1 ? "" : "es"} of ${visits.length}`
              : visits.length > logLimit ? ` (showing ${logLimit} of ${visits.length})` : ` (${visits.length})`
          }`}>
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={entryLogSearch}
                onChange={e => setEntryLogSearch(e.target.value)}
                placeholder="Search by name, unit, type, or resident..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {entryLogSearch && (
                <button
                  onClick={() => setEntryLogSearch("")}
                  className="px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md border-none cursor-pointer"
                >
                  ✕ Clear
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {filteredEntries.slice(0, logLimit).map((v) => (
                <div key={v.id}
                  className="bg-white border border-gray-200 px-4 py-3 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-colors group"
                  onClick={() => window.location.href = `/vms/intel?search=${encodeURIComponent(`${v.first_name} ${v.last_name}`)}`}
                >
                  <div>
                    <div className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                      {v.first_name} {v.last_name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      <span className="capitalize">{v.person_type}</span>
                      {v.unit_number && ` · Unit ${v.unit_number}`}
                      {v.resident_name && ` · Visiting: ${v.resident_name}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-sm text-gray-700">{formatTime(v.created_at)}</div>
                      <div className="text-xs text-gray-400">{timeAgo(v.created_at)}</div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteEntry(v) }}
                        disabled={deleting === v.id}
                        title="Delete entry (admin)"
                        className="px-2 py-1 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded border-none cursor-pointer disabled:opacity-50"
                      >
                        {deleting === v.id ? "…" : "🗑"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {entryLogSearch.trim() && filteredEntries.length === 0 && (
                <div className="text-gray-400 text-sm py-6 text-center">No entries match your search.</div>
              )}
            </div>
            {filteredEntries.length > logLimit && (
              <button onClick={() => setLogLimit(l => l + 50)}
                className="mt-3 w-full py-2.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer bg-white">
                Show more ({filteredEntries.length - logLimit} remaining)
              </button>
            )}
          </Section>
        </>
      )}

      {/* ── PARKING VIOLATIONS ── (own gate so it shows even with no visitor entries) */}
      {community && !loading && parking.length > 0 && (() => {
        const byType = parking.reduce((m: Record<string, number>, p) => {
          const k = p.violation_type || "Other"; m[k] = (m[k] || 0) + 1; return m
        }, {})
        const towCount  = parking.filter(p => p.tow_requested).length
        const boloCount = parking.filter(p => p.bolo_match).length
        return (
          <Section label={`Parking Violations (${parking.length})`}>
            <div className="flex justify-end mb-3">
              <button onClick={exportParkingCSV}
                className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-700 border-none cursor-pointer">
                ⬇ Export Parking CSV
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard title="Violations"   value={parking.length} accent="orange" sub={`${dayCount}d range`} />
              <StatCard title="Tows Requested" value={towCount}     accent="red"    sub="manual dispatch" />
              <StatCard title="BOLO Matches" value={boloCount}      accent="red"    sub="plate hit active BOLO" />
              <StatCard title="Top Type"     value={Object.entries(byType).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—"} accent="amber"
                sub={`${Object.keys(byType).length} type${Object.keys(byType).length === 1 ? "" : "s"}`} />
            </div>

            {/* By-type chips */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t, c]) => (
                <span key={t} className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-full">
                  {t} · {c}
                </span>
              ))}
            </div>

            {/* Violation list */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {parking.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-4 px-4 py-3 ${i < parking.length - 1 ? "border-b border-gray-100" : ""}`}>
                  <div className="font-mono font-semibold text-gray-800 w-28 flex-shrink-0">
                    {p.plate || "—"}{p.state ? ` (${p.state})` : ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{p.violation_type || "—"}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {[p.location, p.space && `Space ${p.space}`, [p.year, p.color, p.make, p.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {p.bolo_match    && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">BOLO</span>}
                    {p.tow_requested && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">🚛 Tow</span>}
                  </div>
                  <div className="text-right text-xs text-gray-400 w-28 flex-shrink-0">
                    <div>{p.date}{p.time ? ` · ${p.time}` : ""}</div>
                    <div className="truncate">{p.officer_name || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )
      })()}
    </main>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{label}</div>
      {children}
    </div>
  )
}

function StatCard({ title, value, accent, sub }: {
  title: string; value: string | number; accent: string; sub?: string
}) {
  const colors: Record<string, string> = {
    blue:    "bg-blue-50    border-blue-200    text-blue-800",
    indigo:  "bg-indigo-50  border-indigo-200  text-indigo-800",
    sky:     "bg-sky-50     border-sky-200     text-sky-800",
    violet:  "bg-violet-50  border-violet-200  text-violet-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    green:   "bg-green-50   border-green-200   text-green-800",
    orange:  "bg-orange-50  border-orange-200  text-orange-800",
    amber:   "bg-amber-50   border-amber-200   text-amber-800",
    teal:    "bg-teal-50    border-teal-200    text-teal-800",
    gray:    "bg-gray-50    border-gray-200    text-gray-800",
    red:     "bg-red-50     border-red-200     text-red-800",
  }
  return (
    <div className={`border rounded-xl px-4 py-3 ${colors[accent] || colors.gray}`}>
      <div className="text-xs font-medium opacity-70 mb-1">{title}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}

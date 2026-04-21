"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import CommunitySelector from "@/components/CommunitySelector"
import { VisitorLog } from "@/lib/types"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function toLocal(ts: string) {
  const d = new Date(ts)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
}

function formatTime(ts: string) {
  return toLocal(ts).toLocaleString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit"
  })
}

function timeAgo(ts: string) {
  const diff = Date.now() - toLocal(ts).getTime()
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

function todayStr()         { return new Date().toISOString().split("T")[0] }
function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}

interface Stats {
  total: number
  visitors: number
  deliveries: number
  contractors: number
  residents: number
  peakHour: string
  peakDay: string
  avgPerHour: string
  topUnit: string
  topUnits: { unit: string; count: number }[]
  repeat: number
  missingUnit: number
}

export default function ReportsPage() {

  const [community, setCommunity] = useState("")
  const [visits,    setVisits]    = useState<VisitorLog[]>([])
  const [dateFrom,  setDateFrom]  = useState(daysAgoStr(30))
  const [dateTo,    setDateTo]    = useState(todayStr())
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState("")

  const [stats, setStats] = useState<Stats>({
    total: 0, visitors: 0, deliveries: 0, contractors: 0, residents: 0,
    peakHour: "—", peakDay: "—", avgPerHour: "—", topUnit: "—", topUnits: [], repeat: 0, missingUnit: 0
  })

  useEffect(() => { if (community) loadData() }, [community, dateFrom, dateTo])

  useEffect(() => {
    if (!community) return
    const channel = supabase
      .channel(`reports:${community}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visitor_logs",
        filter: `community_id=eq.${community}` }, (payload) => {
        const newLog = payload.new as VisitorLog
        setVisits(prev => { const u = [newLog, ...prev]; computeStats(u); return u })
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [community])

  async function loadData() {
    setLoading(true); setError("")
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
  }

  function computeStats(logs: VisitorLog[]) {
    const type = (t: string) => logs.filter(v => v.person_type?.toLowerCase() === t.toLowerCase()).length

    // Peak hour
    const hours: Record<number, number> = {}
    logs.forEach(v => { const h = new Date(v.created_at).getHours(); hours[h] = (hours[h] || 0) + 1 })
    const peakHour = Object.keys(hours).length
      ? formatHour(+Object.keys(hours).reduce((a, b) => hours[+a] > hours[+b] ? a : b))
      : "—"

    // Peak day of week
    const days: Record<number, number> = {}
    logs.forEach(v => { const d = new Date(v.created_at).getDay(); days[d] = (days[d] || 0) + 1 })
    const peakDay = Object.keys(days).length
      ? DAYS[+Object.keys(days).reduce((a, b) => days[+a] > days[+b] ? a : b)]
      : "—"

    // Avg visitors per hour across date range
    const dayCount = Math.max(1, Math.round(
      (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000
    ) + 1)
    const avgPerHour = logs.length > 0
      ? (logs.length / (dayCount * 24)).toFixed(2)
      : "—"

    // Top units
    const units: Record<string, number> = {}
    logs.forEach(v => { if (v.unit_number) units[v.unit_number] = (units[v.unit_number] || 0) + 1 })
    const sortedUnits = Object.entries(units).sort((a, b) => b[1] - a[1])
    const topUnit  = sortedUnits[0]?.[0] || "—"
    const topUnits = sortedUnits.slice(0, 5).map(([unit, count]) => ({ unit, count }))

    // Repeat visitors
    const nameCount: Record<string, number> = {}
    logs.forEach(v => { const k = `${v.first_name}-${v.last_name}`; nameCount[k] = (nameCount[k] || 0) + 1 })
    const repeat = Object.values(nameCount).filter(c => c > 1).length

    setStats({
      total: logs.length,
      visitors:    type("visitor"),
      deliveries:  type("delivery"),
      contractors: type("contractor"),
      residents:   type("resident"),
      peakHour, peakDay, avgPerHour, topUnit, topUnits, repeat,
      missingUnit: logs.filter(v => !v.unit_number).length
    })
  }

  const hasData = !loading && community && visits.length > 0

  return (
    <main className="p-5 max-w-5xl">
      <h1 className="text-2xl font-bold mb-5">Reports & Analytics</h1>

      {/* FILTERS */}
      <div className="flex flex-wrap gap-3 items-end mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="w-56">
          <CommunitySelector value={community} onChange={setCommunity} />
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
            {visits.length} entries · {Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1} days
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-5">{error}</div>}
      {loading && <div className="text-gray-500 text-sm mb-4 animate-pulse">Loading...</div>}

      {!community && !loading && (
        <div className="text-gray-400 text-sm py-16 text-center">Select a community to view analytics.</div>
      )}

      {community && !loading && visits.length === 0 && (
        <div className="text-gray-400 text-sm py-16 text-center">No entries found for this date range.</div>
      )}

      {hasData && (
        <>
          {/* ── TRAFFIC BREAKDOWN ── */}
          <div className="mb-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Traffic Breakdown</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              <StatCard title="Total Entries"  value={stats.total}       accent="blue" />
              <StatCard title="Visitors"       value={stats.visitors}    accent="indigo" />
              <StatCard title="Deliveries"     value={stats.deliveries}  accent="sky" />
              <StatCard title="Contractors"    value={stats.contractors} accent="violet" />
              <StatCard title="Residents"      value={stats.residents}   accent="green" />
            </div>
          </div>

          {/* ── ANALYTICS ── */}
          <div className="mb-6">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Analytics</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard title="Peak Hour"        value={stats.peakHour}   accent="orange" />
              <StatCard title="Peak Day"         value={stats.peakDay}    accent="orange" />
              <StatCard title="Avg / Hour"       value={stats.avgPerHour} accent="teal" sub="visitors per hour" />
              <StatCard title="Top Unit"         value={stats.topUnit}    accent="teal" />
              <StatCard title="Repeat Visitors"  value={stats.repeat}     accent="gray" />
              {stats.missingUnit > 0 && <StatCard title="Missing Unit" value={stats.missingUnit} accent="red" />}
            </div>
          </div>

          {/* ── TOP 5 UNITS ── */}
          {stats.topUnits.length > 0 && (
            <div className="mb-6">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Top 5 Most Visited Units</div>
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
            </div>
          )}

          {/* ── ENTRY LOG ── */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Entry Log</div>
            <div className="flex flex-col gap-1.5">
              {visits.map((v) => (
                <div key={v.id}
                  className="bg-gray-900 text-white px-4 py-3 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-700 transition-colors group"
                  onClick={() => window.location.href = `/vms/intel?search=${encodeURIComponent(`${v.first_name} ${v.last_name}`)}`}
                >
                  <div>
                    <div className="font-semibold group-hover:text-blue-300 transition-colors">
                      {v.first_name} {v.last_name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {v.person_type}
                      {v.unit_number && ` · Unit ${v.unit_number}`}
                      {(v as any).resident_name && ` · Visiting: ${(v as any).resident_name}`}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-sm text-gray-300">{formatTime(v.created_at)}</div>
                    <div className="text-xs text-gray-500">{timeAgo(v.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  )
}

function StatCard({ title, value, accent, sub }: {
  title: string; value: string | number; accent: string; sub?: string
}) {
  const colors: Record<string, string> = {
    blue:   "bg-blue-50   border-blue-200   text-blue-800",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
    sky:    "bg-sky-50    border-sky-200    text-sky-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    green:  "bg-green-50  border-green-200  text-green-800",
    orange: "bg-orange-50 border-orange-200 text-orange-800",
    teal:   "bg-teal-50   border-teal-200   text-teal-800",
    gray:   "bg-gray-50   border-gray-200   text-gray-800",
    red:    "bg-red-50    border-red-200    text-red-800",
  }
  return (
    <div className={`border rounded-xl px-4 py-3 ${colors[accent] || colors.gray}`}>
      <div className="text-xs font-medium opacity-70 mb-1">{title}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}

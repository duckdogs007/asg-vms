"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import CommunitySelector from "@/components/CommunitySelector"
import { VisitorLog } from "@/lib/types"

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

function todayStr() {
  return new Date().toISOString().split("T")[0]
}

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}

export default function ReportsPage() {

  const [community, setCommunity]   = useState("")
  const [visits,    setVisits]      = useState<VisitorLog[]>([])
  const [dateFrom,  setDateFrom]    = useState(daysAgoStr(30))
  const [dateTo,    setDateTo]      = useState(todayStr())
  const [loading,   setLoading]     = useState(false)
  const [error,     setError]       = useState("")

  const [stats, setStats] = useState({
    visitors: 0, deliveries: 0, contractors: 0, residents: 0,
    peak: "-", topUnit: "-", repeat: 0, missingUnit: 0
  })

  // Load data when community or date range changes
  useEffect(() => {
    if (community) loadData()
  }, [community, dateFrom, dateTo])

  // Real-time subscription for new entries
  useEffect(() => {
    if (!community) return

    const channel = supabase
      .channel(`reports:${community}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "visitor_logs",
        filter: `community_id=eq.${community}`
      }, (payload) => {
        const newLog = payload.new as VisitorLog
        setVisits(prev => {
          const updated = [newLog, ...prev]
          computeStats(updated)
          return updated
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [community])

  async function loadData() {
    setLoading(true)
    setError("")

    const { data, error } = await supabase
      .from("visitor_logs")
      .select("*")
      .eq("community_id", community)
      .gte("created_at", dateFrom + "T00:00:00")
      .lte("created_at", dateTo   + "T23:59:59")
      .order("created_at", { ascending: false })

    setLoading(false)

    if (error) {
      setError("Failed to load visitor data. Please try again.")
      return
    }

    const logs = data || []
    setVisits(logs)
    computeStats(logs)
  }

  function computeStats(logs: VisitorLog[]) {
    const type = (t: string) =>
      logs.filter(v => v.person_type?.toLowerCase() === t.toLowerCase()).length

    const hours: Record<number, number> = {}
    logs.forEach(v => {
      const h = new Date(v.created_at).getHours()
      hours[h] = (hours[h] || 0) + 1
    })
    const peak = Object.keys(hours).length
      ? `${Object.keys(hours).reduce((a, b) => hours[+a] > hours[+b] ? a : b)}:00`
      : "-"

    const units: Record<string, number> = {}
    logs.forEach(v => {
      if (!v.unit_number) return
      units[v.unit_number] = (units[v.unit_number] || 0) + 1
    })
    const topUnit = Object.keys(units).length
      ? Object.keys(units).reduce((a, b) => units[a] > units[b] ? a : b)
      : "-"

    const nameCount: Record<string, number> = {}
    logs.forEach(v => {
      const key = `${v.first_name}-${v.last_name}`
      nameCount[key] = (nameCount[key] || 0) + 1
    })
    const repeat = Object.values(nameCount).filter(c => c > 1).length
    const missingUnit = logs.filter(v => !v.unit_number).length

    setStats({
      visitors:    type("visitor"),
      deliveries:  type("delivery"),
      contractors: type("contractor"),
      residents:   type("resident"),
      peak, topUnit, repeat, missingUnit
    })
  }

  return (
    <main className="p-5">
      <h1 className="text-2xl font-bold mb-5">VMS Reports & Analytics</h1>

      {/* FILTERS */}
      <div className="flex flex-wrap gap-4 items-end mb-6">
        <div className="w-64">
          <CommunitySelector value={community} onChange={setCommunity} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-5">
          {error}
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="text-gray-500 text-sm mb-4">Loading...</div>
      )}

      {/* KPI CARDS */}
      {!loading && community && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Visitors"       value={stats.visitors} />
            <StatCard title="Deliveries"     value={stats.deliveries} />
            <StatCard title="Contractors"    value={stats.contractors} />
            <StatCard title="Residents"      value={stats.residents} />
            <StatCard title="Peak Hour"      value={stats.peak} />
            <StatCard title="Top Unit"       value={stats.topUnit} />
          </div>

          <div className="flex gap-3 mb-6 flex-wrap">
            <Badge label={`Total: ${visits.length}`} />
            <Badge label={`Repeat Visitors: ${stats.repeat}`} />
            {stats.missingUnit > 0 && <Badge label={`Missing Unit: ${stats.missingUnit}`} danger />}
          </div>

          {/* VISITOR LIST */}
          {visits.length === 0 ? (
            <div className="text-gray-500 text-sm py-8 text-center">
              No visits found for the selected date range.
            </div>
          ) : (
            <div>
              {visits.map((v) => (
                <div
                  key={v.id}
                  className="bg-gray-900 text-white px-4 py-3 rounded-lg mb-2 flex justify-between items-center cursor-pointer hover:bg-gray-700 transition-colors"
                  onClick={() => window.location.href = `/vms/intel?search=${encodeURIComponent(`${v.first_name} ${v.last_name}`)}`}
                >
                  <div>
                    <div className="font-semibold">{v.first_name} {v.last_name}</div>
                    <div className="text-xs text-gray-400">
                      {v.person_type} · Unit: {v.unit_number || "—"}{(v as any).resident_name ? ` · Visiting: ${(v as any).resident_name}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{formatTime(v.created_at)}</div>
                    <div className="text-xs text-gray-400">{timeAgo(v.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!community && !loading && (
        <div className="text-gray-500 text-sm py-8 text-center">
          Select a community to view reports.
        </div>
      )}

    </main>
  )
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-gray-100 px-5 py-4 rounded-xl">
      <div className="text-xs text-gray-500 mb-1">{title}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

function Badge({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <div className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${danger ? "bg-red-800" : "bg-gray-800"}`}>
      {label}
    </div>
  )
}

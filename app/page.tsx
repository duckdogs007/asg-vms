"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"

interface Stats {
  todayTotal: number
  visitors: number
  contractors: number
  deliveries: number
  watchlistCount: number
  recentEntry: string
}

export default function Home() {

  const [stats, setStats] = useState<Stats>({
    todayTotal: 0, visitors: 0, contractors: 0,
    deliveries: 0, watchlistCount: 0, recentEntry: ""
  })
  const [time, setTime] = useState("")

  useEffect(() => {
    loadStats()
    const t = setInterval(() => {
      setTime(new Date().toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric",
        year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit"
      }))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  async function loadStats() {
    const today = new Date().toISOString().split("T")[0]

    const { data: logs } = await supabase
      .from("visitor_logs")
      .select("person_type, created_at, first_name, last_name")
      .gte("created_at", today + "T00:00:00")
      .order("created_at", { ascending: false })

    const { count: watchlistCount } = await supabase
      .from("watchlist")
      .select("*", { count: "exact", head: true })

    const entries = logs || []
    const recent = entries[0]
      ? `${entries[0].first_name} ${entries[0].last_name}`
      : "None yet today"

    setStats({
      todayTotal:     entries.length,
      visitors:       entries.filter(e => e.person_type?.toLowerCase() === "visitor").length,
      contractors:    entries.filter(e => e.person_type?.toLowerCase() === "contractor").length,
      deliveries:     entries.filter(e => e.person_type?.toLowerCase() === "delivery").length,
      watchlistCount: watchlistCount || 0,
      recentEntry:    recent
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* HERO HEADER */}
      <div className="border-b border-gray-800 px-10 py-8">
        <div className="flex justify-between items-center max-w-6xl mx-auto">
          <div>
            <div className="text-3xl font-bold tracking-wide text-white">
              🛡️ American Security Group
            </div>
            <div className="text-gray-400 text-sm mt-1">Integrated Property Solutions Platform</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">System Time</div>
            <div className="text-sm text-green-400 font-mono">{time}</div>
            <div className="flex items-center gap-1.5 justify-end mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-xs text-green-500">All Systems Operational</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-10 py-8">

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <StatCard label="Today's Entries"  value={stats.todayTotal}     accent="blue" />
          <StatCard label="Visitors"         value={stats.visitors}       accent="indigo" />
          <StatCard label="Contractors"      value={stats.contractors}    accent="violet" />
          <StatCard label="Deliveries"       value={stats.deliveries}     accent="sky" />
          <StatCard label="Watchlist Active" value={stats.watchlistCount} accent="red" />
        </div>

        {/* RECENT ENTRY BANNER */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-3 mb-10 flex items-center gap-3">
          <span className="text-gray-500 text-sm">Most Recent Entry:</span>
          <span className="text-white font-semibold">{stats.recentEntry}</span>
        </div>

        {/* NAV MODULES */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">

          <ModuleCard
            href="/vms"
            icon="🪪"
            title="Visitor Management"
            desc="Check in visitors, scan driver licenses, manage unit access."
            color="blue"
          />

          <ModuleCard
            href="/vms/intel"
            icon="🔎"
            title="Intel Terminal"
            desc="Search visitor history, ban records, and run background profiles."
            color="indigo"
          />

          <ModuleCard
            href="/vms/reports"
            icon="📊"
            title="Reports & Analytics"
            desc="View entry logs, peak hours, repeat visitors, and export data."
            color="teal"
          />

          <ModuleCard
            href="/admin"
            icon="⚙️"
            title="Admin Dashboard"
            desc="Manage communities, units, users, and system settings."
            color="gray"
          />

          <ComingSoon icon="📷" title="Camera Systems"  desc="Integrated live feed and recording access." />
          <ComingSoon icon="🔔" title="Alerts & Notify" desc="Push alerts, SMS, and incident escalation." />

        </div>

      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors: Record<string, string> = {
    blue:   "border-blue-700 text-blue-400",
    indigo: "border-indigo-700 text-indigo-400",
    violet: "border-violet-700 text-violet-400",
    sky:    "border-sky-700 text-sky-400",
    red:    "border-red-700 text-red-400",
  }
  return (
    <div className={`bg-gray-900 border rounded-xl px-4 py-4 ${colors[accent]}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}

function ModuleCard({ href, icon, title, desc, color }: {
  href: string; icon: string; title: string; desc: string; color: string
}) {
  const borders: Record<string, string> = {
    blue:   "hover:border-blue-600",
    indigo: "hover:border-indigo-600",
    teal:   "hover:border-teal-600",
    gray:   "hover:border-gray-500",
  }
  return (
    <Link href={href}>
      <div className={`bg-gray-900 border border-gray-700 rounded-xl p-5 cursor-pointer transition-all hover:bg-gray-800 ${borders[color]} group h-full`}>
        <div className="text-3xl mb-3">{icon}</div>
        <div className="font-bold text-white text-base mb-1 group-hover:text-blue-300 transition-colors">{title}</div>
        <div className="text-sm text-gray-400">{desc}</div>
      </div>
    </Link>
  )
}

function ComingSoon({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 opacity-50 cursor-not-allowed">
      <div className="text-3xl mb-3">{icon}</div>
      <div className="font-bold text-gray-400 text-base mb-1">{title}</div>
      <div className="text-sm text-gray-600">{desc}</div>
      <div className="text-xs text-gray-600 mt-2 uppercase tracking-widest">Coming Soon</div>
    </div>
  )
}

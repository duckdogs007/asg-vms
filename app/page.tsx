"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import pkg from "../package.json"

interface Stats {
  todayTotal: number
  visitors: number
  contractors: number
  deliveries: number
  watchlistCount: number
  recentEntry: string
  openAlerts: number
}

export default function Home() {

  const [stats, setStats] = useState<Stats>({
    todayTotal: 0, visitors: 0, contractors: 0,
    deliveries: 0, watchlistCount: 0, recentEntry: "",
    openAlerts: 0,
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

    const { count: openAlerts } = await supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .is("ack_at", null)
      .eq("status", "sent")

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
      recentEntry:    recent,
      openAlerts:     openAlerts || 0,
    })
  }

  return (
    <div className="min-h-screen">

      {/* HERO HEADER */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-10 py-3 sm:py-4">
        <div className="flex justify-between items-center max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <img
              src="/asg-logo.gif"
              alt="American Security Group"
              className="h-12 sm:h-14 w-auto shrink-0"
            />
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-wide text-gray-900 leading-tight">
                American Security Group
              </div>
              <div className="text-gray-500 text-xs mt-0.5">Integrated Property Solutions Platform</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest">System Time</div>
            <div className="text-xs text-green-700 font-mono">{time}</div>
            <div className="flex items-center gap-1.5 justify-end mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-[10px] text-green-700">All Systems Operational</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-10 py-3 sm:py-4">

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          <StatCard label="Today's Entries"  value={stats.todayTotal}     accent="blue" />
          <StatCard label="Visitors"         value={stats.visitors}       accent="indigo" />
          <StatCard label="Contractors"      value={stats.contractors}    accent="violet" />
          <StatCard label="Deliveries"       value={stats.deliveries}     accent="sky" />
          <StatCard label="Watchlist Active" value={stats.watchlistCount} accent="red" />
        </div>

        {/* RECENT ENTRY BANNER */}
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 mb-3 flex items-center gap-3">
          <span className="text-gray-500 text-xs">Most Recent Entry:</span>
          <span className="text-gray-900 font-semibold text-sm">{stats.recentEntry}</span>
        </div>

        {/* NAV MODULES — operational */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">

          <ModuleCard
            href="/vms"
            icon="🛂"
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

        </div>

        {/* DASHBOARDS — split row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">

          <ModuleCard
            href="/admin"
            icon="📋"
            title="User Dashboard"
            desc="Passdowns, BOLOs, Officer Reports, Watchlist, Rent Roll, Audit Log."
            color="gray"
          />

          <ModuleCard
            href="/admin/system"
            icon="⚙️"
            title="Admin Dashboard"
            desc="Manage communities, users, notification recipients, and system settings."
            color="indigo"
          />

        </div>

        {/* MODULES — secondary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">

          <ComingSoon icon="📷" title="Camera Systems"  desc="Integrated live feed and recording access." />

          <ModuleCard
            href="/alerts"
            icon="🔔"
            title="Alerts & Notify"
            desc="Watchlist hits, incident escalations, and panic SOS — live feed."
            color="red"
            badge={stats.openAlerts > 0 ? `${stats.openAlerts} open` : undefined}
          />

        </div>

        {/* FOOTER */}
        <div className="mt-6 pt-3 border-t border-gray-200 text-center text-[11px] text-gray-500">
          © {new Date().getFullYear()} American Security Group. All rights reserved.
          <span className="mx-1.5 text-gray-300">·</span>
          ASG VMS v{pkg.version}
        </div>

      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors: Record<string, string> = {
    blue:   "border-blue-300 text-blue-700",
    indigo: "border-indigo-300 text-indigo-700",
    violet: "border-violet-300 text-violet-700",
    sky:    "border-sky-300 text-sky-700",
    red:    "border-red-300 text-red-700",
  }
  return (
    <div className={`bg-white border rounded-lg px-3 py-2 ${colors[accent]}`}>
      <div className="text-xl font-bold leading-tight">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  )
}

function ModuleCard({ href, icon, title, desc, color, badge }: {
  href: string; icon: string; title: string; desc: string; color: string; badge?: string
}) {
  const borders: Record<string, string> = {
    blue:   "hover:border-blue-500",
    indigo: "hover:border-indigo-500",
    teal:   "hover:border-teal-500",
    gray:   "hover:border-gray-500",
    red:    "hover:border-red-500",
  }
  return (
    <Link href={href}>
      <div className={`relative bg-white border border-gray-200 rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${borders[color]} group h-full`}>
        {badge && (
          <span className="absolute top-2 right-2 bg-red-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
            {badge}
          </span>
        )}
        <div className="text-2xl mb-1.5">{icon}</div>
        <div className="font-bold text-gray-900 text-sm mb-0.5 group-hover:text-blue-700 transition-colors">{title}</div>
        <div className="text-xs text-gray-500 leading-snug">{desc}</div>
      </div>
    </Link>
  )
}

function ComingSoon({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 opacity-60 cursor-not-allowed">
      <div className="text-2xl mb-1.5 grayscale">{icon}</div>
      <div className="font-bold text-gray-700 text-sm mb-0.5">{title}</div>
      <div className="text-xs text-gray-500 leading-snug">{desc}</div>
      <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">Coming Soon</div>
    </div>
  )
}

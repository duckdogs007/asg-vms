"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { ADMIN_EMAILS } from "@/lib/admin"
import pkg from "../package.json"

interface Stats {
  watchlistCount: number
  openAlerts: number
}

export default function Home() {

  const [stats, setStats] = useState<Stats>({ watchlistCount: 0, openAlerts: 0 })
  const [time, setTime] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(ADMIN_EMAILS.includes(user?.email || ""))
    })
  }, [])

  useEffect(() => {
    loadStats()
    // No seconds; tick once per minute. Fire immediately so the System Time
    // field isn't blank for up to 60s after navigation.
    function tick() {
      setTime(new Date().toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric",
        year: "numeric", hour: "numeric", minute: "2-digit",
      }))
    }
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])

  async function loadStats() {
    const [{ count: watchlistCount }, { count: openAlerts }] = await Promise.all([
      supabase.from("watchlist").select("*", { count: "exact", head: true }),
      supabase.from("alerts").select("*", { count: "exact", head: true }).is("ack_at", null).eq("status", "sent"),
    ])
    setStats({ watchlistCount: watchlistCount || 0, openAlerts: openAlerts || 0 })
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
              <div className="text-gray-500 text-xs mt-0.5">Property Solutions Platform</div>
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

        {/* STATUS STRIP — watchlist + alerts only */}
        <div className="flex gap-2 mb-3">
          <StatCard label="Watchlist Active" value={stats.watchlistCount} accent="red"    href="/userdash?tab=watchlist" />
          {stats.openAlerts > 0 && (
            <StatCard label="Open Alerts" value={stats.openAlerts} accent="orange" href="/alerts" />
          )}
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
            href="/userdash"
            icon="📋"
            title="User Dashboard"
            desc="Passdowns, BOLOs, Officer Reports, Watchlist, and Rent Roll."
            color="gray"
          />

          <ModuleCard
            href="/vms/property"
            icon="🏢"
            title="Property Hub"
            desc="Rent roll, lease violations, unit activity, community contacts, and registered vehicles."
            color="indigo"
          />

        </div>

        {/* MODULES — secondary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">

          <ModuleCard
            href="/alerts"
            icon="🔔"
            title="Alerts & Notify"
            desc="Watchlist hits, incident escalations, and panic SOS — live feed."
            color="red"
            badge={stats.openAlerts > 0 ? `${stats.openAlerts} open` : undefined}
          />

          {isAdmin && (
            <ModuleCard
              href="/admin/system"
              icon="⚙️"
              title="Admin Dashboard"
              desc="Manage communities, users, notification recipients, and system settings."
              color="indigo"
            />
          )}

        </div>

        {/* FOOTER */}
        <div className="mt-6 pt-3 border-t border-gray-200 text-center text-[11px] text-gray-500">
          © {new Date().getFullYear()} American Security Group. All rights reserved.
          <span className="mx-1.5 text-gray-300">·</span>
          ASG-PSP v{pkg.version}
          {process.env.NEXT_PUBLIC_BUILD_DATE && (
            <>
              <span className="mx-1.5 text-gray-300">·</span>
              {process.env.NEXT_PUBLIC_BUILD_DATE}
            </>
          )}
        </div>

      </div>
    </div>
  )
}

function StatCard({ label, value, accent, href }: { label: string; value: number; accent: string; href?: string }) {
  const colors: Record<string, string> = {
    blue:    "border-blue-300 text-blue-700",
    indigo:  "border-indigo-300 text-indigo-700",
    violet:  "border-violet-300 text-violet-700",
    sky:     "border-sky-300 text-sky-700",
    emerald: "border-emerald-300 text-emerald-700",
    red:     "border-red-300 text-red-700",
    orange:  "border-orange-300 text-orange-700",
  }
  const card = (
    <div className={`bg-white border rounded-lg px-3 py-2 ${colors[accent]} ${href ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}>
      <div className="text-xl font-bold leading-tight">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  )
  return href ? <Link href={href}>{card}</Link> : card
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

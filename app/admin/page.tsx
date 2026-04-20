"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { WatchlistEntry } from "@/lib/types"

type Tab = "dashboard" | "watchlist" | "rentroll"

export default function AdminDashboard() {

  const [activeTab, setActiveTab] = useState<Tab>("dashboard")

  const [stats, setStats] = useState({ total: 0, visitor: 0, delivery: 0, contractor: 0 })
  const [communities, setCommunities] = useState<any[]>([])
  const [communityId, setCommunityId] = useState("")
  const [message, setMessage] = useState("")

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [watchlistSearch, setWatchlistSearch] = useState("")

  const [rentRoll, setRentRoll] = useState<any[]>([])
  const [rentRollLoading, setRentRollLoading] = useState(false)
  const [rentRollSearch, setRentRollSearch] = useState("")
  const [rentRollCommunityId, setRentRollCommunityId] = useState("")

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (activeTab === "watchlist") loadWatchlist()
    if (activeTab === "rentroll") loadRentRoll()
  }, [activeTab])

  async function load() {
    const { data } = await supabase.from("visitor_logs").select("*")
    const total = data?.length || 0
    setStats({
      total,
      visitor:    data?.filter(v => v.person_type?.toLowerCase() === "visitor").length    || 0,
      delivery:   data?.filter(v => v.person_type?.toLowerCase() === "delivery").length   || 0,
      contractor: data?.filter(v => v.person_type?.toLowerCase() === "contractor").length || 0
    })
    const { data: c } = await supabase.from("communities").select("*")
    setCommunities(c || [])
    if (c?.length) setCommunityId(c[0].id)
  }

  async function loadRentRoll(commId?: string) {
    setRentRollLoading(true)
    const id = commId ?? rentRollCommunityId

    // Look up community name so we can match either UUID or name string
    const community = communities.find(c => c.id === id)
    const commName  = community?.name || ""

    const { data } = await supabase
      .from("residents")
      .select("*")
      .order("unit_number", { ascending: true })

    // Filter client-side — residents may store community_id as UUID or as name string
    const filtered = (data || []).filter(r => {
      if (!id) return true
      return r.community_id === id || r.community_id === commName
    })

    setRentRoll(filtered)
    setRentRollLoading(false)
  }

  async function loadWatchlist(commId?: string) {
    setWatchlistLoading(true)
    let query = supabase.from("watchlist").select("*").order("last_name", { ascending: true })
    const id = commId ?? communityId
    if (id) query = query.eq("community_id", id)
    const { data } = await query
    setWatchlist(data || [])
    setWatchlistLoading(false)
  }

  async function handleRentRollUpload(file: File) {
    const text = await file.text()
    const rows = text.split("\n").slice(1)
    for (let row of rows) {
      const [unit_number, resident_name] = row.split(",")
      if (!unit_number) continue
      await supabase.from("units").upsert([{ unit_number, community_id: communityId }])
      await supabase.from("residents").upsert([{ name: resident_name, unit_number, community_id: communityId }])
    }
    setMessage("✅ Rent Roll Uploaded")
  }

  async function handleWatchlistUpload(file: File) {
    const text = await file.text()
    const rows = text.split("\n").slice(1)
    for (let row of rows) {
      const [first_name, last_name, dob, reason, severity] = row.split(",")
      if (!last_name) continue
      await supabase.from("watchlist").upsert([{ first_name, last_name, dob, reason, severity, community_id: communityId }])
    }
    setMessage("🚨 Watchlist Uploaded")
    if (activeTab === "watchlist") loadWatchlist()
  }

  const filteredRentRoll = rentRoll.filter(r => {
    if (!rentRollSearch) return true
    const q = rentRollSearch.toLowerCase()
    return (
      r.name?.toLowerCase().includes(q) ||
      r.unit_number?.toLowerCase().includes(q)
    )
  })

  const filtered = watchlist.filter(p => {
    if (!watchlistSearch) return true
    const q = watchlistSearch.toLowerCase()
    return (
      p.first_name?.toLowerCase().includes(q) ||
      p.last_name?.toLowerCase().includes(q)  ||
      p.oln?.toLowerCase().includes(q)         ||
      p.reason?.toLowerCase().includes(q)
    )
  })

  const tabCls = (t: Tab) =>
    `px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
      activeTab === t
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-gray-500 hover:text-gray-800"
    }`

  return (
    <div className="p-5 max-w-6xl">

      <h2 className="text-2xl font-bold mb-6">Admin Dashboard</h2>

      {/* TABS */}
      <div className="flex border-b border-gray-200 mb-6">
        <button className={tabCls("dashboard")} onClick={() => setActiveTab("dashboard")}>
          ⚙️ Dashboard
        </button>
        <button className={tabCls("watchlist")} onClick={() => setActiveTab("watchlist")}>
          🚨 Watchlist
        </button>
        <button className={tabCls("rentroll")} onClick={() => setActiveTab("rentroll")}>
          🏠 Rent Roll
        </button>
      </div>

      {/* ── DASHBOARD TAB ── */}
      {activeTab === "dashboard" && (
        <div>

          {/* STATS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Entries" value={stats.total} />
            <StatCard label="Visitors"      value={stats.visitor} />
            <StatCard label="Deliveries"    value={stats.delivery} />
            <StatCard label="Contractors"   value={stats.contractor} />
          </div>

          {/* COMMUNITY SELECTOR */}
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">Community</label>
            <select
              value={communityId}
              onChange={(e) => setCommunityId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {communities.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* UPLOADS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <UploadBox
              title="📥 Upload Rent Roll"
              desc="CSV format: unit_number, resident_name"
              onChange={(f) => handleRentRollUpload(f)}
            />

            <UploadBox
              title="🚨 Upload Watchlist"
              desc="CSV format: first_name, last_name, dob, reason, severity"
              onChange={(f) => handleWatchlistUpload(f)}
            />

          </div>

          {message && (
            <div className="mt-5 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {message}
            </div>
          )}

        </div>
      )}

      {/* ── WATCHLIST TAB ── */}
      {activeTab === "watchlist" && (
        <div>

          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <select
                value={communityId}
                onChange={(e) => { setCommunityId(e.target.value); loadWatchlist(e.target.value) }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">All Communities</option>
                {communities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500">
                {filtered.length} {filtered.length === 1 ? "person" : "persons"}
              </span>
            </div>
            <input
              value={watchlistSearch}
              onChange={(e) => setWatchlistSearch(e.target.value)}
              placeholder="Search name, OLN, or reason..."
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {watchlistLoading && (
            <div className="text-gray-500 text-sm py-8 text-center">Loading watchlist...</div>
          )}

          {!watchlistLoading && filtered.length === 0 && (
            <div className="text-gray-500 text-sm py-8 text-center">No watchlist entries found.</div>
          )}

          {!watchlistLoading && filtered.map((p, i) => (
            <div key={p.id || i} className="border border-gray-200 rounded-xl px-5 py-4 mb-3 bg-white hover:border-red-300 transition-colors">
              <div className="flex justify-between items-start">

                <div>
                  <div className="font-bold text-gray-900 text-base">
                    {p.last_name}, {p.first_name}
                    {p.firearm_flag && (
                      <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                        🔫 FIREARM
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-red-600 font-medium mt-0.5">
                    🚨 {p.reason || "No reason listed"}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                    {p.dob  && <span>DOB: {p.dob}</span>}
                    {p.oln  && <span>OLN: {p.oln}</span>}
                    {p.sex  && <span>Sex: {p.sex}</span>}
                    {p.race && <span>Race: {p.race}</span>}
                  </div>

                  {(p.notes || p.comments) && (
                    <div className="text-xs text-gray-400 mt-1">
                      Notes: {p.notes || p.comments}
                    </div>
                  )}
                </div>

                <div className="text-right text-xs text-gray-400 shrink-0 ml-4">
                  {(p.ban_date || p.banned_date || p.date_banned) && (
                    <div>Banned: {p.ban_date || p.banned_date || p.date_banned}</div>
                  )}
                  {(p.flagged_by || p.banned_by) && (
                    <div>By: {p.flagged_by || p.banned_by}</div>
                  )}
                </div>

              </div>
            </div>
          ))}

        </div>
      )}

      {/* ── RENT ROLL TAB ── */}
      {activeTab === "rentroll" && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <select
                value={rentRollCommunityId}
                onChange={(e) => {
                  setRentRollCommunityId(e.target.value)
                  loadRentRoll(e.target.value)
                }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">All Communities</option>
                {communities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500">
                {filteredRentRoll.length} {filteredRentRoll.length === 1 ? "resident" : "residents"}
              </span>
            </div>
            <input
              value={rentRollSearch}
              onChange={(e) => setRentRollSearch(e.target.value)}
              placeholder="Search name or unit..."
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {rentRollLoading && (
            <div className="text-gray-500 text-sm py-8 text-center">Loading rent roll...</div>
          )}

          {!rentRollLoading && filteredRentRoll.length === 0 && (
            <div className="text-gray-500 text-sm py-8 text-center">
              {rentRollCommunityId ? "No residents found for this community." : "Select a community to view residents."}
            </div>
          )}

          {!rentRollLoading && filteredRentRoll.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Unit</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Relationship</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Move-In</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRentRoll.map((r, i) => (
                    <tr key={r.id || i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3 font-mono font-medium text-blue-700">{r.unit_number || "—"}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{r.relationship || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{r.move_in ? new Date(r.move_in).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function UploadBox({ title, desc, onChange }: { title: string; desc: string; onChange: (f: File) => void }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="font-semibold text-gray-800 mb-1">{title}</div>
      <div className="text-xs text-gray-400 mb-3">{desc}</div>
      <input
        type="file"
        accept=".csv"
        onChange={(e) => { if (e.target.files?.[0]) onChange(e.target.files[0]) }}
        className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900"
      />
    </div>
  )
}

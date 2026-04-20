"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { WatchlistEntry } from "@/lib/types"
import Papa from "papaparse"

type Tab        = "dashboard" | "watchlist" | "rentroll" | "reports"
type ReportTab  = "daily" | "incident" | "view"

export default function UserDashboard() {

  const [activeTab, setActiveTab] = useState<Tab>("dashboard")

  const [stats, setStats] = useState({ total: 0, visitor: 0, delivery: 0, contractor: 0 })
  const [communities, setCommunities] = useState<any[]>([])
  const [communityId, setCommunityId] = useState("")
  const [message, setMessage] = useState("")

  const [watchlist,       setWatchlist]       = useState<WatchlistEntry[]>([])
  const [watchlistLoading,setWatchlistLoading] = useState(false)
  const [watchlistSearch, setWatchlistSearch] = useState("")

  const [rentRoll,          setRentRoll]          = useState<any[]>([])
  const [rentRollLoading,   setRentRollLoading]   = useState(false)
  const [rentRollSearch,    setRentRollSearch]    = useState("")
  const [rentRollCommunityId, setRentRollCommunityId] = useState("")

  // Rent roll import
  const [importPreview,     setImportPreview]     = useState<any[]>([])
  const [importCommunityId, setImportCommunityId] = useState("")
  const [importLoading,     setImportLoading]     = useState(false)
  const [importStatus,      setImportStatus]      = useState("")
  const [importError,       setImportError]       = useState("")
  const [showImport,        setShowImport]        = useState(false)

  // Officer reports
  const [reportTab,     setReportTab]    = useState<ReportTab>("daily")
  const [reportSaving,  setReportSaving] = useState(false)
  const [reportMessage, setReportMessage]= useState("")
  const [reportError,   setReportError]  = useState("")
  const [pastReports,    setPastReports]    = useState<any[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [expandedReport, setExpandedReport] = useState<number | null>(null)

  // Daily log form
  const [dailyDate,      setDailyDate]      = useState(new Date().toISOString().split("T")[0])
  const [dailyShift,     setDailyShift]     = useState("Day")
  const [dailyCommunity, setDailyCommunity] = useState("")
  const [dailyOfficer,   setDailyOfficer]   = useState("")
  const [dailyWeather,   setDailyWeather]   = useState("")
  const [dailyNarrative, setDailyNarrative] = useState("")
  const [dailyNotes,     setDailyNotes]     = useState("")

  // Incident report form
  const [incDate,        setIncDate]        = useState(new Date().toISOString().split("T")[0])
  const [incTime,        setIncTime]        = useState("")
  const [incCommunity,   setIncCommunity]   = useState("")
  const [incLocation,    setIncLocation]    = useState("")
  const [incType,        setIncType]        = useState("Disturbance")
  const [incPersons,     setIncPersons]     = useState("")
  const [incDescription, setIncDescription] = useState("")
  const [incAction,      setIncAction]      = useState("")
  const [incFollowUp,    setIncFollowUp]    = useState(false)
  const [incOfficer,     setIncOfficer]     = useState("")

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (activeTab === "watchlist") loadWatchlist()
    if (activeTab === "rentroll")  loadRentRoll()
    if (activeTab === "reports")   loadPastReports()
  }, [activeTab])

  async function load() {
    const { data } = await supabase.from("visitor_logs").select("*")
    setStats({
      total:      data?.length || 0,
      visitor:    data?.filter(v => v.person_type?.toLowerCase() === "visitor").length    || 0,
      delivery:   data?.filter(v => v.person_type?.toLowerCase() === "delivery").length   || 0,
      contractor: data?.filter(v => v.person_type?.toLowerCase() === "contractor").length || 0
    })
    const { data: c } = await supabase.from("communities").select("*")
    setCommunities(c || [])
    if (c?.length) {
      setCommunityId(c[0].id)
      setDailyCommunity(c[0].id)
      setIncCommunity(c[0].id)
    }

    // Pre-fill officer name from logged-in user
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      const name = user.email.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, c => c.toUpperCase())
      setDailyOfficer(name)
      setIncOfficer(name)
    }
  }

  async function loadWatchlist(commId?: string) {
    setWatchlistLoading(true)
    const id = commId ?? communityId
    let query = supabase.from("watchlist").select("*").order("last_name", { ascending: true })
    if (id) query = query.eq("community_id", id)
    const { data } = await query
    setWatchlist(data || [])
    setWatchlistLoading(false)
  }

  async function loadRentRoll(commId?: string) {
    setRentRollLoading(true)
    const id = commId ?? rentRollCommunityId
    const community = communities.find(c => c.id === id)
    const commName  = community?.name || ""
    const { data } = await supabase.from("residents").select("*").order("unit_number", { ascending: true })
    const filtered = (data || []).filter(r => {
      if (!id) return true
      return r.community_id === id || r.community_id === commName
    })
    setRentRoll(filtered)
    setRentRollLoading(false)
  }

  async function loadPastReports() {
    setReportsLoading(true)
    const { data: daily }    = await supabase.from("officer_daily_logs").select("*").order("date", { ascending: false }).limit(20)
    const { data: incidents } = await supabase.from("incident_reports").select("*").order("date", { ascending: false }).limit(20)
    const combined = [
      ...(daily    || []).map(r => ({ ...r, _type: "Daily Log" })),
      ...(incidents || []).map(r => ({ ...r, _type: "Incident" }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setPastReports(combined)
    setReportsLoading(false)
  }

  async function saveDailyLog() {
    if (!dailyNarrative) { setReportError("Patrol narrative is required."); return }
    setReportSaving(true); setReportError(""); setReportMessage("")
    const { error } = await supabase.from("officer_daily_logs").insert({
      date: dailyDate, shift: dailyShift, community_id: dailyCommunity,
      officer_name: dailyOfficer, weather: dailyWeather,
      narrative: dailyNarrative, notes: dailyNotes,
      created_at: new Date().toISOString()
    })
    setReportSaving(false)
    if (error) { setReportError(error.message); return }
    setReportMessage("✅ Daily log submitted.")
    setDailyNarrative(""); setDailyNotes(""); setDailyWeather("")
  }

  async function saveIncidentReport() {
    if (!incDescription) { setReportError("Incident description is required."); return }
    setReportSaving(true); setReportError(""); setReportMessage("")
    const { error } = await supabase.from("incident_reports").insert({
      date: incDate, time: incTime, community_id: incCommunity,
      location: incLocation, incident_type: incType,
      persons_involved: incPersons, description: incDescription,
      action_taken: incAction, follow_up_required: incFollowUp,
      officer_name: incOfficer, created_at: new Date().toISOString()
    })
    setReportSaving(false)
    if (error) { setReportError(error.message); return }
    setReportMessage("✅ Incident report submitted.")
    setIncDescription(""); setIncAction(""); setIncPersons(""); setIncLocation(""); setIncFollowUp(false)
  }

  async function handleRentRollUpload(file: File) {
    const text = await file.text()
    for (let row of text.split("\n").slice(1)) {
      const [unit_number, resident_name] = row.split(",")
      if (!unit_number) continue
      await supabase.from("units").upsert([{ unit_number, community_id: communityId }])
      await supabase.from("residents").upsert([{ name: resident_name, unit_number, community_id: communityId }])
    }
    setMessage("✅ Rent Roll Uploaded")
  }

  function excelDateToISO(serial: any): string | null {
    if (!serial || typeof serial !== "number") return null
    return new Date((serial - 25569) * 86400 * 1000).toISOString().split("T")[0]
  }

  async function handleImportFileSelect(file: File) {
    setImportPreview([]); setImportError(""); setImportStatus("")
    try {
      const XLSX = await import("xlsx")
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: "array" })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
      const residents: any[] = []
      let currentUnit: string | null = null
      for (const row of rows) {
        const col0 = row[0]
        if (!col0 && !row[3]) continue
        if (typeof col0 === "string" && col0.startsWith("   ")) {
          currentUnit = col0.trim()
          if (row[3]) residents.push({ unit_number: currentUnit, name: String(row[3]), relationship: String(row[4] || ""), move_in: excelDateToISO(row[7]) })
        } else if (!col0 && row[3] && currentUnit) {
          residents.push({ unit_number: currentUnit, name: String(row[3]), relationship: String(row[4] || ""), move_in: null })
        }
      }
      if (!residents.length) { setImportError("No resident data found. Make sure this is a Yardi/property-management rent roll export."); return }
      setImportPreview(residents)
    } catch (e: any) {
      setImportError("Could not read file: " + e.message)
    }
  }

  async function confirmImport() {
    if (!importCommunityId) { setImportError("Please select a community first."); return }
    setImportLoading(true); setImportError("")
    const { error: delErr } = await supabase.from("residents").delete().eq("community_id", importCommunityId)
    if (delErr) { setImportError("Delete failed: " + delErr.message); setImportLoading(false); return }
    const rows = importPreview.map(r => ({ ...r, community_id: importCommunityId }))
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("residents").insert(rows.slice(i, i + 200))
      if (error) { setImportError("Insert failed: " + error.message); setImportLoading(false); return }
    }
    setImportLoading(false)
    setImportStatus(`✅ ${rows.length} residents imported successfully.`)
    setImportPreview([]); setShowImport(false)
    loadRentRoll(importCommunityId)
  }

  async function handleWatchlistUpload(file: File) {
    const text = await file.text()
    for (let row of text.split("\n").slice(1)) {
      const [first_name, last_name, dob, reason, severity] = row.split(",")
      if (!last_name) continue
      await supabase.from("watchlist").upsert([{ first_name, last_name, dob, reason, severity, community_id: communityId }])
    }
    setMessage("🚨 Watchlist Uploaded")
    if (activeTab === "watchlist") loadWatchlist()
  }

  function exportCSV() {
    const rows = pastReports.map(r => ({
      Type:             r._type,
      Date:             r.date,
      Time:             r.time || "",
      Officer:          r.officer_name || "",
      Shift:            r.shift || "",
      "Incident Type":  r.incident_type || "",
      Location:         r.location || "",
      "Persons Involved": r.persons_involved || "",
      Narrative:        r.narrative || r.description || "",
      "Action Taken":   r.action_taken || "",
      "Follow-Up":      r.follow_up_required ? "Yes" : "",
      Weather:          r.weather || "",
      Notes:            r.notes || "",
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `officer-reports-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPDF() {
    window.print()
  }

  function exportEmail() {
    const lines = pastReports.map(r => {
      const type = r._type === "Incident" ? "INCIDENT REPORT" : "DAILY LOG"
      const body = r.narrative || r.description || ""
      return `[${type}] ${r.date}${r.time ? " " + r.time : ""} | ${r.officer_name || ""}\n${body}${r.action_taken ? "\nAction: " + r.action_taken : ""}${r.follow_up_required ? "\n⚠ Follow-up required" : ""}`
    }).join("\n\n---\n\n")
    const subject = encodeURIComponent(`Officer Reports — ${new Date().toLocaleDateString()}`)
    const body    = encodeURIComponent(lines)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const filteredWatchlist = watchlist.filter(p => {
    if (!watchlistSearch) return true
    const q = watchlistSearch.toLowerCase()
    return p.first_name?.toLowerCase().includes(q) || p.last_name?.toLowerCase().includes(q) ||
           p.oln?.toLowerCase().includes(q) || p.reason?.toLowerCase().includes(q)
  })

  const filteredRentRoll = rentRoll.filter(r => {
    if (!rentRollSearch) return true
    const q = rentRollSearch.toLowerCase()
    return r.name?.toLowerCase().includes(q) || r.unit_number?.toLowerCase().includes(q)
  })

  const tabCls = (t: Tab) =>
    `px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
      activeTab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"
    }`

  const rTabCls = (t: ReportTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer border-none ${
      reportTab === t ? "bg-blue-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`

  const inputCls = "w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
  const textareaCls = "w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white resize-none"
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1"

  return (
    <div className="p-5 max-w-6xl">

      <h2 className="text-2xl font-bold mb-6">User Dashboard</h2>

      {/* MAIN TABS */}
      <div className="flex border-b border-gray-200 mb-6">
        <button className={tabCls("dashboard")} onClick={() => setActiveTab("dashboard")}>⚙️ Dashboard</button>
        <button className={tabCls("watchlist")} onClick={() => setActiveTab("watchlist")}>🚨 Watchlist</button>
        <button className={tabCls("rentroll")}  onClick={() => setActiveTab("rentroll")}>🏠 Rent Roll</button>
        <button className={tabCls("reports")}   onClick={() => setActiveTab("reports")}>📋 Officer Reports</button>
      </div>

      {/* ── DASHBOARD TAB ── */}
      {activeTab === "dashboard" && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Entries" value={stats.total} />
            <StatCard label="Visitors"      value={stats.visitor} />
            <StatCard label="Deliveries"    value={stats.delivery} />
            <StatCard label="Contractors"   value={stats.contractor} />
          </div>

          <div className="mb-6">
            <label className={labelCls}>Community</label>
            <select value={communityId} onChange={(e) => setCommunityId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600">
              {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <UploadBox title="📥 Upload Rent Roll"  desc="CSV: unit_number, resident_name"                       onChange={handleRentRollUpload} />
            <UploadBox title="🚨 Upload Watchlist"  desc="CSV: first_name, last_name, dob, reason, severity"    onChange={handleWatchlistUpload} />
          </div>

          {message && (
            <div className="mt-5 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{message}</div>
          )}
        </div>
      )}

      {/* ── WATCHLIST TAB ── */}
      {activeTab === "watchlist" && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <select value={communityId}
                onChange={(e) => { setCommunityId(e.target.value); loadWatchlist(e.target.value) }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="">All Communities</option>
                {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="text-sm text-gray-500">{filteredWatchlist.length} persons</span>
            </div>
            <input value={watchlistSearch} onChange={(e) => setWatchlistSearch(e.target.value)}
              placeholder="Search name, OLN, or reason..."
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600" />
          </div>

          {watchlistLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>}
          {!watchlistLoading && filteredWatchlist.length === 0 && <div className="text-gray-500 text-sm py-8 text-center">No entries found.</div>}
          {!watchlistLoading && filteredWatchlist.map((p, i) => (
            <div key={p.id || i} className="border border-gray-200 rounded-xl px-5 py-4 mb-3 bg-white hover:border-red-300 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-gray-900">
                    {p.last_name}, {p.first_name}
                    {p.firearm_flag && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">🔫 FIREARM</span>}
                  </div>
                  <div className="text-sm text-red-600 font-medium mt-0.5">🚨 {p.reason || "No reason listed"}</div>
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                    {p.dob && <span>DOB: {p.dob}</span>}
                    {p.oln && <span>OLN: {p.oln}</span>}
                    {p.sex && <span>Sex: {p.sex}</span>}
                    {p.race && <span>Race: {p.race}</span>}
                  </div>
                  {(p.notes || p.comments) && <div className="text-xs text-gray-400 mt-1">Notes: {p.notes || p.comments}</div>}
                </div>
                <div className="text-right text-xs text-gray-400 shrink-0 ml-4">
                  {(p.ban_date || p.banned_date) && <div>Banned: {p.ban_date || p.banned_date}</div>}
                  {(p.flagged_by || p.banned_by) && <div>By: {p.flagged_by || p.banned_by}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── RENT ROLL TAB ── */}
      {activeTab === "rentroll" && (
        <div>
          {/* Import panel toggle */}
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => { setShowImport(!showImport); setImportPreview([]); setImportError(""); setImportStatus("") }}
              className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer">
              {showImport ? "✕ Cancel Import" : "⬆ Import Rent Roll"}
            </button>
            {importStatus && <span className="text-green-600 text-sm font-medium">{importStatus}</span>}
          </div>

          {/* IMPORT PANEL */}
          {showImport && (
            <div className="border border-blue-200 rounded-xl bg-blue-50 p-5 mb-5">
              <h3 className="font-bold text-gray-800 mb-3">Import Rent Roll (.xlsx from Yardi / property software)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelCls}>Community</label>
                  <select value={importCommunityId} onChange={e => setImportCommunityId(e.target.value)} className={inputCls}>
                    <option value="">— Select community —</option>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Select File</label>
                  <input type="file" accept=".xlsx,.xls,.csv"
                    onChange={e => { if (e.target.files?.[0]) handleImportFileSelect(e.target.files[0]) }}
                    className="text-sm text-gray-600 w-full file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900" />
                </div>
              </div>

              {importError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-3">{importError}</div>}

              {importPreview.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-gray-700">
                      <strong>{importPreview.length}</strong> residents across{" "}
                      <strong>{new Set(importPreview.map(r => r.unit_number)).size}</strong> units ready to import.
                      {importCommunityId && <span className="text-orange-600 ml-2">⚠ This will replace all existing residents for the selected community.</span>}
                    </div>
                    <button onClick={confirmImport} disabled={importLoading || !importCommunityId}
                      className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer disabled:opacity-50">
                      {importLoading ? "Importing..." : "✓ Confirm Import"}
                    </button>
                  </div>
                  {/* Preview first 8 rows */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Unit</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Name</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Relationship</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Move-In</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 8).map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-3 py-1.5 font-mono text-blue-700">{r.unit_number}</td>
                            <td className="px-3 py-1.5">{r.name}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.relationship}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.move_in || "—"}</td>
                          </tr>
                        ))}
                        {importPreview.length > 8 && (
                          <tr><td colSpan={4} className="px-3 py-1.5 text-gray-400 text-center">…and {importPreview.length - 8} more</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FILTERS + SEARCH */}
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <select value={rentRollCommunityId}
                onChange={(e) => { setRentRollCommunityId(e.target.value); loadRentRoll(e.target.value) }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="">All Communities</option>
                {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="text-sm text-gray-500">{filteredRentRoll.length} residents</span>
            </div>
            <input value={rentRollSearch} onChange={(e) => setRentRollSearch(e.target.value)}
              placeholder="Search name or unit..."
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600" />
          </div>

          {rentRollLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>}
          {!rentRollLoading && filteredRentRoll.length === 0 && (
            <div className="text-gray-500 text-sm py-8 text-center">
              {rentRollCommunityId ? "No residents found." : "Select a community to view residents."}
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
                      <td className="px-4 py-3 font-medium">{r.name || "—"}</td>
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

      {/* ── OFFICER REPORTS TAB ── */}
      {activeTab === "reports" && (
        <div>
          {/* Sub-tab buttons */}
          <div className="flex gap-2 mb-6">
            <button className={rTabCls("daily")}    onClick={() => setReportTab("daily")}>📝 Daily Log</button>
            <button className={rTabCls("incident")} onClick={() => setReportTab("incident")}>🚨 Incident Report</button>
            <button className={rTabCls("view")}     onClick={() => { setReportTab("view"); loadPastReports() }}>📂 View Reports</button>
          </div>

          {reportError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{reportError}</div>
          )}
          {reportMessage && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{reportMessage}</div>
          )}

          {/* DAILY LOG FORM */}
          {reportTab === "daily" && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Daily Officer Log</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Shift</label>
                  <select value={dailyShift} onChange={e => setDailyShift(e.target.value)} className={inputCls}>
                    <option>Day</option>
                    <option>Evening</option>
                    <option>Night</option>
                    <option>Overnight</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Officer Name</label>
                  <input value={dailyOfficer} onChange={e => setDailyOfficer(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Community</label>
                  <select value={dailyCommunity} onChange={e => setDailyCommunity(e.target.value)} className={inputCls}>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Weather Conditions</label>
                  <input value={dailyWeather} onChange={e => setDailyWeather(e.target.value)} placeholder="e.g. Clear, Rainy" className={inputCls} />
                </div>
              </div>
              <div className="mb-4">
                <label className={labelCls}>Patrol Narrative <span className="text-red-500">*</span></label>
                <textarea rows={5} value={dailyNarrative} onChange={e => setDailyNarrative(e.target.value)}
                  placeholder="Describe patrol activities, observations, and any notable events..."
                  className={textareaCls} />
              </div>
              <div className="mb-5">
                <label className={labelCls}>Additional Notes</label>
                <textarea rows={3} value={dailyNotes} onChange={e => setDailyNotes(e.target.value)}
                  placeholder="Shift handoff notes, maintenance issues, follow-ups..."
                  className={textareaCls} />
              </div>
              <button onClick={saveDailyLog} disabled={reportSaving}
                className="px-6 py-3 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 transition-colors border-none cursor-pointer disabled:opacity-50">
                {reportSaving ? "Submitting..." : "Submit Daily Log"}
              </button>
            </div>
          )}

          {/* INCIDENT REPORT FORM */}
          {reportTab === "incident" && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Incident Report</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={incDate} onChange={e => setIncDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <input type="time" value={incTime} onChange={e => setIncTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Officer Name</label>
                  <input value={incOfficer} onChange={e => setIncOfficer(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Community</label>
                  <select value={incCommunity} onChange={e => setIncCommunity(e.target.value)} className={inputCls}>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Location / Unit</label>
                  <input value={incLocation} onChange={e => setIncLocation(e.target.value)} placeholder="e.g. Unit 204, Parking Lot" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Incident Type</label>
                  <select value={incType} onChange={e => setIncType(e.target.value)} className={inputCls}>
                    <option>Disturbance</option>
                    <option>Trespassing</option>
                    <option>Theft</option>
                    <option>Property Damage</option>
                    <option>Medical Emergency</option>
                    <option>Suspicious Activity</option>
                    <option>Domestic</option>
                    <option>Noise Complaint</option>
                    <option>Vehicle Incident</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className={labelCls}>Persons Involved</label>
                <input value={incPersons} onChange={e => setIncPersons(e.target.value)}
                  placeholder="Names, descriptions of involved parties"
                  className={inputCls} />
              </div>
              <div className="mb-4">
                <label className={labelCls}>Incident Description <span className="text-red-500">*</span></label>
                <textarea rows={5} value={incDescription} onChange={e => setIncDescription(e.target.value)}
                  placeholder="Detailed description of the incident..."
                  className={textareaCls} />
              </div>
              <div className="mb-4">
                <label className={labelCls}>Action Taken</label>
                <textarea rows={3} value={incAction} onChange={e => setIncAction(e.target.value)}
                  placeholder="What steps were taken to resolve the incident..."
                  className={textareaCls} />
              </div>
              <div className="mb-5 flex items-center gap-2">
                <input type="checkbox" id="followup" checked={incFollowUp} onChange={e => setIncFollowUp(e.target.checked)}
                  className="w-4 h-4 accent-blue-700" />
                <label htmlFor="followup" className="text-sm font-medium text-gray-700">Follow-up required</label>
              </div>
              <button onClick={saveIncidentReport} disabled={reportSaving}
                className="px-6 py-3 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 transition-colors border-none cursor-pointer disabled:opacity-50">
                {reportSaving ? "Submitting..." : "Submit Incident Report"}
              </button>
            </div>
          )}

          {/* VIEW REPORTS */}
          {reportTab === "view" && (
            <div>
              {/* EXPORT TOOLBAR */}
              {pastReports.length > 0 && (
                <div className="flex gap-2 mb-5">
                  <button onClick={exportCSV}
                    className="px-4 py-2 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer">
                    ⬇ Export CSV / Excel
                  </button>
                  <button onClick={exportPDF}
                    className="px-4 py-2 bg-gray-700 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 border-none cursor-pointer">
                    🖨 Print / Save PDF
                  </button>
                  <button onClick={exportEmail}
                    className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 border-none cursor-pointer">
                    ✉ Email Reports
                  </button>
                </div>
              )}

              {reportsLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading reports...</div>}
              {!reportsLoading && pastReports.length === 0 && (
                <div className="text-gray-500 text-sm py-8 text-center">No reports submitted yet.</div>
              )}

              {!reportsLoading && pastReports.map((r, i) => (
                <div key={i}
                  className={`border rounded-xl mb-3 overflow-hidden transition-all ${r._type === "Incident" ? "border-red-200" : "border-gray-200"}`}>

                  {/* HEADER ROW — always visible, click to expand */}
                  <div
                    className={`px-5 py-4 flex justify-between items-center cursor-pointer ${
                      r._type === "Incident" ? "bg-red-50 hover:bg-red-100" : "bg-white hover:bg-gray-50"
                    }`}
                    onClick={() => setExpandedReport(expandedReport === i ? null : i)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r._type === "Incident" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {r._type === "Incident" ? "🚨 Incident" : "📝 Daily Log"}
                      </span>
                      {r.incident_type && <span className="text-xs text-gray-500">{r.incident_type}</span>}
                      {r.shift         && <span className="text-xs text-gray-500">{r.shift} Shift</span>}
                      <span className="text-sm font-semibold text-gray-800 line-clamp-1">
                        {(r.narrative || r.description || "No description").slice(0, 80)}
                        {(r.narrative || r.description || "").length > 80 ? "…" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-3">
                      <div className="text-right text-xs text-gray-400">
                        <div>{r.date}{r.time ? " · " + r.time : ""}</div>
                        <div>{r.officer_name}</div>
                        {r.follow_up_required && <div className="text-orange-500 font-semibold">⚠ Follow-up</div>}
                      </div>
                      <span className="text-gray-400 text-sm">{expandedReport === i ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* EXPANDED DETAIL */}
                  {expandedReport === i && (
                    <div className="px-5 py-4 border-t border-gray-100 bg-white">
                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <Field label="Date"           value={r.date} />
                        {r.time          && <Field label="Time"           value={r.time} />}
                        <Field label="Officer"        value={r.officer_name} />
                        {r.shift         && <Field label="Shift"          value={r.shift} />}
                        {r.weather       && <Field label="Weather"        value={r.weather} />}
                        {r.incident_type && <Field label="Incident Type"  value={r.incident_type} />}
                        {r.location      && <Field label="Location"       value={r.location} />}
                        {r.persons_involved && <Field label="Persons Involved" value={r.persons_involved} />}
                      </div>

                      {(r.narrative || r.description) && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">
                            {r._type === "Incident" ? "Incident Description" : "Patrol Narrative"}
                          </div>
                          <div className="text-sm text-gray-800 bg-gray-50 rounded-lg px-4 py-3 whitespace-pre-wrap">
                            {r.narrative || r.description}
                          </div>
                        </div>
                      )}

                      {r.action_taken && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Action Taken</div>
                          <div className="text-sm text-gray-800 bg-gray-50 rounded-lg px-4 py-3 whitespace-pre-wrap">
                            {r.action_taken}
                          </div>
                        </div>
                      )}

                      {r.notes && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Notes</div>
                          <div className="text-sm text-gray-800 bg-gray-50 rounded-lg px-4 py-3 whitespace-pre-wrap">
                            {r.notes}
                          </div>
                        </div>
                      )}

                      {r.follow_up_required && (
                        <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm px-4 py-2 rounded-lg font-medium">
                          ⚠ Follow-up action required
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-400">{label}</div>
      <div className="text-gray-800">{value}</div>
    </div>
  )
}

function UploadBox({ title, desc, onChange }: { title: string; desc: string; onChange: (f: File) => void }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="font-semibold text-gray-800 mb-1">{title}</div>
      <div className="text-xs text-gray-400 mb-3">{desc}</div>
      <input type="file" accept=".csv"
        onChange={(e) => { if (e.target.files?.[0]) onChange(e.target.files[0]) }}
        className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900" />
    </div>
  )
}

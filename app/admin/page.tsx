"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { WatchlistEntry } from "@/lib/types"
import Papa from "papaparse"

type Tab       = "watchlist" | "rentroll" | "reports" | "passdown" | "bolo"
type ReportTab = "daily" | "incident" | "contact" | "view"

export default function UserDashboard() {

  const [activeTab,   setActiveTab]   = useState<Tab>("watchlist")
  const [communities, setCommunities] = useState<any[]>([])
  const [communityId, setCommunityId] = useState("")
  const [officerName, setOfficerName] = useState("")
  const [message,     setMessage]     = useState("")

  // Watchlist
  const [watchlist,        setWatchlist]        = useState<WatchlistEntry[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [watchlistSearch,  setWatchlistSearch]  = useState("")
  const [showAddWatchlist, setShowAddWatchlist] = useState(false)
  const [wlFirst,    setWlFirst]    = useState("")
  const [wlLast,     setWlLast]     = useState("")
  const [wlDob,      setWlDob]      = useState("")
  const [wlOln,      setWlOln]      = useState("")
  const [wlReason,   setWlReason]   = useState("")
  const [wlNotes,    setWlNotes]    = useState("")
  const [wlFirearm,  setWlFirearm]  = useState(false)
  const [wlCommunity,setWlCommunity]= useState("")
  const [wlSaving,   setWlSaving]   = useState(false)
  const [wlMessage,  setWlMessage]  = useState("")
  const [wlError,    setWlError]    = useState("")

  // Rent roll
  const [rentRoll,            setRentRoll]            = useState<any[]>([])
  const [rentRollLoading,     setRentRollLoading]     = useState(false)
  const [rentRollSearch,      setRentRollSearch]      = useState("")
  const [rentRollCommunityId, setRentRollCommunityId] = useState("")
  const [importPreview,       setImportPreview]       = useState<any[]>([])
  const [importAllUnits,      setImportAllUnits]      = useState<string[]>([])
  const [importCommunityId,   setImportCommunityId]   = useState("")
  const [importLoading,       setImportLoading]       = useState(false)
  const [importStatus,        setImportStatus]        = useState("")
  const [importError,         setImportError]         = useState("")
  const [showImport,          setShowImport]          = useState(false)

  // Officer reports
  const [reportTab,     setReportTab]     = useState<ReportTab>("daily")
  const [reportSaving,  setReportSaving]  = useState(false)
  const [reportMessage, setReportMessage] = useState("")
  const [reportError,   setReportError]   = useState("")
  const [pastReports,   setPastReports]   = useState<any[]>([])
  const [reportsLoading,setReportsLoading]= useState(false)
  const [expandedReport,setExpandedReport]= useState<number | null>(null)

  // Daily log
  const [dailyDate,      setDailyDate]      = useState(new Date().toISOString().split("T")[0])
  const [dailyShift,     setDailyShift]     = useState("Day")
  const [dailyCommunity, setDailyCommunity] = useState("")
  const [dailyOfficer,   setDailyOfficer]   = useState("")
  const [dailyWeather,   setDailyWeather]   = useState("")
  const [dailyNarrative, setDailyNarrative] = useState("")
  const [dailyNotes,     setDailyNotes]     = useState("")

  // Field contact
  const [ctFirstName,   setCtFirstName]   = useState("")
  const [ctLastName,    setCtLastName]    = useState("")
  const [ctDate,        setCtDate]        = useState(new Date().toISOString().split("T")[0])
  const [ctTime,        setCtTime]        = useState("")
  const [ctCommunity,   setCtCommunity]   = useState("")
  const [ctLocation,    setCtLocation]    = useState("")
  const [ctReason,      setCtReason]      = useState("")
  const [ctOfficer,     setCtOfficer]     = useState("")
  const [ctNotes,       setCtNotes]       = useState("")
  const [ctSex,         setCtSex]         = useState("")
  const [ctRace,        setCtRace]        = useState("")
  const [ctDob,         setCtDob]         = useState("")
  const [ctSsn,         setCtSsn]         = useState("")
  const [ctOln,         setCtOln]         = useState("")
  const [ctAddress,     setCtAddress]     = useState("")
  const [ctPhotoFile,   setCtPhotoFile]   = useState<File | null>(null)
  const [ctPhotoPreview,setCtPhotoPreview]= useState("")

  // Incident report
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

  // Passdown
  const [passdowns,       setPassdowns]       = useState<any[]>([])
  const [passdownLoading, setPassdownLoading] = useState(false)
  const [pdDate,          setPdDate]          = useState(new Date().toISOString().split("T")[0])
  const [pdShift,         setPdShift]         = useState("Day")
  const [pdCommunity,     setPdCommunity]     = useState("")
  const [pdOfficer,       setPdOfficer]       = useState("")
  const [pdNotes,         setPdNotes]         = useState("")
  const [pdSaving,        setPdSaving]        = useState(false)
  const [pdMessage,       setPdMessage]       = useState("")
  const [pdError,         setPdError]         = useState("")
  const [pdFilterComm,    setPdFilterComm]    = useState("")

  // BOLO
  const [bolos,          setBolos]          = useState<any[]>([])
  const [boloLoading,    setBoloLoading]    = useState(false)
  const [boloName,       setBoloName]       = useState("")
  const [boloDesc,       setBoloDesc]       = useState("")
  const [boloReason,     setBoloReason]     = useState("")
  const [boloVehicle,    setBoloVehicle]    = useState("")
  const [boloCommunity,  setBoloCommunity]  = useState("")
  const [boloAddedBy,    setBoloAddedBy]    = useState("")
  const [boloPhotoFile,  setBoloPhotoFile]  = useState<File | null>(null)
  const [boloPhotoPreview,setBoloPhotoPreview]= useState("")
  const [boloSaving,     setBoloSaving]     = useState(false)
  const [boloMessage,    setBoloMessage]    = useState("")
  const [boloError,      setBoloError]      = useState("")
  const [boloShowAll,    setBoloShowAll]    = useState(false)
  const [showAddBolo,    setShowAddBolo]    = useState(false)

  useEffect(() => { loadInit() }, [])

  useEffect(() => {
    if (activeTab === "watchlist") loadWatchlist()
    if (activeTab === "rentroll")  loadRentRoll()
    if (activeTab === "reports")   loadPastReports()
    if (activeTab === "passdown")  loadPassdowns()
    if (activeTab === "bolo")      loadBolos()
  }, [activeTab])

  async function loadInit() {
    const { data: c } = await supabase.from("communities").select("*")
    setCommunities(c || [])
    if (c?.length) {
      setCommunityId(c[0].id)
      setDailyCommunity(c[0].id)
      setIncCommunity(c[0].id)
      setWlCommunity(c[0].id)
      setPdCommunity(c[0].id)
      setBoloCommunity(c[0].id)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      const name = user.email.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, ch => ch.toUpperCase())
      setDailyOfficer(name); setIncOfficer(name); setPdOfficer(name); setBoloAddedBy(name)
      setOfficerName(name)
    }
  }

  // ── WATCHLIST ──
  async function loadWatchlist(commId?: string) {
    setWatchlistLoading(true)
    const id = commId ?? communityId
    let q = supabase.from("watchlist").select("*").order("last_name", { ascending: true })
    if (id) q = q.eq("community_id", id)
    const { data } = await q
    setWatchlist(data || [])
    setWatchlistLoading(false)
  }

  async function saveWatchlistEntry() {
    if (!wlLast) { setWlError("Last name is required."); return }
    if (!wlReason) { setWlError("Reason is required."); return }
    setWlSaving(true); setWlError(""); setWlMessage("")
    const { error } = await supabase.from("watchlist").insert({
      first_name: wlFirst || null, last_name: wlLast,
      dob: wlDob || null, oln: wlOln || null,
      reason: wlReason, notes: wlNotes || null,
      firearm_flag: wlFirearm,
      community_id: wlCommunity || null,
      flagged_by: officerName || null,
      ban_date: new Date().toISOString().split("T")[0],
    })
    setWlSaving(false)
    if (error) { setWlError(error.message); return }
    setWlMessage("✅ Person added to watchlist.")
    setWlFirst(""); setWlLast(""); setWlDob(""); setWlOln(""); setWlReason(""); setWlNotes(""); setWlFirearm(false)
    setShowAddWatchlist(false)
    loadWatchlist()
  }

  async function handleWatchlistCSV(file: File) {
    const text = await file.text()
    for (let row of text.split("\n").slice(1)) {
      const [first_name, last_name, dob, reason] = row.split(",")
      if (!last_name) continue
      await supabase.from("watchlist").upsert([{ first_name, last_name, dob, reason, community_id: communityId }])
    }
    setWlMessage("✅ Watchlist CSV imported.")
    loadWatchlist()
  }

  // ── RENT ROLL ──
  async function loadRentRoll(commId?: string) {
    setRentRollLoading(true)
    const id = commId ?? rentRollCommunityId
    let all: any[] = [], page = 0
    while (true) {
      const { data } = await supabase.from("residents").select("*")
        .order("unit_number", { ascending: true })
        .range(page * 1000, (page + 1) * 1000 - 1)
      if (!data || data.length === 0) break
      all = all.concat(data)
      if (data.length < 1000) break
      page++
    }
    setRentRoll(id ? all.filter(r => r.community_id === id) : all)
    setRentRollLoading(false)
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
      const allUnits = new Set<string>()
      let currentUnit: string | null = null
      for (const row of rows) {
        const col0 = row[0]
        if (!col0 && !row[3]) continue
        if (typeof col0 === "string" && col0.startsWith("   ")) {
          currentUnit = col0.trim()
          allUnits.add(currentUnit)
          if (row[3]) residents.push({ unit_number: currentUnit, name: String(row[3]), relationship: String(row[4] || ""), move_in: excelDateToISO(row[7]) })
          else residents.push({ unit_number: currentUnit, name: null, relationship: null, move_in: null })
        } else if (!col0 && row[3] && currentUnit) {
          residents.push({ unit_number: currentUnit, name: String(row[3]), relationship: String(row[4] || ""), move_in: null })
        }
      }
      if (!residents.length) { setImportError("No resident data found."); return }
      setImportAllUnits([...allUnits])
      setImportPreview(residents)
    } catch (e: any) { setImportError("Could not read file: " + e.message) }
  }

  async function confirmImport() {
    if (!importCommunityId) { setImportError("Select a community first."); return }
    setImportLoading(true); setImportError("")
    const { error: delErr } = await supabase.from("residents").delete().eq("community_id", importCommunityId)
    if (delErr) { setImportError("Delete failed: " + delErr.message); setImportLoading(false); return }
    const rows = importPreview.map(r => ({ ...r, community_id: importCommunityId }))
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("residents").insert(rows.slice(i, i + 200))
      if (error) { setImportError("Insert failed: " + error.message); setImportLoading(false); return }
    }
    await supabase.from("units").delete().eq("community_id", importCommunityId)
    const uniqueUnits = importAllUnits.map(u => ({ unit_number: u.trim(), community_id: importCommunityId }))
    for (let i = 0; i < uniqueUnits.length; i += 200) {
      await supabase.from("units").insert(uniqueUnits.slice(i, i + 200))
    }
    setImportLoading(false)
    setImportStatus(`✅ ${rows.length} residents across ${uniqueUnits.length} units imported.`)
    setImportPreview([]); setShowImport(false)
    loadRentRoll(importCommunityId)
  }

  // ── OFFICER REPORTS ──
  async function loadPastReports() {
    setReportsLoading(true)
    const { data: daily }     = await supabase.from("officer_daily_logs").select("*").order("date", { ascending: false }).limit(20)
    const { data: incidents } = await supabase.from("incident_reports").select("*").order("date", { ascending: false }).limit(20)
    const combined = [
      ...(daily     || []).map(r => ({ ...r, _type: "Daily Log" })),
      ...(incidents || []).map(r => ({ ...r, _type: "Incident"  }))
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

  async function saveContactLog() {
    if (!ctFirstName || !ctLastName) { setReportError("First and last name are required."); return }
    setReportSaving(true); setReportError(""); setReportMessage("")
    const contactedAt = ctDate && ctTime
      ? new Date(`${ctDate}T${ctTime}`).toISOString()
      : new Date(`${ctDate}T00:00:00`).toISOString()
    let photoUrl: string | null = null
    if (ctPhotoFile) {
      const ext  = ctPhotoFile.name.split(".").pop() || "jpg"
      const path = `${Date.now()}_${ctFirstName}_${ctLastName}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from("contact-photos").upload(path, ctPhotoFile, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("contact-photos").getPublicUrl(up.path)
        photoUrl = publicUrl
      }
    }
    const { error } = await supabase.from("contact_history").insert({
      first_name: ctFirstName, last_name: ctLastName, contacted_at: contactedAt,
      location: ctLocation || null, reason: ctReason || null, officer: ctOfficer || null,
      notes: ctNotes || null, community_id: ctCommunity || null,
      sex: ctSex || null, race: ctRace || null, dob: ctDob || null,
      ssn: ctSsn || null, oln: ctOln || null, address: ctAddress || null,
      photo_url: photoUrl,
    })
    setReportSaving(false)
    if (error) { setReportError(error.message); return }
    setReportMessage("✅ Field contact logged.")
    setCtFirstName(""); setCtLastName(""); setCtLocation(""); setCtReason(""); setCtOfficer(""); setCtNotes("")
    setCtSex(""); setCtRace(""); setCtDob(""); setCtSsn(""); setCtOln(""); setCtAddress("")
    setCtPhotoFile(null); setCtPhotoPreview("")
    setCtDate(new Date().toISOString().split("T")[0]); setCtTime("")
  }

  function exportCSV() {
    const rows = pastReports.map(r => ({
      Type: r._type, Date: r.date, Time: r.time || "",
      Officer: r.officer_name || "", Shift: r.shift || "",
      "Incident Type": r.incident_type || "", Location: r.location || "",
      "Persons Involved": r.persons_involved || "",
      Narrative: r.narrative || r.description || "",
      "Action Taken": r.action_taken || "",
      "Follow-Up": r.follow_up_required ? "Yes" : "",
      Weather: r.weather || "", Notes: r.notes || "",
    }))
    const csv  = Papa.unparse(rows)
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = `officer-reports-${new Date().toISOString().split("T")[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── PASSDOWN ──
  async function loadPassdowns() {
    setPassdownLoading(true)
    const { data } = await supabase.from("passdown_logs")
      .select("*").order("created_at", { ascending: false }).limit(30)
    setPassdowns(data || [])
    setPassdownLoading(false)
  }

  async function savePassdown() {
    if (!pdNotes) { setPdError("Passdown notes are required."); return }
    setPdSaving(true); setPdError(""); setPdMessage("")
    const { error } = await supabase.from("passdown_logs").insert({
      date: pdDate, shift: pdShift,
      community_id: pdCommunity || null,
      officer_name: pdOfficer, notes: pdNotes,
      created_at: new Date().toISOString()
    })
    setPdSaving(false)
    if (error) { setPdError(error.message); return }
    setPdMessage("✅ Passdown submitted.")
    setPdNotes("")
    loadPassdowns()
  }

  // ── BOLO ──
  async function loadBolos() {
    setBoloLoading(true)
    const { data } = await supabase.from("bolos")
      .select("*").order("created_at", { ascending: false })
    setBolos(data || [])
    setBoloLoading(false)
  }

  async function saveBolo() {
    if (!boloName && !boloDesc) { setBoloError("Name or description is required."); return }
    setBoloSaving(true); setBoloError(""); setBoloMessage("")
    let photoUrl: string | null = null
    if (boloPhotoFile) {
      const ext  = boloPhotoFile.name.split(".").pop() || "jpg"
      const path = `bolo_${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from("contact-photos").upload(path, boloPhotoFile, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("contact-photos").getPublicUrl(up.path)
        photoUrl = publicUrl
      }
    }
    const { error } = await supabase.from("bolos").insert({
      name: boloName || null, description: boloDesc || null,
      reason: boloReason || null, vehicle: boloVehicle || null,
      community_id: boloCommunity || null, added_by: boloAddedBy || null,
      photo_url: photoUrl, active: true,
      created_at: new Date().toISOString()
    })
    setBoloSaving(false)
    if (error) { setBoloError(error.message); return }
    setBoloMessage("✅ BOLO added.")
    setBoloName(""); setBoloDesc(""); setBoloReason(""); setBoloVehicle("")
    setBoloPhotoFile(null); setBoloPhotoPreview(""); setShowAddBolo(false)
    loadBolos()
  }

  async function resolveBolo(id: string) {
    await supabase.from("bolos").update({ active: false }).eq("id", id)
    loadBolos()
  }

  // ── HELPERS ──
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

  const filteredPassdowns = pdFilterComm
    ? passdowns.filter(p => p.community_id === pdFilterComm)
    : passdowns

  const displayedBolos = boloShowAll ? bolos : bolos.filter(b => b.active)
  const activeBoloCount = bolos.filter(b => b.active).length

  const getCommunityName = (id: string) => communities.find(c => c.id === id)?.name || ""

  const tabCls = (t: Tab) =>
    `px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
      activeTab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"
    }`

  const rTabCls = (t: ReportTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer border-none ${
      reportTab === t ? "bg-blue-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`

  const inputCls    = "w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
  const textareaCls = "w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white resize-none"
  const labelCls    = "block text-xs font-semibold text-gray-600 mb-1"

  return (
    <div className="p-5 max-w-6xl">

      <h2 className="text-2xl font-bold mb-6">User Dashboard</h2>

      {/* MAIN TABS */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        <button className={tabCls("watchlist")} onClick={() => setActiveTab("watchlist")}>🚨 Watchlist</button>
        <button className={tabCls("rentroll")}  onClick={() => setActiveTab("rentroll")}>🏠 Rent Roll</button>
        <button className={tabCls("reports")}   onClick={() => setActiveTab("reports")}>📋 Officer Reports</button>
        <button className={tabCls("passdown")}  onClick={() => setActiveTab("passdown")}>🔁 Passdown Log</button>
        <button className={tabCls("bolo")}      onClick={() => setActiveTab("bolo")}>
          🔍 BOLO {activeBoloCount > 0 && <span className="ml-1.5 bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5">{activeBoloCount}</span>}
        </button>
      </div>

      {/* ── WATCHLIST TAB ── */}
      {activeTab === "watchlist" && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={communityId}
                onChange={(e) => { setCommunityId(e.target.value); loadWatchlist(e.target.value) }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="">All Communities</option>
                {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="text-sm text-gray-500">{filteredWatchlist.length} persons</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input value={watchlistSearch} onChange={(e) => setWatchlistSearch(e.target.value)}
                placeholder="Search name, OLN, or reason..."
                className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-600" />
              <button onClick={() => { setShowAddWatchlist(!showAddWatchlist); setWlMessage(""); setWlError("") }}
                className="px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 border-none cursor-pointer">
                {showAddWatchlist ? "✕ Cancel" : "+ Add Person"}
              </button>
              <label className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 cursor-pointer">
                ⬆ Import CSV
                <input type="file" accept=".csv" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleWatchlistCSV(e.target.files[0]) }} />
              </label>
            </div>
          </div>

          {wlMessage && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-4">{wlMessage}</div>}
          {wlError   && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{wlError}</div>}

          {/* ADD WATCHLIST FORM */}
          {showAddWatchlist && (
            <div className="border border-red-200 rounded-xl bg-red-50 p-5 mb-5">
              <h3 className="font-bold text-gray-800 mb-3">Add to Watchlist</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className={labelCls}>First Name</label>
                  <input value={wlFirst} onChange={e => setWlFirst(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Last Name <span className="text-red-500">*</span></label>
                  <input value={wlLast} onChange={e => setWlLast(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>DOB</label>
                  <input type="date" value={wlDob} onChange={e => setWlDob(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>OLN (Driver License #)</label>
                  <input value={wlOln} onChange={e => setWlOln(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Community</label>
                  <select value={wlCommunity} onChange={e => setWlCommunity(e.target.value)} className={inputCls}>
                    <option value="">— Select —</option>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className={labelCls}>Reason / Ban Type <span className="text-red-500">*</span></label>
                  <input value={wlReason} onChange={e => setWlReason(e.target.value)} placeholder="e.g. Trespassing, Theft" className={inputCls} /></div>
                <div className="col-span-2"><label className={labelCls}>Notes</label>
                  <input value={wlNotes} onChange={e => setWlNotes(e.target.value)} placeholder="Additional details..." className={inputCls} /></div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="wlFirearm" checked={wlFirearm} onChange={e => setWlFirearm(e.target.checked)} className="w-4 h-4 accent-red-700" />
                  <label htmlFor="wlFirearm" className="text-sm font-medium text-gray-700">🔫 Firearm flag — known to carry</label>
                </div>
              </div>
              <button onClick={saveWatchlistEntry} disabled={wlSaving}
                className="px-5 py-2.5 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 border-none cursor-pointer disabled:opacity-50">
                {wlSaving ? "Saving..." : "Add to Watchlist"}
              </button>
            </div>
          )}

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
                    {p.dob  && <span>DOB: {p.dob}</span>}
                    {p.oln  && <span>OLN: {p.oln}</span>}
                    {p.sex  && <span>Sex: {p.sex}</span>}
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
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => { setShowImport(!showImport); setImportPreview([]); setImportError(""); setImportStatus("") }}
              className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer">
              {showImport ? "✕ Cancel Import" : "⬆ Import Rent Roll"}
            </button>
            {importStatus && <span className="text-green-600 text-sm font-medium">{importStatus}</span>}
          </div>

          {showImport && (
            <div className="border border-blue-200 rounded-xl bg-blue-50 p-5 mb-5">
              <h3 className="font-bold text-gray-800 mb-3">Import Rent Roll (.xlsx from Yardi)</h3>
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
                      <strong>{importPreview.length}</strong> residents across <strong>{new Set(importPreview.map(r => r.unit_number)).size}</strong> units ready.
                      {importCommunityId && <span className="text-orange-600 ml-2">⚠ Replaces existing residents for this community.</span>}
                    </div>
                    <button onClick={confirmImport} disabled={importLoading || !importCommunityId}
                      className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer disabled:opacity-50">
                      {importLoading ? "Importing..." : "✓ Confirm Import"}
                    </button>
                  </div>
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
                            <td className="px-3 py-1.5">{r.name ?? <span className="text-gray-400 italic">Vacant</span>}</td>
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

          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <select value={rentRollCommunityId}
                onChange={(e) => { setRentRollCommunityId(e.target.value); loadRentRoll(e.target.value) }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="">All Communities</option>
                {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="text-sm text-gray-500">{filteredRentRoll.length} residents</span>
              {(() => {
                const dates = filteredRentRoll.map(r => r.created_at).filter(Boolean)
                if (!dates.length) return null
                const latest = new Date(dates.reduce((a, b) => a > b ? a : b))
                return <span className="text-xs text-gray-400">· Last imported {latest.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              })()}
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
                      <td className="px-4 py-3 font-medium">{r.name ? r.name : <span className="text-gray-400 italic">Vacant</span>}</td>
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
          <div className="flex gap-2 mb-6 flex-wrap">
            <button className={rTabCls("daily")}    onClick={() => setReportTab("daily")}>📝 Daily Log</button>
            <button className={rTabCls("incident")} onClick={() => setReportTab("incident")}>🚨 Incident Report</button>
            <button className={rTabCls("contact")}  onClick={() => setReportTab("contact")}>📋 Field Contact</button>
            <button className={rTabCls("view")}     onClick={() => { setReportTab("view"); loadPastReports() }}>📂 View Reports</button>
          </div>

          {reportError   && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{reportError}</div>}
          {reportMessage && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{reportMessage}</div>}

          {/* DAILY LOG */}
          {reportTab === "daily" && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Daily Officer Log</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>Date</label>
                  <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Shift</label>
                  <select value={dailyShift} onChange={e => setDailyShift(e.target.value)} className={inputCls}>
                    <option>Day</option><option>Evening</option><option>Night</option><option>Overnight</option>
                  </select></div>
                <div><label className={labelCls}>Officer Name</label>
                  <input value={dailyOfficer} onChange={e => setDailyOfficer(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Community</label>
                  <select value={dailyCommunity} onChange={e => setDailyCommunity(e.target.value)} className={inputCls}>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className={labelCls}>Weather Conditions</label>
                  <input value={dailyWeather} onChange={e => setDailyWeather(e.target.value)} placeholder="e.g. Clear, Rainy" className={inputCls} /></div>
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
                className="px-6 py-3 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
                {reportSaving ? "Submitting..." : "Submit Daily Log"}
              </button>
            </div>
          )}

          {/* INCIDENT REPORT */}
          {reportTab === "incident" && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Incident Report</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>Date</label>
                  <input type="date" value={incDate} onChange={e => setIncDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Time</label>
                  <input type="time" value={incTime} onChange={e => setIncTime(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Officer Name</label>
                  <input value={incOfficer} onChange={e => setIncOfficer(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Community</label>
                  <select value={incCommunity} onChange={e => setIncCommunity(e.target.value)} className={inputCls}>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className={labelCls}>Location / Unit</label>
                  <input value={incLocation} onChange={e => setIncLocation(e.target.value)} placeholder="e.g. Unit 204, Parking Lot" className={inputCls} /></div>
                <div><label className={labelCls}>Incident Type</label>
                  <select value={incType} onChange={e => setIncType(e.target.value)} className={inputCls}>
                    <option>Disturbance</option><option>Trespassing</option><option>Theft</option>
                    <option>Property Damage</option><option>Medical Emergency</option>
                    <option>Suspicious Activity</option><option>Domestic</option>
                    <option>Noise Complaint</option><option>Vehicle Incident</option><option>Other</option>
                  </select></div>
              </div>
              <div className="mb-4">
                <label className={labelCls}>Persons Involved</label>
                <input value={incPersons} onChange={e => setIncPersons(e.target.value)}
                  placeholder="Names, descriptions of involved parties" className={inputCls} />
              </div>
              <div className="mb-4">
                <label className={labelCls}>Incident Description <span className="text-red-500">*</span></label>
                <textarea rows={5} value={incDescription} onChange={e => setIncDescription(e.target.value)}
                  placeholder="Detailed description of the incident..." className={textareaCls} />
              </div>
              <div className="mb-4">
                <label className={labelCls}>Action Taken</label>
                <textarea rows={3} value={incAction} onChange={e => setIncAction(e.target.value)}
                  placeholder="Steps taken to resolve the incident..." className={textareaCls} />
              </div>
              <div className="mb-5 flex items-center gap-2">
                <input type="checkbox" id="followup" checked={incFollowUp} onChange={e => setIncFollowUp(e.target.checked)} className="w-4 h-4 accent-blue-700" />
                <label htmlFor="followup" className="text-sm font-medium text-gray-700">Follow-up required</label>
              </div>
              <button onClick={saveIncidentReport} disabled={reportSaving}
                className="px-6 py-3 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 border-none cursor-pointer disabled:opacity-50">
                {reportSaving ? "Submitting..." : "Submit Incident Report"}
              </button>
            </div>
          )}

          {/* FIELD CONTACT */}
          {reportTab === "contact" && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Log Field Contact</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>First Name <span className="text-red-500">*</span></label>
                  <input value={ctFirstName} onChange={e => setCtFirstName(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Last Name <span className="text-red-500">*</span></label>
                  <input value={ctLastName} onChange={e => setCtLastName(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Date</label>
                  <input type="date" value={ctDate} onChange={e => setCtDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Time</label>
                  <input type="time" value={ctTime} onChange={e => setCtTime(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>DOB</label>
                  <input type="date" value={ctDob} onChange={e => setCtDob(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Sex</label>
                  <select value={ctSex} onChange={e => setCtSex(e.target.value)} className={inputCls}>
                    <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
                  </select></div>
                <div><label className={labelCls}>Race</label>
                  <select value={ctRace} onChange={e => setCtRace(e.target.value)} className={inputCls}>
                    <option value="">—</option><option>Black</option><option>White</option>
                    <option>Hispanic</option><option>Asian</option><option>Native American</option><option>Other</option>
                  </select></div>
                <div><label className={labelCls}>OLN (Driver License #)</label>
                  <input value={ctOln} onChange={e => setCtOln(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>SSN (last 4)</label>
                  <input value={ctSsn} onChange={e => setCtSsn(e.target.value)} placeholder="XXXX" maxLength={9} className={inputCls} /></div>
                <div><label className={labelCls}>Community</label>
                  <select value={ctCommunity} onChange={e => setCtCommunity(e.target.value)} className={inputCls}>
                    <option value="">— Select —</option>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="col-span-2"><label className={labelCls}>Address</label>
                  <input value={ctAddress} onChange={e => setCtAddress(e.target.value)} placeholder="Street address" className={inputCls} /></div>
                <div><label className={labelCls}>Location</label>
                  <input value={ctLocation} onChange={e => setCtLocation(e.target.value)} placeholder="e.g. Building 3, Parking Lot" className={inputCls} /></div>
                <div><label className={labelCls}>Reason / Type</label>
                  <input value={ctReason} onChange={e => setCtReason(e.target.value)} placeholder="e.g. Trespassing, Suspicious Activity" className={inputCls} /></div>
                <div className="col-span-2"><label className={labelCls}>Officer Name</label>
                  <input value={ctOfficer} onChange={e => setCtOfficer(e.target.value)} className={inputCls} /></div>
              </div>
              <div className="mb-4">
                <label className={labelCls}>Notes</label>
                <textarea rows={4} value={ctNotes} onChange={e => setCtNotes(e.target.value)}
                  placeholder="Details of the contact — description, outcome, follow-up needed..."
                  className={textareaCls} />
              </div>
              <div className="mb-5">
                <label className={labelCls}>Person Photo</label>
                <div className="flex items-start gap-4">
                  <div className="w-28 h-36 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-300">
                    {ctPhotoPreview
                      ? <img src={ctPhotoPreview} alt="preview" className="w-full h-full object-cover" />
                      : <span className="text-gray-400 text-xs text-center px-2">No photo</span>}
                  </div>
                  <div className="flex-1 pt-1">
                    <input type="file" accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0] || null
                        setCtPhotoFile(file)
                        setCtPhotoPreview(file ? URL.createObjectURL(file) : "")
                      }}
                      className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 cursor-pointer" />
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG accepted</p>
                  </div>
                </div>
              </div>
              <button onClick={saveContactLog} disabled={reportSaving}
                className="px-6 py-3 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
                {reportSaving ? "Saving..." : "Log Field Contact"}
              </button>
            </div>
          )}

          {/* VIEW REPORTS */}
          {reportTab === "view" && (
            <div>
              {pastReports.length > 0 && (
                <div className="flex gap-2 mb-5">
                  <button onClick={exportCSV}
                    className="px-4 py-2 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer">
                    ⬇ Export CSV
                  </button>
                  <button onClick={() => window.print()}
                    className="px-4 py-2 bg-gray-700 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 border-none cursor-pointer">
                    🖨 Print / PDF
                  </button>
                </div>
              )}
              {reportsLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading reports...</div>}
              {!reportsLoading && pastReports.length === 0 && <div className="text-gray-500 text-sm py-8 text-center">No reports submitted yet.</div>}
              {!reportsLoading && pastReports.map((r, i) => (
                <div key={i} className={`border rounded-xl mb-3 overflow-hidden ${r._type === "Incident" ? "border-red-200" : "border-gray-200"}`}>
                  <div
                    className={`px-5 py-4 flex justify-between items-center cursor-pointer ${r._type === "Incident" ? "bg-red-50 hover:bg-red-100" : "bg-white hover:bg-gray-50"}`}
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
                  {expandedReport === i && (
                    <div className="px-5 py-4 border-t border-gray-100 bg-white">
                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <Field label="Date"    value={r.date} />
                        {r.time             && <Field label="Time"           value={r.time} />}
                        <Field label="Officer" value={r.officer_name} />
                        {r.shift            && <Field label="Shift"          value={r.shift} />}
                        {r.weather          && <Field label="Weather"        value={r.weather} />}
                        {r.incident_type    && <Field label="Incident Type"  value={r.incident_type} />}
                        {r.location         && <Field label="Location"       value={r.location} />}
                        {r.persons_involved && <Field label="Persons"        value={r.persons_involved} />}
                      </div>
                      {(r.narrative || r.description) && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">{r._type === "Incident" ? "Incident Description" : "Patrol Narrative"}</div>
                          <div className="text-sm text-gray-800 bg-gray-50 rounded-lg px-4 py-3 whitespace-pre-wrap">{r.narrative || r.description}</div>
                        </div>
                      )}
                      {r.action_taken && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Action Taken</div>
                          <div className="text-sm text-gray-800 bg-gray-50 rounded-lg px-4 py-3 whitespace-pre-wrap">{r.action_taken}</div>
                        </div>
                      )}
                      {r.notes && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Notes</div>
                          <div className="text-sm text-gray-800 bg-gray-50 rounded-lg px-4 py-3 whitespace-pre-wrap">{r.notes}</div>
                        </div>
                      )}
                      {r.follow_up_required && (
                        <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm px-4 py-2 rounded-lg font-medium">⚠ Follow-up action required</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PASSDOWN LOG TAB ── */}
      {activeTab === "passdown" && (
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* SUBMIT FORM */}
            <div>
              <h3 className="text-lg font-bold mb-4 text-gray-800">Submit Passdown</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className={labelCls}>Date</label>
                    <input type="date" value={pdDate} onChange={e => setPdDate(e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>Outgoing Shift</label>
                    <select value={pdShift} onChange={e => setPdShift(e.target.value)} className={inputCls}>
                      <option>Day</option><option>Evening</option><option>Night</option><option>Overnight</option>
                    </select></div>
                  <div><label className={labelCls}>Officer Name</label>
                    <input value={pdOfficer} onChange={e => setPdOfficer(e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>Community</label>
                    <select value={pdCommunity} onChange={e => setPdCommunity(e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select></div>
                </div>
                <div className="mb-4">
                  <label className={labelCls}>Passdown Notes <span className="text-red-500">*</span></label>
                  <textarea rows={6} value={pdNotes} onChange={e => setPdNotes(e.target.value)}
                    placeholder="Summarize shift activity, ongoing situations, items needing follow-up by incoming officer..."
                    className={textareaCls} />
                </div>
                {pdError   && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">{pdError}</div>}
                {pdMessage && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm mb-3">{pdMessage}</div>}
                <button onClick={savePassdown} disabled={pdSaving}
                  className="px-6 py-2.5 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
                  {pdSaving ? "Submitting..." : "Submit Passdown"}
                </button>
              </div>
            </div>

            {/* RECENT PASSDOWNS */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800">Recent Passdowns</h3>
                <select value={pdFilterComm} onChange={e => setPdFilterComm(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                  <option value="">All Properties</option>
                  {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {passdownLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>}
              {!passdownLoading && filteredPassdowns.length === 0 && (
                <div className="text-gray-400 text-sm py-8 text-center">No passdowns on record.</div>
              )}
              {!passdownLoading && filteredPassdowns.map((p, i) => (
                <div key={p.id || i} className="border border-gray-200 rounded-xl bg-white px-5 py-4 mb-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mr-2">{p.shift} Shift</span>
                      {p.community_id && <span className="text-xs text-gray-400">{getCommunityName(p.community_id)}</span>}
                    </div>
                    <div className="text-xs text-gray-400 text-right shrink-0 ml-2">
                      <div>{p.date}</div>
                      <div>{p.officer_name}</div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{p.notes}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── BOLO TAB ── */}
      {activeTab === "bolo" && (
        <div>
          {/* HEADER */}
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-gray-800">Be On the Lookout</h3>
              {activeBoloCount > 0 && (
                <span className="bg-red-100 text-red-700 text-sm font-bold px-3 py-0.5 rounded-full">
                  {activeBoloCount} Active
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setBoloShowAll(!boloShowAll)}
                className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 border-none cursor-pointer">
                {boloShowAll ? "Show Active Only" : "Show All"}
              </button>
              <button onClick={() => { setShowAddBolo(!showAddBolo); setBoloMessage(""); setBoloError("") }}
                className="px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 border-none cursor-pointer">
                {showAddBolo ? "✕ Cancel" : "+ Add BOLO"}
              </button>
            </div>
          </div>

          {boloMessage && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-4">{boloMessage}</div>}
          {boloError   && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{boloError}</div>}

          {/* ADD BOLO FORM */}
          {showAddBolo && (
            <div className="border-2 border-red-300 rounded-xl bg-red-50 p-5 mb-6">
              <h4 className="font-bold text-red-800 mb-3 text-sm uppercase tracking-wide">New BOLO Entry</h4>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div><label className={labelCls}>Subject Name</label>
                  <input value={boloName} onChange={e => setBoloName(e.target.value)} placeholder="First Last" className={inputCls} /></div>
                <div><label className={labelCls}>Reason / Alert Type</label>
                  <input value={boloReason} onChange={e => setBoloReason(e.target.value)} placeholder="e.g. Trespassing, Theft, Warrant" className={inputCls} /></div>
                <div className="col-span-2"><label className={labelCls}>Description</label>
                  <textarea rows={3} value={boloDesc} onChange={e => setBoloDesc(e.target.value)}
                    placeholder="Physical description, clothing, identifying features, last known location..."
                    className={textareaCls} /></div>
                <div><label className={labelCls}>Vehicle Description</label>
                  <input value={boloVehicle} onChange={e => setBoloVehicle(e.target.value)} placeholder="Year, Make, Model, Color, Plate" className={inputCls} /></div>
                <div><label className={labelCls}>Community</label>
                  <select value={boloCommunity} onChange={e => setBoloCommunity(e.target.value)} className={inputCls}>
                    <option value="">All Properties</option>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className={labelCls}>Added By</label>
                  <input value={boloAddedBy} onChange={e => setBoloAddedBy(e.target.value)} className={inputCls} /></div>

                {/* PHOTO */}
                <div className="col-span-2">
                  <label className={labelCls}>Subject Photo</label>
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-28 bg-gray-200 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-300">
                      {boloPhotoPreview
                        ? <img src={boloPhotoPreview} alt="preview" className="w-full h-full object-cover" />
                        : <span className="text-gray-400 text-xs text-center px-1">No photo</span>}
                    </div>
                    <div className="flex-1 pt-1">
                      <input type="file" accept="image/*"
                        onChange={e => {
                          const file = e.target.files?.[0] || null
                          setBoloPhotoFile(file)
                          setBoloPhotoPreview(file ? URL.createObjectURL(file) : "")
                        }}
                        className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-red-700 file:text-white hover:file:bg-red-800 cursor-pointer" />
                      <p className="text-xs text-gray-400 mt-1">JPG, PNG accepted</p>
                    </div>
                  </div>
                </div>
              </div>
              <button onClick={saveBolo} disabled={boloSaving}
                className="px-6 py-2.5 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 border-none cursor-pointer disabled:opacity-50">
                {boloSaving ? "Saving..." : "Issue BOLO"}
              </button>
            </div>
          )}

          {/* BOLO LIST */}
          {boloLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>}
          {!boloLoading && displayedBolos.length === 0 && (
            <div className="text-gray-400 text-sm py-12 text-center">
              <div className="text-4xl mb-2">🔍</div>
              <div>{boloShowAll ? "No BOLOs on record." : "No active BOLOs."}</div>
            </div>
          )}
          {!boloLoading && displayedBolos.map((b, i) => (
            <div key={b.id || i}
              className={`border-2 rounded-xl px-5 py-4 mb-3 ${b.active ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 opacity-60"}`}>
              <div className="flex gap-4">
                {b.photo_url && (
                  <img src={b.photo_url} alt="BOLO subject" className="w-20 h-24 object-cover rounded-lg flex-shrink-0 border border-red-200" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full mr-2 ${b.active ? "bg-red-600 text-white" : "bg-gray-400 text-white"}`}>
                        {b.active ? "🔴 ACTIVE" : "✓ Resolved"}
                      </span>
                      {b.community_id && <span className="text-xs text-gray-500">{getCommunityName(b.community_id)}</span>}
                    </div>
                    <div className="text-xs text-gray-400 text-right shrink-0 ml-2">
                      <div>{new Date(b.created_at).toLocaleDateString()}</div>
                      {b.added_by && <div>By: {b.added_by}</div>}
                    </div>
                  </div>
                  {b.name && <div className="font-bold text-gray-900 text-lg">{b.name}</div>}
                  {b.reason && <div className="text-red-700 font-semibold text-sm mb-1">{b.reason}</div>}
                  {b.description && <div className="text-sm text-gray-700 mb-1 whitespace-pre-wrap">{b.description}</div>}
                  {b.vehicle && (
                    <div className="text-xs text-gray-600 mt-1">
                      🚗 <span className="font-medium">Vehicle:</span> {b.vehicle}
                    </div>
                  )}
                  {b.active && (
                    <button onClick={() => resolveBolo(b.id)}
                      className="mt-3 px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 border-none cursor-pointer">
                      ✓ Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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

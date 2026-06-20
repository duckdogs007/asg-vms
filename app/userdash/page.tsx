"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { WatchlistEntry } from "@/lib/types"
import Papa from "papaparse"
import { fireAlert } from "@/lib/alerts"
import { maskSSN } from "@/lib/format"
import { checkIsAdmin } from "@/lib/admin"
import LocationField, { LocationValue, EMPTY_LOCATION } from "@/components/LocationField"
import { buildHohSnapshot, EMPTY_SNAPSHOT } from "@/lib/hohSnapshot"
import LeaseViolationForm from "@/components/LeaseViolationForm"
import GateChecklist from "./GateChecklist"
import { VehicleFields, EMPTY_VEHICLE, isNoPlate, displayPlate, type VehicleInfo } from "@/components/VehicleFields"
import { SignedImage, SignedLink } from "@/components/SignedImage"

// Structured parking-violation categories. A real enum (not a free-text flag)
// so reporting, per-location tow rules, and auto-remit routing can key off it.
const PARKING_VIOLATION_TYPES = [
  "No Parking Permit",
  "Expired Permit",
  "Fire Lane",
  "Handicap Zone",
  "Blocking / Obstruction",
  "Double Parked",
  "Reserved / Assigned Space",
  "Expired Registration",
  "Abandoned Vehicle",
  "Other",
] as const

const HIGH_PRIORITY_INCIDENT_TYPES = [
  "weapons", "weapon", "firearm",
  "shooting",
  "domestic", "domestic dispute", "domestic violence",
  "missing person", "missing",
  "fire",
  "bolo", "bolo sighting",
] as const

function isHighPriorityIncident(t: string | undefined): boolean {
  if (!t) return false
  const s = t.toLowerCase().trim()
  return HIGH_PRIORITY_INCIDENT_TYPES.some(k => s.includes(k))
}

type Tab       = "onduty" | "watchlist" | "reports" | "passdown" | "bolo" | "gatecheck"

// One-line descriptor shown under the tab bar so officers know what each tab is for.
const TAB_DESCRIPTIONS: Record<Tab, string> = {
  onduty:    "Officers currently signed on, grouped by assigned property — live status.",
  passdown:  "Shift-to-shift notes so the next officer knows what happened on the prior watch.",
  bolo:      "Be-On-the-Lookout alerts for persons or vehicles of interest at the property.",
  reports:   "File and review Daily Logs, Incident Reports, Field Contacts, Vehicle FIs, and Parking Violations.",
  watchlist: "Persons barred from the property — checked during visitor and ID-scan check-in.",
  gatecheck: "Per-tour security gate inspection — operation, locks, and damage for each numbered gate.",
}

// Surnames whose entries should render bold on the On Duty tab.
const SUPERVISOR_SURNAMES = ["conner", "oconner", "holmes", "hall", "simpson", "carthy"] as const

interface OfficerOnDuty {
  id:           string
  email:        string
  display_name: string
  community_id: string | null
  community:    string | null
  role:         string | null
  on_duty_at:   string | null
  off_duty_at:  string | null
  is_online:    boolean
}
type ReportTab = "daily" | "incident" | "contact" | "vfi" | "parking" | "view"

export default function UserDashboard() {

  const [activeTab,   setActiveTab]   = useState<Tab>("reports")
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
  const [wlSsn,      setWlSsn]      = useState("")
  const [wlSex,      setWlSex]      = useState("")
  const [wlRace,     setWlRace]     = useState("")
  const [wlReason,   setWlReason]   = useState("")
  const [wlNotes,    setWlNotes]    = useState("")
  const [wlFirearm,  setWlFirearm]  = useState(false)
  const [wlCommunity,setWlCommunity]= useState("")
  const [wlPhotoFile,   setWlPhotoFile]   = useState<File | null>(null)
  const [wlPhotoPreview,setWlPhotoPreview]= useState("")
  const [wlBanFiles,    setWlBanFiles]    = useState<File[]>([])
  const [wlSaving,   setWlSaving]   = useState(false)
  const [wlMessage,  setWlMessage]  = useState("")
  const [wlError,    setWlError]    = useState("")

  // Watchlist edit (admin-only). Default false so no buttons render before
  // the admin check resolves; failure leaves it false (safe fallback).
  const [isAdmin,        setIsAdmin]        = useState(false)
  const [editingWlId,    setEditingWlId]    = useState<string | null>(null)
  const [editFirst,      setEditFirst]      = useState("")
  const [editLast,       setEditLast]       = useState("")
  const [editDob,        setEditDob]        = useState("")
  const [editOln,        setEditOln]        = useState("")
  const [editSsn,        setEditSsn]        = useState("")
  const [editSex,        setEditSex]        = useState("")
  const [editRace,       setEditRace]       = useState("")
  const [editReason,     setEditReason]     = useState("")
  const [editNotes,      setEditNotes]      = useState("")
  const [editFirearm,    setEditFirearm]    = useState(false)
  const [editCommunity,  setEditCommunity]  = useState("")

  // Officer reports
  const [reportTab,     setReportTab]     = useState<ReportTab>("daily")
  const [reportSaving,  setReportSaving]  = useState(false)
  const [reportMessage, setReportMessage] = useState("")
  const [reportError,   setReportError]   = useState("")
  const [pastReports,   setPastReports]   = useState<any[]>([])
  const [rptSearch,     setRptSearch]     = useState("")
  const [violationForId,setViolationForId]= useState<string | null>(null)
  const [reportsLoading,setReportsLoading]= useState(false)
  const [expandedReport,setExpandedReport]= useState<number | null>(null)
  const [editingReport, setEditingReport] = useState<number | null>(null)
  const [editFields,    setEditFields]    = useState<Record<string, any>>({})


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

  // Vehicle FI
  const [vfiDate,         setVfiDate]         = useState(new Date().toISOString().split("T")[0])
  const [vfiTime,         setVfiTime]         = useState("")
  const [vfiCommunity,    setVfiCommunity]    = useState("")
  const [vfiOfficer,      setVfiOfficer]      = useState("")
  const [vfiLoc,          setVfiLoc]          = useState<LocationValue>(EMPTY_LOCATION)
  const [vfiVehicle,      setVfiVehicle]      = useState<VehicleInfo>(EMPTY_VEHICLE)
  const [vfiDescriptors,  setVfiDescriptors]  = useState("")
  const [vfiReason,       setVfiReason]       = useState("")
  const [vfiFollowUp,     setVfiFollowUp]     = useState(false)
  const [vfiViolation,    setVfiViolation]    = useState(false)
  const [vfiViolationNum, setVfiViolationNum] = useState("")
  const [vfiNotes,        setVfiNotes]        = useState("")
  const [vfiPhotoFile,    setVfiPhotoFile]    = useState<File | null>(null)
  const [vfiPhotoPreview, setVfiPhotoPreview] = useState("")
  const [vfiBoloHits,     setVfiBoloHits]     = useState<any[]>([])
  const [vfiBoloChecked,  setVfiBoloChecked]  = useState(false)
  const [vfiRegHits,      setVfiRegHits]      = useState<any[]>([])
  const [vfiRegChecked,   setVfiRegChecked]   = useState(false)

  // Parking violation
  const [pvDate,          setPvDate]          = useState(new Date().toISOString().split("T")[0])
  const [pvTime,          setPvTime]          = useState("")
  const [pvCommunity,     setPvCommunity]     = useState("")
  const [pvOfficer,       setPvOfficer]       = useState("")
  const [pvVehicle,       setPvVehicle]       = useState<VehicleInfo>(EMPTY_VEHICLE)
  const [pvLoc,           setPvLoc]           = useState<LocationValue>(EMPTY_LOCATION)
  const [pvSpace,         setPvSpace]         = useState("")
  const [pvViolationType, setPvViolationType] = useState<string>(PARKING_VIOLATION_TYPES[0])
  const [pvNotes,         setPvNotes]         = useState("")
  const [pvPhotoFile,     setPvPhotoFile]     = useState<File | null>(null)
  const [pvPhotoPreview,  setPvPhotoPreview]  = useState("")
  const [pvTowRequested,  setPvTowRequested]  = useState(false)
  const [pvTowReason,     setPvTowReason]     = useState("")
  const [pvBoloHits,      setPvBoloHits]      = useState<any[]>([])
  const [pvBoloChecked,   setPvBoloChecked]   = useState(false)
  const [pvRegHits,       setPvRegHits]       = useState<any[]>([])
  const [pvRegChecked,    setPvRegChecked]    = useState(false)

  // Incident report
  const [incDate,        setIncDate]        = useState(new Date().toISOString().split("T")[0])
  const [incTime,        setIncTime]        = useState("")
  const [incCommunity,   setIncCommunity]   = useState("")
  const [incLoc,         setIncLoc]         = useState<LocationValue>(EMPTY_LOCATION)
  const [incType,        setIncType]        = useState("Disturbance")
  const [incPersons,     setIncPersons]     = useState("")
  const [incDescription, setIncDescription] = useState("")
  const [incAction,      setIncAction]      = useState("")
  const [incFollowUp,    setIncFollowUp]    = useState(false)
  const [incOfficer,     setIncOfficer]     = useState("")
  const [incPhotoFiles,  setIncPhotoFiles]  = useState<File[]>([])
  const [aiBusy,         setAiBusy]         = useState<string | null>(null)  // which narrative action is running
  const [aiError,        setAiError]        = useState("")
  // Linked reference numbers (item 25) — same incident across Reliant / HPD / ASG systems
  const [incReliantNo,   setIncReliantNo]   = useState("")
  const [incHpdNo,       setIncHpdNo]       = useState("")
  const [incAsgNo,       setIncAsgNo]       = useState("")

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
  const [pdEditingId,     setPdEditingId]     = useState<string | null>(null)
  const [pdEditNotes,     setPdEditNotes]     = useState("")
  const [pdSendingId,     setPdSendingId]     = useState<string | null>(null)

  // BOLO
  const [bolos,          setBolos]          = useState<any[]>([])
  const [boloLoading,    setBoloLoading]    = useState(false)
  const [boloName,       setBoloName]       = useState("")
  const [boloDesc,       setBoloDesc]       = useState("")
  const [boloReason,     setBoloReason]     = useState("")
  const [boloDob,        setBoloDob]        = useState("")
  const [boloOln,        setBoloOln]        = useState("")
  const [boloSsn,        setBoloSsn]        = useState("")
  const [boloSex,        setBoloSex]        = useState("")
  const [boloRace,       setBoloRace]       = useState("")
  const [boloFirearm,    setBoloFirearm]    = useState(false)
  const [boloVehicle,    setBoloVehicle]    = useState("")
  const [boloPlate,      setBoloPlate]      = useState("")
  const [boloPlateState, setBoloPlateState] = useState("")
  const [boloCommunity,  setBoloCommunity]  = useState("")
  const [boloAddedBy,    setBoloAddedBy]    = useState("")
  const [boloPhotoFile,  setBoloPhotoFile]  = useState<File | null>(null)
  const [boloPhotoPreview,setBoloPhotoPreview]= useState("")
  const [boloSaving,     setBoloSaving]     = useState(false)
  const [boloMessage,    setBoloMessage]    = useState("")
  const [boloError,      setBoloError]      = useState("")
  const [boloShowAll,    setBoloShowAll]    = useState(false)
  const [showAddBolo,    setShowAddBolo]    = useState(false)
  // Inline edit state (admin only)
  const [editingBoloId,    setEditingBoloId]    = useState<string | null>(null)
  const [editBoloName,     setEditBoloName]     = useState("")
  const [editBoloDesc,     setEditBoloDesc]     = useState("")
  const [editBoloReason,   setEditBoloReason]   = useState("")
  const [editBoloDob,      setEditBoloDob]      = useState("")
  const [editBoloOln,      setEditBoloOln]      = useState("")
  const [editBoloSsn,      setEditBoloSsn]      = useState("")
  const [editBoloSex,      setEditBoloSex]      = useState("")
  const [editBoloRace,     setEditBoloRace]     = useState("")
  const [editBoloFirearm,  setEditBoloFirearm]  = useState(false)
  const [editBoloVehicle,  setEditBoloVehicle]  = useState("")
  const [editBoloPlate,      setEditBoloPlate]      = useState("")
  const [editBoloPlateState, setEditBoloPlateState] = useState("")
  const [editBoloCommunity,setEditBoloCommunity]= useState("")
  const [editBoloAddedBy,  setEditBoloAddedBy]  = useState("")
  const [savingBoloEdit,   setSavingBoloEdit]   = useState(false)

  // On Duty tab
  const [officers,        setOfficers]        = useState<OfficerOnDuty[]>([])
  const [officersLoading, setOfficersLoading] = useState(false)
  const [officersError,   setOfficersError]   = useState("")

  useEffect(() => { loadInit() }, [])

  useEffect(() => {
    // Async admin check — fail-safe to false if anything goes wrong
    checkIsAdmin().then(ok => setIsAdmin(ok)).catch(() => setIsAdmin(false))
  }, [])

  useEffect(() => {
    if (activeTab === "watchlist") loadWatchlist()
    if (activeTab === "reports")   loadPastReports()
    if (activeTab === "passdown")  loadPassdowns()
    if (activeTab === "bolo")      loadBolos()
    if (activeTab === "onduty")    loadOfficersOnDuty()
  }, [activeTab])

  async function loadOfficersOnDuty() {
    setOfficersLoading(true); setOfficersError("")
    try {
      const r = await fetch("/api/admin/officers-on-duty", { cache: "no-store" })
      const json = await r.json()
      if (!r.ok) {
        setOfficersError(json.error || `HTTP ${r.status}`)
        setOfficers([])
      } else {
        setOfficers(json.users || [])
      }
    } catch (e: any) {
      setOfficersError(e?.message || String(e))
      setOfficers([])
    } finally {
      setOfficersLoading(false)
    }
  }

  // Admin override: change another officer's assignment from the On Duty tab.
  // value is "" (unassigned), "__admin_super__", or a community_id.
  async function saveOfficerAssignment(userId: string, value: string) {
    const body =
      value === "__admin_super__" ? { user_id: userId, community_id: null, role: "admin_super" } :
      value === ""                ? { user_id: userId, community_id: null, role: null } :
                                    { user_id: userId, community_id: value, role: null }

    setOfficers(prev => prev.map(o => o.id !== userId ? o : ({
      ...o,
      community_id: body.community_id,
      community:    body.community_id ? (communities.find(c => c.id === body.community_id)?.name || null) : null,
      role:         body.role,
    })))

    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const json = await r.json().catch(() => ({}))
      setOfficersError(json.error || `HTTP ${r.status}`)
    }
  }

  async function loadInit() {
    const { data: c } = await supabase.from("communities").select("*")
    setCommunities(c || [])
    if (c?.length) {
      // Prefer the location the user picked at sign-on (mirrored to
      // localStorage by /confirm-location); fall back to first community.
      const savedId = typeof window !== "undefined" ? localStorage.getItem("asg-current-community-id") : null
      const defaultId = (savedId && c.some((x: any) => x.id === savedId)) ? savedId : c[0].id
      setCommunityId(defaultId)
      setDailyCommunity(defaultId)
      setIncCommunity(defaultId)
      setWlCommunity(defaultId)
      setPdCommunity(defaultId)
      setBoloCommunity(defaultId)
      setVfiCommunity(defaultId)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      const name = user.email.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, ch => ch.toUpperCase())
      setDailyOfficer(name); setIncOfficer(name); setPdOfficer(name); setBoloAddedBy(name); setVfiOfficer(name); setPvOfficer(name)
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
    if (!wlLast)      { setWlError("Last name is required."); return }
    if (!wlCommunity) { setWlError("Location is required.");  return }
    if (!wlReason)    { setWlError("Reason is required.");    return }
    setWlSaving(true); setWlError(""); setWlMessage("")
    let photoUrl: string | null = null
    if (wlPhotoFile) {
      const ext  = wlPhotoFile.name.split(".").pop() || "jpg"
      const path = `watchlist_${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from("photos").upload(path, wlPhotoFile, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(up.path)
        photoUrl = publicUrl
      }
    }
    // Ban sheet — images or PDFs, possibly multiple pages. Each file is
    // uploaded to the photos bucket and its public URL collected into an array.
    const banSheetUrls: string[] = []
    for (let i = 0; i < wlBanFiles.length; i++) {
      const f    = wlBanFiles[i]
      const ext  = f.name.split(".").pop() || "bin"
      const path = `bansheet_${Date.now()}_${i}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from("photos").upload(path, f, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(up.path)
        banSheetUrls.push(publicUrl)
      }
    }
    const { data: inserted, error } = await supabase.from("watchlist").insert({
      first_name: wlFirst || null, last_name: wlLast,
      dob: wlDob || null, oln: wlOln || null,
      ssn: wlSsn || null,
      sex: wlSex || null, race: wlRace || null,
      reason: wlReason, comments: wlNotes || null,
      community_id: wlCommunity || null,
      banned_by: officerName || null,
      ban_date: new Date().toISOString().split("T")[0],
      status: "Active",
      firearm_flag: wlFirearm,
      photo_url: photoUrl,
      ban_sheet_urls: banSheetUrls.length ? banSheetUrls : null,
    }).select("id").single()
    setWlSaving(false)
    if (error) { setWlError(error.message); return }
    setWlMessage("✅ Person added to watchlist.")
    notifyWatchlist((inserted as { id?: string } | null)?.id, "added")
    setWlFirst(""); setWlLast(""); setWlDob(""); setWlOln(""); setWlSsn(""); setWlSex(""); setWlRace(""); setWlReason(""); setWlNotes(""); setWlFirearm(false)
    setWlPhotoFile(null); setWlPhotoPreview(""); setWlBanFiles([])
    setShowAddWatchlist(false)
    await logActivity("created", "Watchlist", "", `Added ${wlFirst} ${wlLast} to watchlist`)
    // Sync the list filter to where the entry was actually placed so the
    // user sees their just-added person (otherwise the row may be hidden by
    // a mismatched community filter).
    const insertedCommunityId = wlCommunity || ""
    if (insertedCommunityId !== communityId) {
      setCommunityId(insertedCommunityId)
    }
    loadWatchlist(insertedCommunityId)
  }

  function startWatchlistEdit(p: WatchlistEntry) {
    setEditingWlId(p.id)
    setEditFirst((p.first_name || "").trim())
    setEditLast((p.last_name || "").trim())
    setEditDob(p.dob || "")
    setEditOln(p.oln || "")
    setEditSsn(p.ssn || "")
    setEditSex(p.sex || "")
    setEditRace(p.race || "")
    setEditReason(p.reason || "")
    setEditNotes(p.comments || p.notes || "")
    setEditFirearm(!!p.firearm_flag)
    setEditCommunity(p.community_id || "")
    setWlError(""); setWlMessage("")
  }

  function cancelWatchlistEdit() {
    setEditingWlId(null)
    setEditFirst(""); setEditLast(""); setEditDob(""); setEditOln(""); setEditSsn("")
    setEditSex(""); setEditRace("")
    setEditReason(""); setEditNotes(""); setEditFirearm(false); setEditCommunity("")
    setWlError("")
  }

  async function saveWatchlistEdit(p: WatchlistEntry) {
    if (!editLast)      { setWlError("Last name is required."); return }
    if (!editCommunity) { setWlError("Location is required.");  return }
    if (!editReason)    { setWlError("Reason is required.");    return }
    setWlError(""); setWlMessage("")
    const { error } = await supabase.from("watchlist").update({
      first_name:    editFirst || null,
      last_name:     editLast,
      dob:           editDob || null,
      oln:           editOln || null,
      ssn:           editSsn || null,
      sex:           editSex || null,
      race:          editRace || null,
      reason:        editReason,
      comments:      editNotes || null,
      community_id:  editCommunity,
      firearm_flag:  editFirearm,
    }).eq("id", p.id)
    if (error) { setWlError("Update failed: " + error.message); return }
    await logActivity("updated", "Watchlist", p.id, `Updated ${editFirst} ${editLast}`)
    setWlMessage(`✅ Updated ${editFirst} ${editLast}`)
    notifyWatchlist(p.id, "updated")
    cancelWatchlistEdit()
    // Sync filter to the (possibly new) location so the user sees the row
    if (editCommunity !== communityId) setCommunityId(editCommunity)
    loadWatchlist(editCommunity)
  }

  // Fire-and-forget email notification for a watchlist entry. event indicates
  // whether this is auto-fired on add/edit or a manual click.
  function notifyWatchlist(id: string | null | undefined, event: "added" | "updated" | "manual") {
    if (!id) return
    fetch("/api/watchlist/notify", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, event }),
    }).catch(e => console.error("[watchlist notify]", e))
  }

  function notifyBolo(id: string | null | undefined) {
    if (!id) return
    fetch("/api/bolos/notify", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id }),
    }).catch(e => console.error("[bolo notify]", e))
  }

  async function deleteWatchlistEntry(p: WatchlistEntry) {
    if (!confirm(`Permanently delete ${p.first_name || ""} ${p.last_name} from the watchlist? This cannot be undone.`)) return
    const { error } = await supabase.from("watchlist").delete().eq("id", p.id)
    if (error) { setWlError("Delete failed: " + error.message); return }
    await logActivity("deleted", "Watchlist", p.id, `Removed ${p.first_name || ""} ${p.last_name}`)
    setWlMessage(`✅ Removed ${p.first_name || ""} ${p.last_name}`)
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

  // ── OFFICER REPORTS ──
  async function loadPastReports() {
    setReportsLoading(true)
    const [{ data: daily }, { data: incidents }, { data: contacts }, { data: vfi }, { data: parking }] = await Promise.all([
      supabase.from("officer_daily_logs").select("*").order("date", { ascending: false }).limit(20),
      supabase.from("incident_reports").select("*").order("date", { ascending: false }).limit(20),
      supabase.from("contact_history").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("vehicle_fi_logs").select("*").order("date", { ascending: false }).limit(20),
      supabase.from("parking_violations").select("*").order("date", { ascending: false }).limit(20),
    ])
    const combined = [
      ...(daily     || []).map(r => ({ ...r, _type: "Daily Log"     })),
      ...(incidents || []).map(r => ({ ...r, _type: "Incident"      })),
      ...(contacts  || []).map(r => ({ ...r, _type: "Field Contact", date: r.contacted_at?.split("T")[0] || r.created_at?.split("T")[0] })),
      ...(vfi       || []).map(r => ({ ...r, _type: "Vehicle FI"    })),
      ...(parking   || []).map(r => ({ ...r, _type: "Parking Violation" })),
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
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
    logActivity("created", "Daily Log", "", `Daily log submitted — ${dailyDate}`)
  }

  // AI narrative assist (item 28) — sends the incident's structured fields + the
  // current description to /api/ai/narrative and replaces the description with the
  // cleaned, professional write-up. Officer reviews/edits before submitting.
  async function callAiNarrative(mode: "draft" | "tighten" | "formal") {
    if (!incDescription.trim()) { setAiError("Add some notes in the description first."); return }
    setAiBusy(mode); setAiError("")
    try {
      const res = await fetch("/api/ai/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          notes: incDescription,
          fields: {
            incident_type: incType,
            location: incLoc.location,
            building: incLoc.building, apartment: incLoc.apartment,
            persons_involved: incPersons, action_taken: incAction,
            date: incDate, time: incTime,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      if (data.text) setIncDescription(data.text)
    } catch (e: any) {
      setAiError(e?.message || "AI assist failed.")
    } finally {
      setAiBusy(null)
    }
  }

  async function saveIncidentReport() {
    if (!incDescription) { setReportError("Incident description is required."); return }
    setReportSaving(true); setReportError(""); setReportMessage("")

    // Upload any attached photos to the contact-photos bucket (multi-image).
    const photoUrls: string[] = []
    for (const f of incPhotoFiles) {
      const ext  = f.name.split(".").pop() || "jpg"
      const path = `inc_${Date.now()}_${photoUrls.length}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from("contact-photos").upload(path, f, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("contact-photos").getPublicUrl(up.path)
        photoUrls.push(publicUrl)
      }
    }

    // De-dup guard (item 25): the same incident can arrive from multiple systems.
    // If a linked ref # already exists on another record, confirm before double-entering.
    const dupOrs: string[] = []
    if (incReliantNo.trim()) dupOrs.push(`reliant_case_no.eq.${incReliantNo.trim()}`)
    if (incHpdNo.trim())     dupOrs.push(`hpd_report_no.eq.${incHpdNo.trim()}`)
    if (incAsgNo.trim())     dupOrs.push(`asg_report_no.eq.${incAsgNo.trim()}`)
    if (dupOrs.length) {
      const { data: dupes } = await supabase.from("incident_reports")
        .select("id").or(dupOrs.join(",")).limit(1)
      if (dupes && dupes.length && !window.confirm(
        "A report with one of these reference numbers already exists. Create this as a separate record anyway?")) {
        setReportSaving(false); return
      }
    }

    // Freeze the HOH/household for the unit as of the incident date (items 26/27).
    const incSnap = incLoc.location_type === "unit"
      ? await buildHohSnapshot(incCommunity, incLoc.unit_number, incDate)
      : EMPTY_SNAPSHOT

    const { error } = await supabase.from("incident_reports").insert({
      date: incDate, time: incTime, community_id: incCommunity,
      location: incLoc.location || null, incident_type: incType,
      location_type: incLoc.location_type,
      building: incLoc.building, apartment: incLoc.apartment, common_area: incLoc.common_area,
      hoh_name: incSnap.hoh_name, hoh_resident_id: incSnap.hoh_resident_id,
      household_snapshot: incSnap.household_snapshot,
      reliant_case_no: incReliantNo || null, hpd_report_no: incHpdNo || null, asg_report_no: incAsgNo || null,
      persons_involved: incPersons, description: incDescription,
      action_taken: incAction, follow_up_required: incFollowUp,
      photo_urls: photoUrls.length ? photoUrls : null,
      officer_name: incOfficer, created_at: new Date().toISOString()
    })
    setReportSaving(false)
    if (error) { setReportError(error.message); return }
    setReportMessage("✅ Incident report submitted.")
    if (isHighPriorityIncident(incType)) {
      const communityName = communities.find(c => c.id === incCommunity)?.name || "Unknown"
      fireAlert({
        type:         "incident_high_priority",
        severity:     "critical",
        community_id: incCommunity || null,
        subject:      `🚨 ${incType.toUpperCase()} — ${communityName}`,
        body:         `A high-priority incident has been reported.\n\n${incDescription}`,
        payload: {
          Community:    communityName,
          Date:         incDate,
          Time:         incTime,
          Location:     incLoc.location || "—",
          Type:         incType,
          Officer:      incOfficer || "—",
          Persons:      incPersons || "—",
          ActionTaken:  incAction || "—",
          FollowUp:     incFollowUp ? "yes" : "no",
        },
      })
    }
    setIncDescription(""); setIncAction(""); setIncPersons(""); setIncLoc(EMPTY_LOCATION); setIncFollowUp(false); setIncPhotoFiles([])
    setIncReliantNo(""); setIncHpdNo(""); setIncAsgNo("")
    logActivity("created", "Incident", "", `Incident report submitted — ${incDate}`)
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
    logActivity("created", "Field Contact", "", `Field contact logged — ${ctFirstName} ${ctLastName}`)
    setCtFirstName(""); setCtLastName(""); setCtLocation(""); setCtReason(""); setCtOfficer(""); setCtNotes("")
    setCtSex(""); setCtRace(""); setCtDob(""); setCtSsn(""); setCtOln(""); setCtAddress("")
    setCtPhotoFile(null); setCtPhotoPreview("")
    setCtDate(new Date().toISOString().split("T")[0]); setCtTime("")
  }

  async function saveVehicleFI() {
    if (!vfiVehicle.plate && !vfiVehicle.make) { setReportError("Plate or Make is required."); return }
    setReportSaving(true); setReportError(""); setReportMessage("")
    let photoUrl: string | null = null
    if (vfiPhotoFile) {
      const ext  = vfiPhotoFile.name.split(".").pop() || "jpg"
      const path = `vfi_${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from("contact-photos").upload(path, vfiPhotoFile, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("contact-photos").getPublicUrl(up.path)
        photoUrl = publicUrl
      }
    }
    // Active-BOLO plate cross-check, snapshotted onto the row (same as parking).
    const hits = await lookupBolosByPlate(vfiVehicle.plate)
    const boloMatch = hits.length > 0

    const vfiSnap = vfiLoc.location_type === "unit"
      ? await buildHohSnapshot(vfiCommunity, vfiLoc.unit_number, vfiDate)
      : EMPTY_SNAPSHOT

    const { error } = await supabase.from("vehicle_fi_logs").insert({
      date: vfiDate, time: vfiTime || null,
      community_id: vfiCommunity || null,
      officer_name: vfiOfficer || null,
      location: vfiLoc.location || null,
      location_type: vfiLoc.location_type,
      building: vfiLoc.building, apartment: vfiLoc.apartment, common_area: vfiLoc.common_area,
      hoh_name: vfiSnap.hoh_name, hoh_resident_id: vfiSnap.hoh_resident_id,
      household_snapshot: vfiSnap.household_snapshot,
      make: vfiVehicle.make || null, model: vfiVehicle.model || null,
      color: vfiVehicle.color || null, year: vfiVehicle.year || null,
      state: vfiVehicle.state || null, plate: vfiVehicle.plate || null,
      descriptors: vfiDescriptors || null,
      reason: vfiReason || null,
      follow_up: vfiFollowUp,
      violation_issued: vfiViolation,
      violation_number: vfiViolation ? (vfiViolationNum || null) : null,
      notes: vfiNotes || null,
      photo_url: photoUrl,
      bolo_match: boloMatch,
      created_at: new Date().toISOString()
    })
    setReportSaving(false)
    if (error) { setReportError(error.message); return }

    // Supervisor alert on a BOLO hit — a flagged vehicle showing up on a field
    // interview is at least as urgent as on a parking ticket.
    if (boloMatch) {
      const communityName = communities.find(c => c.id === vfiCommunity)?.name || "Unknown"
      const plateLabel    = `${vfiVehicle.plate}${vfiVehicle.state ? " (" + vfiVehicle.state + ")" : ""}`
      fireAlert({
        type:         "bolo_vehicle_hit",
        severity:     "critical",
        community_id: vfiCommunity || null,
        subject:      `🚨 BOLO VEHICLE — Vehicle FI — ${plateLabel} @ ${communityName}`,
        body:         `A Vehicle FI was logged on a vehicle matching an active BOLO.\n\nPlate: ${plateLabel}\nBOLO: ${hits.map(h => h.name || h.vehicle).filter(Boolean).join("; ") || "—"}`,
        payload: {
          Community: communityName,
          Date:      vfiDate,
          Time:      vfiTime || "—",
          Plate:     plateLabel,
          Officer:   vfiOfficer || "—",
          BOLO:      "MATCH",
        },
      })
    }

    setReportMessage("✅ Vehicle FI logged." + (boloMatch ? " ⚠ BOLO match — supervisor alerted." : ""))
    logActivity("created", "Vehicle FI", "", `Vehicle FI logged — ${vfiVehicle.plate || vfiVehicle.make} ${vfiDate}`)
    setVfiLoc(EMPTY_LOCATION); setVfiVehicle(EMPTY_VEHICLE); setVfiDescriptors(""); setVfiReason(""); setVfiNotes("")
    setVfiFollowUp(false); setVfiViolation(false); setVfiViolationNum("")
    setVfiPhotoFile(null); setVfiPhotoPreview("")
    setVfiBoloHits([]); setVfiBoloChecked(false); setVfiRegHits([]); setVfiRegChecked(false)
    setVfiDate(new Date().toISOString().split("T")[0]); setVfiTime("")
  }

  // ── BOLO PLATE CROSS-CHECK ──
  // Normalize a plate for comparison: uppercase, alphanumerics only (so
  // "ABC-1234", "abc 1234" and "ABC1234" all compare equal).
  function normPlate(s: string): string {
    return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  }

  // Looks up active BOLOs matching a plate. Primary match is the structured
  // bolos.plate (normalized exact). Legacy BOLOs with no structured plate fall
  // back to a substring match inside the free-text `vehicle` description.
  // Watchlist is person-only (no plate) and so stays out of scope.
  async function lookupBolosByPlate(plate: string): Promise<any[]> {
    const q = normPlate(plate)
    if (!q) return []
    const { data } = await supabase
      .from("bolos")
      .select("id, name, vehicle, reason, plate, plate_state")
      .eq("active", true)
    return (data || []).filter(b =>
      b.plate ? normPlate(b.plate) === q : normPlate(b.vehicle || "").includes(q)
    )
  }

  // Looks up a plate in the Property Hub vehicle registry for a community,
  // returning matching resident/visitor records (normalized plate match).
  async function lookupRegisteredVehicle(communityId: string, plate: string): Promise<any[]> {
    const q = normPlate(plate)
    if (!q || !communityId) return []
    const { data } = await supabase
      .from("registered_vehicles")
      .select("id, kind, plate, plate_state, resident_name, unit, permit_number, sponsor_resident, visitor_pass, valid_from, valid_to")
      .eq("community_id", communityId)
    return (data || []).filter(v => normPlate(v.plate || "") === q)
  }

  // Classifies registry hits into an officer-facing status:
  // authorized resident / authorized (or expired) visitor / unregistered.
  function registryStatus(hits: any[]): { level: "resident" | "visitor" | "expired" | "unknown"; label: string } {
    if (!hits.length) return { level: "unknown", label: "Unregistered — not in the resident/visitor registry." }
    const today = new Date().toISOString().slice(0, 10)
    const resident = hits.find(h => h.kind === "resident")
    if (resident) {
      return { level: "resident", label: `Authorized resident — ${[resident.resident_name, resident.unit && `Unit ${resident.unit}`, resident.permit_number && `Permit ${resident.permit_number}`].filter(Boolean).join(" · ") || "registered"}.` }
    }
    const visitor = hits.find(h => h.kind === "visitor")
    if (visitor) {
      const expired = visitor.valid_to && visitor.valid_to < today
      const detail  = [visitor.sponsor_resident && `sponsor ${visitor.sponsor_resident}`, visitor.visitor_pass && `pass ${visitor.visitor_pass}`, visitor.valid_to && `valid to ${visitor.valid_to}`].filter(Boolean).join(" · ")
      return expired
        ? { level: "expired", label: `Visitor pass EXPIRED — ${detail || "no longer valid"}.` }
        : { level: "visitor",  label: `Authorized visitor — ${detail || "registered"}.` }
    }
    return { level: "unknown", label: "Unregistered — not in the resident/visitor registry." }
  }

  // Per-form blur handlers — run the BOLO and registry checks together and
  // drive each form's banners. Registry lookup is scoped to the form's community.
  async function pvCheckPlate(plate: string): Promise<any[]> {
    // No-plate / not-displayed vehicles have nothing to look up.
    if (!plate.trim() || isNoPlate(plate)) { setPvBoloHits([]); setPvBoloChecked(false); setPvRegHits([]); setPvRegChecked(false); return [] }
    const [hits, reg] = await Promise.all([lookupBolosByPlate(plate), lookupRegisteredVehicle(pvCommunity, plate)])
    setPvBoloHits(hits); setPvBoloChecked(true)
    setPvRegHits(reg);   setPvRegChecked(true)
    return hits
  }
  async function vfiCheckPlate(plate: string): Promise<any[]> {
    if (!plate.trim()) { setVfiBoloHits([]); setVfiBoloChecked(false); setVfiRegHits([]); setVfiRegChecked(false); return [] }
    const [hits, reg] = await Promise.all([lookupBolosByPlate(plate), lookupRegisteredVehicle(vfiCommunity, plate)])
    setVfiBoloHits(hits); setVfiBoloChecked(true)
    setVfiRegHits(reg);   setVfiRegChecked(true)
    return hits
  }

  // Officer-facing registry status banner (authorized resident / visitor /
  // unregistered) shown under the plate fields on the Parking + Vehicle FI forms.
  function registryBanner(checked: boolean, hits: any[], plate: string) {
    if (!checked || !plate.trim() || isNoPlate(plate)) return null
    const s = registryStatus(hits)
    const cls =
      s.level === "resident" ? "bg-green-50 border-green-200 text-green-800" :
      s.level === "visitor"  ? "bg-blue-50  border-blue-200  text-blue-800"  :
      s.level === "expired"  ? "bg-amber-50 border-amber-300 text-amber-900" :
                               "bg-gray-50  border-gray-200  text-gray-600"
    const icon = s.level === "expired" ? "⚠️" : s.level === "unknown" ? "❔" : "✅"
    return (
      <div className={`border px-4 py-2 rounded-lg mb-4 text-sm ${cls}`}>
        {icon} <span className="font-semibold">Registry:</span>{" "}
        {s.level === "expired" && (
          <span className="inline-block align-middle mr-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold tracking-wide">
            EXPIRED
          </span>
        )}
        {s.label}
      </div>
    )
  }

  // ── PARKING VIOLATION ──
  async function saveParkingViolation() {
    if (!pvVehicle.plate.trim()) { setReportError("License plate is required for a parking violation."); return }
    setReportSaving(true); setReportError(""); setReportMessage("")

    let photoUrl: string | null = null
    if (pvPhotoFile) {
      const ext  = pvPhotoFile.name.split(".").pop() || "jpg"
      const path = `pv_${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from("contact-photos").upload(path, pvPhotoFile, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("contact-photos").getPublicUrl(up.path)
        photoUrl = publicUrl
      }
    }

    // Active-BOLO plate cross-check, snapshotted onto the row at submission.
    // Skipped for no-plate / not-displayed vehicles (nothing to match on).
    const hits = isNoPlate(pvVehicle.plate) ? [] : await lookupBolosByPlate(pvVehicle.plate)
    const boloMatch = hits.length > 0

    const pvSnap = pvLoc.location_type === "unit"
      ? await buildHohSnapshot(pvCommunity, pvLoc.unit_number, pvDate)
      : EMPTY_SNAPSHOT

    const { error } = await supabase.from("parking_violations").insert({
      date: pvDate, time: pvTime || null,
      community_id: pvCommunity || null,
      officer_name: pvOfficer || null,
      make: pvVehicle.make || null, model: pvVehicle.model || null,
      color: pvVehicle.color || null, year: pvVehicle.year || null,
      state: pvVehicle.state || null, plate: pvVehicle.plate || null,
      location: pvLoc.location || null, space: pvSpace || null,
      location_type: pvLoc.location_type,
      building: pvLoc.building, apartment: pvLoc.apartment, common_area: pvLoc.common_area,
      hoh_name: pvSnap.hoh_name, hoh_resident_id: pvSnap.hoh_resident_id,
      household_snapshot: pvSnap.household_snapshot,
      violation_type: pvViolationType || null,
      notes: pvNotes || null, photo_url: photoUrl,
      tow_requested: pvTowRequested,
      tow_requested_at: pvTowRequested ? new Date().toISOString() : null,
      tow_requested_by: pvTowRequested ? (pvOfficer || null) : null,
      tow_reason:       pvTowRequested ? (pvTowReason || null) : null,
      bolo_match: boloMatch,
      created_at: new Date().toISOString(),
    })
    setReportSaving(false)
    if (error) { setReportError(error.message); return }

    // Supervisor alert only on a BOLO hit or a tow request — standard
    // violations just log. (Chosen default for item 6.)
    if (boloMatch || pvTowRequested) {
      const communityName = communities.find(c => c.id === pvCommunity)?.name || "Unknown"
      const plateLabel    = `${pvVehicle.plate}${pvVehicle.state ? " (" + pvVehicle.state + ")" : ""}`
      const where         = [pvLoc.location, pvSpace && `Space ${pvSpace}`].filter(Boolean).join(" · ") || "—"
      fireAlert({
        type:         boloMatch ? "parking_bolo_hit" : "parking_tow_requested",
        severity:     boloMatch ? "critical" : "high",
        community_id: pvCommunity || null,
        subject:      `${boloMatch ? "🚨 BOLO VEHICLE — parking violation" : "🚛 Tow requested"} — ${plateLabel} @ ${communityName}`,
        body:         boloMatch
          ? `A parking violation was logged on a vehicle matching an active BOLO.\n\nPlate: ${plateLabel}\nViolation: ${pvViolationType}\nBOLO: ${hits.map(h => h.name || h.vehicle).filter(Boolean).join("; ") || "—"}`
          : `A tow has been requested for a parking violation.\n\nPlate: ${plateLabel}\nViolation: ${pvViolationType}\nReason: ${pvTowReason || "—"}`,
        payload: {
          Community: communityName,
          Date:      pvDate,
          Time:      pvTime || "—",
          Plate:     plateLabel,
          Violation: pvViolationType,
          Location:  where,
          Officer:   pvOfficer || "—",
          Tow:       pvTowRequested ? "yes" : "no",
          BOLO:      boloMatch ? "MATCH" : "no",
        },
      })
    }

    const note = boloMatch
      ? " ⚠ BOLO match — supervisor alerted."
      : pvTowRequested ? " 🚛 Tow requested — supervisor alerted." : ""
    setReportMessage("✅ Parking violation logged." + note)
    logActivity("created", "Parking Violation", "", `Parking violation — ${pvVehicle.plate} (${pvViolationType})`)

    setPvVehicle(EMPTY_VEHICLE); setPvLoc(EMPTY_LOCATION); setPvSpace(""); setPvNotes("")
    setPvViolationType(PARKING_VIOLATION_TYPES[0]); setPvTowRequested(false); setPvTowReason("")
    setPvPhotoFile(null); setPvPhotoPreview(""); setPvBoloHits([]); setPvBoloChecked(false); setPvRegHits([]); setPvRegChecked(false)
    setPvTime("")
  }

  // ── AUDIT ──
  async function logActivity(action: string, resourceType: string, resourceId: string, detail: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from("audit_logs").insert({
      user_email: user?.email || "unknown",
      action, resource_type: resourceType, resource_id: resourceId, detail,
      created_at: new Date().toISOString()
    })
  }

  const REPORT_TABLE: Record<string, string> = {
    "Daily Log":         "officer_daily_logs",
    "Incident":          "incident_reports",
    "Field Contact":     "contact_history",
    "Vehicle FI":        "vehicle_fi_logs",
    "Parking Violation": "parking_violations",
  }

  async function deleteReport(r: any) {
    if (!window.confirm(`Delete this ${r._type} report? This cannot be undone.`)) return
    const table = REPORT_TABLE[r._type]
    if (!table) return
    const { error } = await supabase.from(table).delete().eq("id", r.id)
    if (error) { alert("Delete failed: " + error.message); return }
    await logActivity("deleted", r._type, r.id, `Deleted ${r._type} — ${r.date}`)
    setExpandedReport(null)
    loadPastReports()
  }

  async function saveEditedReport(r: any) {
    const table = REPORT_TABLE[r._type]
    if (!table) return
    const { _type, id, created_at, ...fields } = editFields
    const { error, count } = await supabase.from(table).update(fields).eq("id", r.id).select()
    if (error) { alert("Save failed: " + error.message); return }
    if (count === 0) { alert("Save blocked — check Supabase UPDATE policy for " + table); return }
    await logActivity("edited", r._type, r.id, `Edited ${r._type} — ${r.date}`)
    setEditingReport(null)
    setEditFields({})
    await loadPastReports()
  }

  function exportCSV() {
    const rows = pastReports.map(r => ({
      Type: r._type, Date: r.date, Time: r.time || "",
      Officer: r.officer_name || r.officer || "", Shift: r.shift || "",
      "Incident Type": r.incident_type || "", Location: r.location || "",
      "Building": r.building || "", "Apartment": r.apartment || "", "HOH": r.hoh_name || "",
      "Reliant #": r.reliant_case_no || "", "HPD #": r.hpd_report_no || "", "ASG #": r.asg_report_no || "",
      "Persons Involved": r.persons_involved || "",
      "Subject Name": r.first_name ? `${r.first_name} ${r.last_name}` : "",
      Narrative: r.narrative || r.description || r.notes || "",
      "Action Taken": r.action_taken || "",
      "Follow-Up": (r.follow_up_required || r.follow_up) ? "Yes" : "",
      Weather: r.weather || "",
      "Vehicle Make": r.make || "", "Vehicle Model": r.model || "",
      "Vehicle Color": r.color || "", "Vehicle Year": r.year || "",
      "Plate": displayPlate(r.plate), "Plate State": isNoPlate(r.plate || "") ? "" : (r.state || ""),
      "Violation Issued": r.violation_issued ? "Yes" : "",
      "Violation #": r.violation_number || "",
      "Violation Type": r.violation_type || "",
      "Parking Space": r.space || "",
      "Tow Requested": r.tow_requested ? "Yes" : "",
      "BOLO Match": r.bolo_match ? "Yes" : "",
      Reason: r.reason || "",
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
    // Save as a draft only — sending the email is now a separate, reviewed step
    // so the narrative can be edited before it goes out to the next shift.
    const { error } = await supabase.from("passdown_logs").insert({
      date: pdDate, shift: pdShift,
      community_id: pdCommunity || null,
      officer_name: pdOfficer, notes: pdNotes,
      created_at: new Date().toISOString()
    })
    setPdSaving(false)
    if (error) { setPdError(error.message); return }
    setPdMessage("✅ Saved as a draft — review it below and click Send when ready.")
    logActivity("created", "Passdown", "", `Passdown saved — ${pdDate} ${pdShift}`)
    setPdNotes("")
    loadPassdowns()
  }

  function startEditPassdown(p: any) { setPdEditingId(p.id); setPdEditNotes(p.notes || "") }

  async function saveEditPassdown(p: any) {
    const { error } = await supabase.from("passdown_logs").update({ notes: pdEditNotes }).eq("id", p.id)
    if (error) { alert("Edit failed: " + error.message); return }
    await logActivity("edited", "Passdown", p.id, `Edited passdown — ${p.date} ${p.shift}`)
    setPdEditingId(null); setPdEditNotes(""); loadPassdowns()
  }

  async function sendPassdown(p: any) {
    const msg = p.sent_at
      ? "This passdown was already sent. Send it again to the next-shift recipients?"
      : "Send this passdown to the next-shift recipients now?"
    if (!window.confirm(msg)) return
    setPdSendingId(p.id)
    try {
      const res = await fetch("/api/passdowns/notify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: p.id }),
      })
      if (!res.ok) throw new Error(`notify failed (${res.status})`)
      await supabase.from("passdown_logs").update({ sent_at: new Date().toISOString() }).eq("id", p.id)
      await logActivity("sent", "Passdown", p.id, `Passdown sent — ${p.date} ${p.shift}`)
      loadPassdowns()
    } catch (e: any) {
      alert("Send failed: " + (e?.message || e))
    } finally {
      setPdSendingId(null)
    }
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
    const { data: created, error } = await supabase.from("bolos").insert({
      name: boloName || null, description: boloDesc || null,
      reason: boloReason || null, vehicle: boloVehicle || null,
      plate: boloPlate || null, plate_state: boloPlateState || null,
      dob: boloDob || null, oln: boloOln || null, ssn: boloSsn || null,
      sex: boloSex || null, race: boloRace || null, firearm_flag: boloFirearm,
      community_id: boloCommunity || null, added_by: boloAddedBy || null,
      photo_url: photoUrl, active: true,
      created_at: new Date().toISOString()
    }).select("id").single()
    setBoloSaving(false)
    if (error) { setBoloError(error.message); return }
    setBoloMessage("✅ BOLO added.")
    // Fire-and-forget email notification to active recipients
    if ((created as { id?: string } | null)?.id) {
      fetch("/api/bolos/notify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: (created as { id: string }).id }),
      }).catch(e => console.error("[bolo notify]", e))
    }
    logActivity("created", "BOLO", "", `BOLO added — ${boloName || boloDesc}`)
    setBoloName(""); setBoloDesc(""); setBoloReason(""); setBoloVehicle(""); setBoloPlate(""); setBoloPlateState("")
    setBoloDob(""); setBoloOln(""); setBoloSsn(""); setBoloSex(""); setBoloRace(""); setBoloFirearm(false)
    setBoloPhotoFile(null); setBoloPhotoPreview(""); setShowAddBolo(false)
    loadBolos()
  }

  function startBoloEdit(b: any) {
    setEditingBoloId(b.id)
    setEditBoloName(b.name || "")
    setEditBoloDesc(b.description || "")
    setEditBoloReason(b.reason || "")
    setEditBoloDob(b.dob || "")
    setEditBoloOln(b.oln || "")
    setEditBoloSsn(b.ssn || "")
    setEditBoloSex(b.sex || "")
    setEditBoloRace(b.race || "")
    setEditBoloFirearm(!!b.firearm_flag)
    setEditBoloVehicle(b.vehicle || "")
    setEditBoloPlate(b.plate || "")
    setEditBoloPlateState(b.plate_state || "")
    setEditBoloCommunity(b.community_id || "")
    setEditBoloAddedBy(b.added_by || "")
    setBoloError(""); setBoloMessage("")
  }

  function cancelBoloEdit() {
    setEditingBoloId(null)
    setEditBoloName(""); setEditBoloDesc(""); setEditBoloReason("")
    setEditBoloDob(""); setEditBoloOln(""); setEditBoloSsn(""); setEditBoloSex(""); setEditBoloRace(""); setEditBoloFirearm(false)
    setEditBoloVehicle(""); setEditBoloPlate(""); setEditBoloPlateState(""); setEditBoloCommunity(""); setEditBoloAddedBy("")
    setBoloError("")
  }

  async function saveBoloEdit(b: any) {
    if (!editBoloName && !editBoloDesc) { setBoloError("Name or description is required."); return }
    setSavingBoloEdit(true); setBoloError(""); setBoloMessage("")
    const { error } = await supabase.from("bolos").update({
      name:         editBoloName || null,
      description:  editBoloDesc || null,
      reason:       editBoloReason || null,
      dob:          editBoloDob || null,
      oln:          editBoloOln || null,
      ssn:          editBoloSsn || null,
      sex:          editBoloSex || null,
      race:         editBoloRace || null,
      firearm_flag: editBoloFirearm,
      vehicle:      editBoloVehicle || null,
      plate:        editBoloPlate || null,
      plate_state:  editBoloPlateState || null,
      community_id: editBoloCommunity || null,
      added_by:     editBoloAddedBy || null,
    }).eq("id", b.id)
    setSavingBoloEdit(false)
    if (error) { setBoloError("Update failed: " + error.message); return }
    setBoloMessage(`✅ BOLO updated.`)
    await logActivity("edited", "BOLO", b.id, `Edited BOLO — ${editBoloName || editBoloDesc}`)
    notifyBolo(b.id)
    cancelBoloEdit()
    loadBolos()
  }

  async function resolveBolo(id: string) {
    await supabase.from("bolos").update({ active: false }).eq("id", id)
    logActivity("resolved", "BOLO", id, "BOLO marked resolved")
    loadBolos()
  }

  async function reactivateBolo(id: string) {
    await supabase.from("bolos").update({ active: true }).eq("id", id)
    logActivity("reactivated", "BOLO", id, "BOLO reactivated")
    loadBolos()
  }

  // ── HELPERS ──
  const filteredWatchlist = watchlist.filter(p => {
    if (!watchlistSearch) return true
    const q = watchlistSearch.toLowerCase()
    return p.first_name?.toLowerCase().includes(q) || p.last_name?.toLowerCase().includes(q) ||
           p.oln?.toLowerCase().includes(q) || p.reason?.toLowerCase().includes(q)
  })

  const filteredPassdowns = pdFilterComm
    ? passdowns.filter(p => p.community_id === pdFilterComm)
    : passdowns

  const displayedBolos = boloShowAll ? bolos : bolos.filter(b => b.active)

  // View Reports text search — across type, location/unit, HOH, people, officer, and linked ref #s.
  const displayedReports = (() => {
    const q = rptSearch.trim().toLowerCase()
    if (!q) return pastReports
    return pastReports.filter(r => [
      r._type, r.incident_type, r.violation_type, r.location, r.building, r.apartment,
      r.hoh_name, r.persons_involved, r.first_name, r.last_name, r.officer_name, r.officer,
      r.reliant_case_no, r.hpd_report_no, r.asg_report_no, r.plate, r.notes, r.description, r.narrative,
    ].filter(Boolean).join(" ").toLowerCase().includes(q))
  })()
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
        <button className={tabCls("onduty")}    onClick={() => setActiveTab("onduty")}>🟢 On Duty</button>
        <button className={tabCls("passdown")}  onClick={() => setActiveTab("passdown")}>🔁 Passdown Log</button>
        <button className={tabCls("bolo")}      onClick={() => setActiveTab("bolo")}>
          🔍 BOLO {activeBoloCount > 0 && <span className="ml-1.5 bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5">{activeBoloCount}</span>}
        </button>
        <button className={tabCls("reports")}   onClick={() => setActiveTab("reports")}>📋 Officer Reports</button>
        <button className={tabCls("gatecheck")} onClick={() => setActiveTab("gatecheck")}>🚪 Gate Checklist</button>
        <button className={tabCls("watchlist")} onClick={() => setActiveTab("watchlist")}>🚨 Watchlist</button>
      </div>

      {/* Active-tab descriptor — quick context for the officer */}
      <p className="text-sm text-gray-500 -mt-4 mb-6">{TAB_DESCRIPTIONS[activeTab]}</p>

      {/* ── GATE CHECKLIST TAB ── */}
      {activeTab === "gatecheck" && (
        <GateChecklist communities={communities} officerName={officerName} isAdmin={isAdmin} />
      )}

      {/* ── ON DUTY TAB ── */}
      {activeTab === "onduty" && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="text-sm text-gray-600">
              {officersLoading ? "Loading…" : (
                <>
                  <span className="font-semibold text-gray-900">
                    {officers.filter(o => o.is_online).length}
                  </span> online · {officers.length} total
                </>
              )}
            </div>
            <button
              onClick={loadOfficersOnDuty}
              disabled={officersLoading}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md border-none cursor-pointer disabled:opacity-50"
            >
              {officersLoading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          {officersError && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md">
              {officersError}
            </div>
          )}

          {(() => {
            // Only show currently-online officers. Assignment label comes
            // from /admin/system → Users tab (community name or Admin/Super).
            const labelFor = (o: OfficerOnDuty) =>
              o.role === "admin_super" ? "Admin / Super" :
              o.community               || "Unassigned"

            const online = officers
              .filter(o => o.is_online)
              .sort((a, b) => {
                const la = labelFor(a), lb = labelFor(b)
                // Admin/Super first, Unassigned last, communities A→Z in between
                if (la === "Admin / Super" && lb !== "Admin / Super") return -1
                if (lb === "Admin / Super" && la !== "Admin / Super") return  1
                if (la === "Unassigned"    && lb !== "Unassigned")    return  1
                if (lb === "Unassigned"    && la !== "Unassigned")    return -1
                if (la !== lb) return la.localeCompare(lb)
                return (a.display_name || a.email).localeCompare(b.display_name || b.email)
              })

            if (online.length === 0) {
              return (
                <div className="px-3 py-8 text-center text-sm text-gray-500 bg-gray-50 rounded-md">
                  {officersLoading ? "" : "No officers currently on duty."}
                </div>
              )
            }

            return (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Officer</th>
                      <th className="px-4 py-2 text-left">Location</th>
                      <th className="px-4 py-2 text-left">On Duty</th>
                      <th className="px-4 py-2 text-left">Off Duty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {online.map(o => {
                      const local = (o.email.split("@")[0] || "").toLowerCase()
                      const isSupervisor =
                        o.role === "admin_super" ||
                        SUPERVISOR_SURNAMES.some(s => local.includes(s))
                      const label = labelFor(o)
                      return (
                        <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className={`px-4 py-2 ${isSupervisor ? "font-bold text-gray-900" : "text-gray-800"}`}>
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 align-middle" />
                            {o.display_name || o.email}
                            {isSupervisor && <span className="ml-2 text-xs text-blue-700 font-semibold">SUP</span>}
                          </td>
                          <td className="px-4 py-2">
                            {isAdmin ? (
                              <select
                                value={o.role === "admin_super" ? "__admin_super__" : (o.community_id || "")}
                                onChange={(e) => saveOfficerAssignment(o.id, e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                              >
                                <option value="">— Unassigned —</option>
                                <option value="__admin_super__">Admin / Super</option>
                                {communities.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-gray-700">{label}</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-600 text-xs">
                            {o.on_duty_at
                              ? new Date(o.on_duty_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-2 text-gray-600 text-xs">
                            {o.off_duty_at
                              ? new Date(o.off_duty_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                              : <span className="text-gray-400">— (still on)</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── WATCHLIST TAB ── */}
      {activeTab === "watchlist" && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={communityId}
                onChange={(e) => { setCommunityId(e.target.value); loadWatchlist(e.target.value) }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="">All Locations</option>
                {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="text-sm text-gray-500">{filteredWatchlist.length} persons</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input value={watchlistSearch} onChange={(e) => setWatchlistSearch(e.target.value)}
                placeholder="Search name, OLN, or reason..."
                className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-600" />
              <button onClick={() => {
                  const opening = !showAddWatchlist
                  setShowAddWatchlist(opening)
                  setWlMessage(""); setWlError("")
                  // Reset the form's Location each time the form opens, so the
                  // user is forced to actively pick where the entry should go
                  // (auto-filling it caused entries to land at the wrong site).
                  if (opening) setWlCommunity("")
                }}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div><label className={labelCls}>First Name</label>
                  <input value={wlFirst} onChange={e => setWlFirst(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Last Name <span className="text-red-500">*</span></label>
                  <input value={wlLast} onChange={e => setWlLast(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>DOB</label>
                  <input type="date" value={wlDob} onChange={e => setWlDob(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>OLN (Driver License #)</label>
                  <input value={wlOln} onChange={e => setWlOln(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>SSN</label>
                  <input value={wlSsn} onChange={e => setWlSsn(e.target.value)} placeholder="XXX-XX-XXXX or last 4" maxLength={11} className={inputCls} /></div>
                <div><label className={labelCls}>Sex</label>
                  <select value={wlSex} onChange={e => setWlSex(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select></div>
                <div><label className={labelCls}>Race</label>
                  <select value={wlRace} onChange={e => setWlRace(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    <option>Black</option><option>White</option><option>Hispanic</option>
                    <option>Asian</option><option>Native American</option><option>Other</option>
                  </select></div>
                <div><label className={labelCls}>Location <span className="text-red-500">*</span></label>
                  <select value={wlCommunity} onChange={e => setWlCommunity(e.target.value)} className={inputCls}>
                    <option value="">— Select —</option>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className={labelCls}>Reason / Ban Type <span className="text-red-500">*</span></label>
                  <input value={wlReason} onChange={e => setWlReason(e.target.value)} placeholder="e.g. Trespassing, Theft" className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Notes</label>
                  <input value={wlNotes} onChange={e => setWlNotes(e.target.value)} placeholder="Additional details..." className={inputCls} /></div>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="wlFirearm" checked={wlFirearm} onChange={e => setWlFirearm(e.target.checked)} className="w-4 h-4 accent-red-700" />
                  <label htmlFor="wlFirearm" className="text-sm font-medium text-gray-700">🔫 Firearm flag — known to carry</label>
                </div>

                {/* PHOTO */}
                <div className="sm:col-span-2">
                  <label className={labelCls}>Subject Photo</label>
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-28 bg-gray-200 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-300">
                      {wlPhotoPreview
                        ? <img src={wlPhotoPreview} alt="preview" className="w-full h-full object-cover" />
                        : <span className="text-gray-400 text-xs text-center px-1">No photo</span>}
                    </div>
                    <div className="flex-1 pt-1">
                      <input type="file" accept="image/*"
                        onChange={e => {
                          const file = e.target.files?.[0] || null
                          setWlPhotoFile(file)
                          setWlPhotoPreview(file ? URL.createObjectURL(file) : "")
                        }}
                        className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-red-700 file:text-white hover:file:bg-red-800 cursor-pointer" />
                      <p className="text-xs text-gray-400 mt-1">JPG, PNG accepted</p>
                    </div>
                  </div>
                </div>

                {/* BAN SHEET — file or photo (images or PDF, multi-page allowed) */}
                <div className="sm:col-span-2">
                  <label className={labelCls}>Ban Sheet — file or photo</label>
                  <input type="file" accept="image/*,application/pdf" multiple
                    onChange={e => setWlBanFiles(Array.from(e.target.files || []))}
                    className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-red-700 file:text-white hover:file:bg-red-800 cursor-pointer" />
                  <p className="text-xs text-gray-400 mt-1">Images or PDF. Multiple files allowed (e.g. multi-page ban sheets).</p>
                  {wlBanFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {wlBanFiles.map((f, i) => (
                        <div key={i} className="w-20 h-24 bg-gray-100 rounded-lg overflow-hidden flex flex-col items-center justify-center flex-shrink-0 border border-gray-300 p-1">
                          {f.type.startsWith("image/")
                            ? <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover rounded" />
                            : <><span className="text-2xl">📄</span><span className="text-[9px] text-gray-500 text-center leading-tight mt-1 break-all line-clamp-2">{f.name}</span></>}
                        </div>
                      ))}
                    </div>
                  )}
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
              {editingWlId === p.id ? (
                /* INLINE EDIT FORM */
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div><label className={labelCls}>First Name</label>
                      <input value={editFirst} onChange={e => setEditFirst(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>Last Name <span className="text-red-500">*</span></label>
                      <input value={editLast} onChange={e => setEditLast(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>DOB</label>
                      <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>OLN (Driver License #)</label>
                      <input value={editOln} onChange={e => setEditOln(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>SSN</label>
                      <input value={editSsn} onChange={e => setEditSsn(e.target.value)} placeholder="XXX-XX-XXXX or last 4" maxLength={11} className={inputCls} /></div>
                    <div><label className={labelCls}>Sex</label>
                      <select value={editSex} onChange={e => setEditSex(e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        <option>Male</option><option>Female</option><option>Other</option>
                      </select></div>
                    <div><label className={labelCls}>Race</label>
                      <select value={editRace} onChange={e => setEditRace(e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        <option>Black</option><option>White</option><option>Hispanic</option>
                        <option>Asian</option><option>Native American</option><option>Other</option>
                      </select></div>
                    <div><label className={labelCls}>Location <span className="text-red-500">*</span></label>
                      <select value={editCommunity} onChange={e => setEditCommunity(e.target.value)} className={inputCls}>
                        <option value="">— Select —</option>
                        {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></div>
                    <div><label className={labelCls}>Reason / Ban Type <span className="text-red-500">*</span></label>
                      <input value={editReason} onChange={e => setEditReason(e.target.value)} className={inputCls} /></div>
                    <div className="sm:col-span-2"><label className={labelCls}>Notes</label>
                      <input value={editNotes} onChange={e => setEditNotes(e.target.value)} className={inputCls} /></div>
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <input type="checkbox" id={`editFirearm-${p.id}`} checked={editFirearm} onChange={e => setEditFirearm(e.target.checked)} className="w-4 h-4 accent-red-700" />
                      <label htmlFor={`editFirearm-${p.id}`} className="text-sm font-medium text-gray-700">🔫 Firearm flag — known to carry</label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveWatchlistEdit(p)} className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer">💾 Save</button>
                    <button onClick={cancelWatchlistEdit} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold rounded-md border-none cursor-pointer">Cancel</button>
                  </div>
                </div>
              ) : (
                /* DISPLAY ROW */
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    {p.photo_url && (
                      <SignedImage src={p.photo_url} bucket="photos" alt="" className="w-16 h-20 object-cover rounded-lg flex-shrink-0 border border-red-200" />
                    )}
                    <div>
                      <div className="font-bold text-gray-900">
                        {p.last_name}, {p.first_name}
                      </div>
                      <div className="text-sm text-red-600 font-medium mt-0.5">🚨 {p.reason || "No reason listed"}</div>
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                        {p.dob  && <span>DOB: {p.dob}</span>}
                        {p.oln  && <span>OLN: {p.oln}</span>}
                        {p.ssn  && <span>SSN: {maskSSN(p.ssn)}</span>}
                        {p.sex  && <span>Sex: {p.sex}</span>}
                        {p.race && <span>Race: {p.race}</span>}
                      </div>
                      {(p.notes || p.comments) && <div className="text-xs text-gray-400 mt-1">Notes: {p.notes || p.comments}</div>}
                      {Array.isArray(p.ban_sheet_urls) && p.ban_sheet_urls.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="text-xs text-gray-500 font-medium">Ban sheet:</span>
                          {p.ban_sheet_urls.map((url: string, i: number) => {
                            const isImg = /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url)
                            return isImg ? (
                              <SignedLink key={i} href={url} bucket="photos" title={`Ban sheet ${i + 1}`}>
                                <SignedImage src={url} bucket="photos" alt={`Ban sheet ${i + 1}`} className="w-10 h-12 object-cover rounded border border-gray-300 hover:border-red-400" />
                              </SignedLink>
                            ) : (
                              <SignedLink key={i} href={url} bucket="photos" className="text-xs text-blue-600 hover:underline">
                                📄 Page {i + 1}
                              </SignedLink>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                    <div className="text-right text-xs text-gray-400">
                      {(p.ban_date || p.banned_date) && <div>Banned: {p.ban_date || p.banned_date}</div>}
                      {p.banned_by && <div>By: {p.banned_by}</div>}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1.5 mt-1">
                        <button onClick={() => startWatchlistEdit(p)} title="Edit" className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded border-none cursor-pointer">✎ Edit</button>
                        <button onClick={() => { notifyWatchlist(p.id, "manual"); setWlMessage(`📧 Email notification sent for ${p.first_name || ""} ${p.last_name}`); setTimeout(() => setWlMessage(""), 2500) }} title="Re-send email notification to recipients" className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded border-none cursor-pointer">📧 Notify</button>
                        <button onClick={() => deleteWatchlistEntry(p)} title="Delete" className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded border-none cursor-pointer">🗑</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── OFFICER REPORTS TAB ── */}
      {activeTab === "reports" && (
        <div>
          <div className="flex gap-2 mb-6 flex-wrap">
            <button className={rTabCls("daily")}    onClick={() => setReportTab("daily")}>📝 Daily Log</button>
            <button className={rTabCls("incident")} onClick={() => setReportTab("incident")}>🚨 Incident Report</button>
            <button className={rTabCls("contact")}  onClick={() => setReportTab("contact")}>📋 Field Contact</button>
            <button className={rTabCls("vfi")}      onClick={() => setReportTab("vfi")}>🚗 Vehicle FI</button>
            <button className={rTabCls("parking")}  onClick={() => setReportTab("parking")}>🅿️ Parking Violation</button>
            <button className={rTabCls("view")}     onClick={() => { setReportTab("view"); loadPastReports() }}>📂 View Reports</button>
          </div>

          {reportError   && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{reportError}</div>}
          {reportMessage && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{reportMessage}</div>}

          {/* DAILY LOG */}
          {reportTab === "daily" && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Daily Officer Log</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>Date</label>
                  <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Shift</label>
                  <select value={dailyShift} onChange={e => setDailyShift(e.target.value)} className={inputCls}>
                    <option>Day</option><option>Evening</option><option>Night</option><option>Overnight</option>
                  </select></div>
                <div><label className={labelCls}>Officer Name</label>
                  <input value={dailyOfficer} onChange={e => setDailyOfficer(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Location</label>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>Date</label>
                  <input type="date" value={incDate} onChange={e => setIncDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Time</label>
                  <input type="time" value={incTime} onChange={e => setIncTime(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Officer Name</label>
                  <input value={incOfficer} onChange={e => setIncOfficer(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Location</label>
                  <select value={incCommunity} onChange={e => { setIncCommunity(e.target.value); setIncLoc(EMPTY_LOCATION) }} className={inputCls}>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className={labelCls}>Location / Unit</label>
                  <LocationField communityId={incCommunity} value={incLoc} onChange={setIncLoc} inputCls={inputCls} /></div>
                <div><label className={labelCls}>Incident Type</label>
                  <select value={incType} onChange={e => setIncType(e.target.value)} className={inputCls}>
                    <option>Disturbance</option><option>Trespassing</option><option>Theft</option>
                    <option>Property Damage</option><option>Medical Emergency</option>
                    <option>Suspicious Activity</option><option>Domestic</option>
                    <option>Noise Complaint</option><option>Vehicle Incident</option>
                    <option>Shooting</option><option>Firearm Violation</option>
                    <option>Loitering</option><option>Fire</option>
                    <option>Other</option>
                  </select></div>
              </div>
              <div className="mb-4">
                <label className={labelCls}>Persons Involved</label>
                <input value={incPersons} onChange={e => setIncPersons(e.target.value)}
                  placeholder="Names, descriptions of involved parties" className={inputCls} />
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <label className={labelCls + " mb-0"}>Incident Description <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => callAiNarrative("draft")} disabled={!!aiBusy}
                      title="Turn your notes into a full narrative"
                      className="px-2.5 py-1 bg-violet-700 text-white text-xs font-semibold rounded-md hover:bg-violet-800 border-none cursor-pointer disabled:opacity-50">
                      {aiBusy === "draft" ? "✨ Writing…" : "✨ AI Draft"}
                    </button>
                    <button type="button" onClick={() => callAiNarrative("tighten")} disabled={!!aiBusy}
                      className="px-2.5 py-1 bg-violet-100 text-violet-800 text-xs font-semibold rounded-md hover:bg-violet-200 border-none cursor-pointer disabled:opacity-50">
                      {aiBusy === "tighten" ? "…" : "Tighten"}
                    </button>
                    <button type="button" onClick={() => callAiNarrative("formal")} disabled={!!aiBusy}
                      className="px-2.5 py-1 bg-violet-100 text-violet-800 text-xs font-semibold rounded-md hover:bg-violet-200 border-none cursor-pointer disabled:opacity-50">
                      {aiBusy === "formal" ? "…" : "More formal"}
                    </button>
                  </div>
                </div>
                <textarea rows={5} value={incDescription} onChange={e => setIncDescription(e.target.value)}
                  placeholder="Jot down rough notes, then ✨ AI Draft to expand them into a full narrative — or write it yourself." className={textareaCls} />
                {aiError && <div className="text-xs text-red-600 mt-1">{aiError}</div>}
                <p className="text-[11px] text-gray-400 mt-1">AI assist is a drafting aid — review and edit before submitting. You are responsible for the final report.</p>
              </div>
              <div className="mb-4">
                <label className={labelCls}>Action Taken</label>
                <textarea rows={3} value={incAction} onChange={e => setIncAction(e.target.value)}
                  placeholder="Steps taken to resolve the incident..." className={textareaCls} />
              </div>
              <div className="mb-4">
                <label className={labelCls}>Photos</label>
                <input type="file" accept="image/*" multiple
                  onChange={e => setIncPhotoFiles(Array.from(e.target.files || []))}
                  className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-red-700 file:text-white hover:file:bg-red-800 cursor-pointer" />
                <p className="text-xs text-gray-400 mt-1">JPG, PNG. Multiple photos allowed.</p>
                {incPhotoFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {incPhotoFiles.map((f, i) => (
                      <div key={i} className="w-20 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-300">
                        <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label className={labelCls}>Linked Reference #s <span className="text-gray-400 font-normal">(optional — ties this record across systems)</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input value={incReliantNo} onChange={e => setIncReliantNo(e.target.value)} placeholder="Reliant case #" className={inputCls} />
                  <input value={incHpdNo} onChange={e => setIncHpdNo(e.target.value)} placeholder="HPD report #" className={inputCls} />
                  <input value={incAsgNo} onChange={e => setIncAsgNo(e.target.value)} placeholder="ASG report #" className={inputCls} />
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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
                <div><label className={labelCls}>Location</label>
                  <select value={ctCommunity} onChange={e => setCtCommunity(e.target.value)} className={inputCls}>
                    <option value="">— Select —</option>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="sm:col-span-2"><label className={labelCls}>Address</label>
                  <input value={ctAddress} onChange={e => setCtAddress(e.target.value)} placeholder="Street address" className={inputCls} /></div>
                <div><label className={labelCls}>Location</label>
                  <input value={ctLocation} onChange={e => setCtLocation(e.target.value)} placeholder="e.g. Building 3, Parking Lot" className={inputCls} /></div>
                <div><label className={labelCls}>Reason / Type</label>
                  <input value={ctReason} onChange={e => setCtReason(e.target.value)} placeholder="e.g. Trespassing, Suspicious Activity" className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Officer Name</label>
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

          {/* VEHICLE FI */}
          {reportTab === "vfi" && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Vehicle Field Investigation</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>Date</label>
                  <input type="date" value={vfiDate} onChange={e => setVfiDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Time</label>
                  <input type="time" value={vfiTime} onChange={e => setVfiTime(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Officer Name</label>
                  <input value={vfiOfficer} onChange={e => setVfiOfficer(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Location</label>
                  <select value={vfiCommunity} onChange={e => { setVfiCommunity(e.target.value); setVfiLoc(EMPTY_LOCATION) }} className={inputCls}>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div className="sm:col-span-2"><label className={labelCls}>Location / Unit</label>
                  <LocationField communityId={vfiCommunity} value={vfiLoc} onChange={setVfiLoc} inputCls={inputCls} /></div>
                <VehicleFields
                  value={vfiVehicle}
                  onChange={p => setVfiVehicle(v => ({ ...v, ...p }))}
                  inputCls={inputCls}
                  labelCls={labelCls}
                  requireMake
                  requirePlate
                  onPlateBlur={plate => vfiCheckPlate(plate)}
                />
                <div className="sm:col-span-2"><label className={labelCls}>Other Descriptors</label>
                  <input value={vfiDescriptors} onChange={e => setVfiDescriptors(e.target.value)}
                    placeholder="e.g. Tinted windows, dents, stickers, body type" className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Reason for VFI</label>
                  <input value={vfiReason} onChange={e => setVfiReason(e.target.value)}
                    placeholder="e.g. Suspicious activity, no parking permit, loitering" className={inputCls} /></div>
              </div>

              {/* BOLO cross-check banner */}
              {vfiBoloChecked && vfiBoloHits.length > 0 && (
                <div className="bg-red-50 border-2 border-red-300 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm">
                  <div className="font-bold mb-1">🚨 BOLO MATCH — plate {vfiVehicle.plate} matches {vfiBoloHits.length} active BOLO{vfiBoloHits.length > 1 ? "s" : ""}:</div>
                  <ul className="list-disc ml-5">
                    {vfiBoloHits.map(h => (
                      <li key={h.id}>{[h.name, h.vehicle, h.reason].filter(Boolean).join(" — ")}</li>
                    ))}
                  </ul>
                  <div className="mt-1 text-xs">Submitting will alert a supervisor.</div>
                </div>
              )}
              {vfiBoloChecked && vfiBoloHits.length === 0 && vfiVehicle.plate.trim() && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg mb-4 text-xs">
                  ✓ No active BOLO match for {vfiVehicle.plate}.
                </div>
              )}
              {registryBanner(vfiRegChecked, vfiRegHits, vfiVehicle.plate)}
              <div className="mb-4">
                <label className={labelCls}>Notes</label>
                <textarea rows={4} value={vfiNotes} onChange={e => setVfiNotes(e.target.value)}
                  placeholder="Details of the vehicle investigation — outcome, occupants, follow-up..."
                  className={textareaCls} />
              </div>
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="vfiFollowUp" checked={vfiFollowUp} onChange={e => setVfiFollowUp(e.target.checked)} className="w-4 h-4 accent-blue-700" />
                  <label htmlFor="vfiFollowUp" className="text-sm font-medium text-gray-700">Follow-up required</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="vfiViolation" checked={vfiViolation} onChange={e => setVfiViolation(e.target.checked)} className="w-4 h-4 accent-orange-600" />
                  <label htmlFor="vfiViolation" className="text-sm font-medium text-gray-700">Violation Notice Issued</label>
                </div>
                {vfiViolation && (
                  <div className="ml-6 max-w-xs">
                    <label className={labelCls}>Violation #</label>
                    <input value={vfiViolationNum} onChange={e => setVfiViolationNum(e.target.value)}
                      placeholder="Citation / notice number" className={inputCls} />
                  </div>
                )}
              </div>
              <div className="mb-5">
                <label className={labelCls}>Vehicle Photo</label>
                <div className="flex items-start gap-4">
                  <div className="w-36 h-28 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-300">
                    {vfiPhotoPreview
                      ? <img src={vfiPhotoPreview} alt="preview" className="w-full h-full object-cover" />
                      : <span className="text-gray-400 text-xs text-center px-2">No photo</span>}
                  </div>
                  <div className="flex-1 pt-1">
                    <input type="file" accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0] || null
                        setVfiPhotoFile(file)
                        setVfiPhotoPreview(file ? URL.createObjectURL(file) : "")
                      }}
                      className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 cursor-pointer" />
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG accepted</p>
                  </div>
                </div>
              </div>
              <button onClick={saveVehicleFI} disabled={reportSaving}
                className="px-6 py-3 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
                {reportSaving ? "Saving..." : "Log Vehicle FI"}
              </button>
            </div>
          )}

          {/* PARKING VIOLATION */}
          {reportTab === "parking" && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Parking Violation</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>Date</label>
                  <input type="date" value={pvDate} onChange={e => setPvDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Time</label>
                  <input type="time" value={pvTime} onChange={e => setPvTime(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Officer Name</label>
                  <input value={pvOfficer} onChange={e => setPvOfficer(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Community</label>
                  <select value={pvCommunity} onChange={e => { setPvCommunity(e.target.value); setPvLoc(EMPTY_LOCATION) }} className={inputCls}>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className={labelCls}>Lot / Area / Unit</label>
                  <LocationField communityId={pvCommunity} value={pvLoc} onChange={setPvLoc} inputCls={inputCls} /></div>
                <div><label className={labelCls}>Space / Spot #</label>
                  <input value={pvSpace} onChange={e => setPvSpace(e.target.value)} placeholder="e.g. 14, A-7, Fire Lane" className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Violation Type</label>
                  <select value={pvViolationType} onChange={e => setPvViolationType(e.target.value)} className={inputCls}>
                    {PARKING_VIOLATION_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select></div>
                {/* Shared vehicle fields */}
                <VehicleFields
                  value={pvVehicle}
                  onChange={p => setPvVehicle(v => ({ ...v, ...p }))}
                  inputCls={inputCls}
                  labelCls={labelCls}
                  requirePlate
                  allowNoPlate
                  onPlateBlur={plate => pvCheckPlate(plate)}
                />
              </div>

              {/* BOLO cross-check banner */}
              {pvBoloChecked && pvBoloHits.length > 0 && !isNoPlate(pvVehicle.plate) && (
                <div className="bg-red-50 border-2 border-red-300 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm">
                  <div className="font-bold mb-1">🚨 BOLO MATCH — plate {pvVehicle.plate} matches {pvBoloHits.length} active BOLO{pvBoloHits.length > 1 ? "s" : ""}:</div>
                  <ul className="list-disc ml-5">
                    {pvBoloHits.map(h => (
                      <li key={h.id}>{[h.name, h.vehicle, h.reason].filter(Boolean).join(" — ")}</li>
                    ))}
                  </ul>
                  <div className="mt-1 text-xs">Submitting will alert a supervisor.</div>
                </div>
              )}
              {pvBoloChecked && pvBoloHits.length === 0 && pvVehicle.plate.trim() && !isNoPlate(pvVehicle.plate) && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg mb-4 text-xs">
                  ✓ No active BOLO match for {pvVehicle.plate}.
                </div>
              )}
              {registryBanner(pvRegChecked, pvRegHits, pvVehicle.plate)}

              <div className="mb-4">
                <label className={labelCls}>Notes</label>
                <textarea rows={4} value={pvNotes} onChange={e => setPvNotes(e.target.value)}
                  placeholder="Details — repeat offender, prior warnings, condition of vehicle..."
                  className={textareaCls} />
              </div>

              {/* Tow workflow: manual flag + dispatch log. Per-location auto-rules
                  and tow-company notification arrive with the location model (#5). */}
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="pvTow" checked={pvTowRequested} onChange={e => setPvTowRequested(e.target.checked)} className="w-4 h-4 accent-red-700" />
                  <label htmlFor="pvTow" className="text-sm font-medium text-gray-700">Request tow</label>
                </div>
                {pvTowRequested && (
                  <div className="ml-6 max-w-md">
                    <label className={labelCls}>Tow Reason</label>
                    <input value={pvTowReason} onChange={e => setPvTowReason(e.target.value)}
                      placeholder="e.g. Fire lane, repeat offense, blocking access" className={inputCls} />
                    <p className="text-xs text-gray-400 mt-1">Logs the dispatch and alerts a supervisor. Automatic tow-company routing comes with per-location tow rules.</p>
                  </div>
                )}
              </div>

              <div className="mb-5">
                <label className={labelCls}>Vehicle / Violation Photo</label>
                <div className="flex items-start gap-4">
                  <div className="w-36 h-28 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-300">
                    {pvPhotoPreview
                      ? <img src={pvPhotoPreview} alt="preview" className="w-full h-full object-cover" />
                      : <span className="text-gray-400 text-xs text-center px-2">No photo</span>}
                  </div>
                  <div className="flex-1 pt-1">
                    <input type="file" accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0] || null
                        setPvPhotoFile(file)
                        setPvPhotoPreview(file ? URL.createObjectURL(file) : "")
                      }}
                      className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 cursor-pointer" />
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG accepted</p>
                  </div>
                </div>
              </div>
              <button onClick={saveParkingViolation} disabled={reportSaving}
                className="px-6 py-3 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
                {reportSaving ? "Submitting..." : "Submit Parking Violation"}
              </button>
            </div>
          )}

          {/* VIEW REPORTS */}
          {reportTab === "view" && (
            <div>
              {pastReports.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5 items-center">
                  <button onClick={exportCSV}
                    className="px-4 py-2 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer">
                    ⬇ Export CSV
                  </button>
                  <button onClick={() => window.print()}
                    className="px-4 py-2 bg-gray-700 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 border-none cursor-pointer">
                    🖨 Print / PDF
                  </button>
                  <input value={rptSearch} onChange={e => setRptSearch(e.target.value)}
                    placeholder="Search type, unit, HOH, name, Reliant/HPD/ASG #…"
                    className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
                </div>
              )}
              {reportsLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading reports...</div>}
              {!reportsLoading && pastReports.length === 0 && <div className="text-gray-500 text-sm py-8 text-center">No reports submitted yet.</div>}
              {!reportsLoading && pastReports.length > 0 && displayedReports.length === 0 && <div className="text-gray-500 text-sm py-8 text-center">No reports match “{rptSearch}”.</div>}
              {!reportsLoading && displayedReports.map((r, i) => {
                const badgeCls =
                  r._type === "Incident"          ? "bg-red-100 text-red-700" :
                  r._type === "Field Contact"     ? "bg-purple-100 text-purple-700" :
                  r._type === "Vehicle FI"        ? "bg-orange-100 text-orange-700" :
                  r._type === "Parking Violation" ? "bg-amber-100 text-amber-800" :
                                                    "bg-blue-100 text-blue-700"
                const rowBg =
                  r._type === "Incident"          ? "bg-red-50 hover:bg-red-100" :
                  r._type === "Field Contact"     ? "bg-purple-50 hover:bg-purple-100" :
                  r._type === "Vehicle FI"        ? "bg-orange-50 hover:bg-orange-100" :
                  r._type === "Parking Violation" ? "bg-amber-50 hover:bg-amber-100" :
                                                    "bg-white hover:bg-gray-50"
                const borderCls =
                  r._type === "Incident"          ? "border-red-200" :
                  r._type === "Field Contact"     ? "border-purple-200" :
                  r._type === "Vehicle FI"        ? "border-orange-200" :
                  r._type === "Parking Violation" ? "border-amber-200" :
                                                    "border-gray-200"
                const badge =
                  r._type === "Incident"          ? "🚨 Incident" :
                  r._type === "Field Contact"     ? "👤 Field Contact" :
                  r._type === "Vehicle FI"        ? "🚗 Vehicle FI" :
                  r._type === "Parking Violation" ? "🅿️ Parking" :
                                                    "📝 Daily Log"
                const summary =
                  r._type === "Field Contact"     ? `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.reason || "No name" :
                  r._type === "Vehicle FI"        ? [r.year, r.color, r.make, r.model, r.plate ? `· ${displayPlate(r.plate)}` : ""].filter(Boolean).join(" ") || r.reason || "No vehicle" :
                  r._type === "Parking Violation" ? [r.violation_type, r.plate ? `· ${displayPlate(r.plate)}` : ""].filter(Boolean).join(" ") || "Parking violation" :
                  (r.narrative || r.description || r.notes || "No description").slice(0, 80)
                const followUp = r.follow_up_required || r.follow_up
                return (
                <div key={i} className={`border rounded-xl mb-3 overflow-hidden ${borderCls}`}>
                  <div
                    className={`px-5 py-4 flex justify-between items-center cursor-pointer ${rowBg}`}
                    onClick={() => setExpandedReport(expandedReport === i ? null : i)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeCls}`}>{badge}</span>
                      {r.incident_type && <span className="text-xs text-gray-500 shrink-0">{r.incident_type}</span>}
                      {r.shift         && <span className="text-xs text-gray-500 shrink-0">{r.shift} Shift</span>}
                      <span className="text-sm font-semibold text-gray-800 truncate">{summary}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-3">
                      <div className="text-right text-xs text-gray-400">
                        <div>{r.date}{r.time ? " · " + r.time : ""}</div>
                        <div>{r.officer_name || r.officer}</div>
                        {followUp && <div className="text-orange-500 font-semibold">⚠ Follow-up</div>}
                      </div>
                      <span className="text-gray-400 text-sm">{expandedReport === i ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {expandedReport === i && (
                    <div className="px-5 py-4 border-t border-gray-100 bg-white">

                      {/* Admin action buttons */}
                      <div className="flex gap-2 mb-4">
                        {editingReport === i ? (
                          <>
                            <button onClick={() => saveEditedReport(r)}
                              className="px-4 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer">
                              💾 Save Changes
                            </button>
                            <button onClick={() => { setEditingReport(null); setEditFields({}) }}
                              className="px-4 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 border-none cursor-pointer">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingReport(i); setEditFields({ ...r }) }}
                              className="px-4 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 border-none cursor-pointer">
                              ✏️ Edit
                            </button>
                            <button onClick={() => deleteReport(r)}
                              className="px-4 py-1.5 bg-red-700 text-white text-xs font-semibold rounded-lg hover:bg-red-800 border-none cursor-pointer">
                              🗑 Delete
                            </button>
                            {isAdmin && r._type === "Incident" && (
                              <button onClick={() => setViolationForId(violationForId === r.id ? null : r.id)}
                                className="px-4 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 border-none cursor-pointer">
                                ⚖️ {r.lvl_issued ? "Edit Violation" : "Issue Violation"}
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {violationForId === r.id && (
                        <div className="mb-4 border border-amber-300 bg-amber-50 rounded-lg p-4">
                          <LeaseViolationForm
                            communities={communities}
                            defaultCommunityId={r.community_id || communityId}
                            existingRecord={{ id: r.id, community_id: r.community_id, building: r.building, apartment: r.apartment, hoh_name: r.hoh_name, location: r.location }}
                            isAdmin={isAdmin}
                            onSaved={() => { setViolationForId(null); loadPastReports() }}
                          />
                        </div>
                      )}

                      {editingReport === i ? (
                        /* ── EDIT MODE ── */
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><label className={labelCls}>Date</label>
                            <input type="date" value={editFields.date || ""} onChange={e => setEditFields(f => ({ ...f, date: e.target.value }))} className={inputCls} /></div>
                          {("time" in r) && <div><label className={labelCls}>Time</label>
                            <input type="time" value={editFields.time || ""} onChange={e => setEditFields(f => ({ ...f, time: e.target.value }))} className={inputCls} /></div>}
                          <div><label className={labelCls}>Officer</label>
                            <input value={editFields.officer_name || editFields.officer || ""} onChange={e => setEditFields(f => ({ ...f, [r.officer_name !== undefined ? "officer_name" : "officer"]: e.target.value }))} className={inputCls} /></div>
                          {r.shift !== undefined && <div><label className={labelCls}>Shift</label>
                            <select value={editFields.shift || ""} onChange={e => setEditFields(f => ({ ...f, shift: e.target.value }))} className={inputCls}>
                              <option>Day</option><option>Evening</option><option>Night</option><option>Overnight</option>
                            </select></div>}
                          {r.location !== undefined && <div><label className={labelCls}>Location</label>
                            <input value={editFields.location || ""} onChange={e => setEditFields(f => ({ ...f, location: e.target.value }))} className={inputCls} /></div>}
                          {r.weather !== undefined && <div><label className={labelCls}>Weather</label>
                            <input value={editFields.weather || ""} onChange={e => setEditFields(f => ({ ...f, weather: e.target.value }))} className={inputCls} /></div>}
                          {r.incident_type !== undefined && <div><label className={labelCls}>Incident Type</label>
                            <input value={editFields.incident_type || ""} onChange={e => setEditFields(f => ({ ...f, incident_type: e.target.value }))} className={inputCls} /></div>}
                          {r.persons_involved !== undefined && <div className="sm:col-span-2"><label className={labelCls}>Persons Involved</label>
                            <input value={editFields.persons_involved || ""} onChange={e => setEditFields(f => ({ ...f, persons_involved: e.target.value }))} className={inputCls} /></div>}
                          {r.reliant_case_no !== undefined && <div><label className={labelCls}>Reliant case #</label>
                            <input value={editFields.reliant_case_no || ""} onChange={e => setEditFields(f => ({ ...f, reliant_case_no: e.target.value }))} className={inputCls} /></div>}
                          {r.hpd_report_no !== undefined && <div><label className={labelCls}>HPD report #</label>
                            <input value={editFields.hpd_report_no || ""} onChange={e => setEditFields(f => ({ ...f, hpd_report_no: e.target.value }))} className={inputCls} /></div>}
                          {r.asg_report_no !== undefined && <div><label className={labelCls}>ASG report #</label>
                            <input value={editFields.asg_report_no || ""} onChange={e => setEditFields(f => ({ ...f, asg_report_no: e.target.value }))} className={inputCls} /></div>}
                          {r.reason !== undefined && <div className="sm:col-span-2"><label className={labelCls}>Reason</label>
                            <input value={editFields.reason || ""} onChange={e => setEditFields(f => ({ ...f, reason: e.target.value }))} className={inputCls} /></div>}
                          {/* Vehicle FI edit fields */}
                          {r.make  !== undefined && <div><label className={labelCls}>Make</label><input value={editFields.make || ""} onChange={e => setEditFields(f => ({ ...f, make: e.target.value }))} className={inputCls} /></div>}
                          {r.model !== undefined && <div><label className={labelCls}>Model</label><input value={editFields.model || ""} onChange={e => setEditFields(f => ({ ...f, model: e.target.value }))} className={inputCls} /></div>}
                          {r.color !== undefined && <div><label className={labelCls}>Color</label><input value={editFields.color || ""} onChange={e => setEditFields(f => ({ ...f, color: e.target.value }))} className={inputCls} /></div>}
                          {r.year  !== undefined && <div><label className={labelCls}>Year</label><input value={editFields.year || ""} onChange={e => setEditFields(f => ({ ...f, year: e.target.value }))} className={inputCls} /></div>}
                          {r.plate !== undefined && <div><label className={labelCls}>Plate</label><input value={editFields.plate || ""} onChange={e => setEditFields(f => ({ ...f, plate: e.target.value }))} className={inputCls} /></div>}
                          {r.state !== undefined && <div><label className={labelCls}>State</label><input value={editFields.state || ""} onChange={e => setEditFields(f => ({ ...f, state: e.target.value }))} className={inputCls} /></div>}
                          {r.descriptors !== undefined && <div className="sm:col-span-2"><label className={labelCls}>Descriptors</label><input value={editFields.descriptors || ""} onChange={e => setEditFields(f => ({ ...f, descriptors: e.target.value }))} className={inputCls} /></div>}
                          {r.violation_number !== undefined && <div><label className={labelCls}>Violation #</label><input value={editFields.violation_number || ""} onChange={e => setEditFields(f => ({ ...f, violation_number: e.target.value }))} className={inputCls} /></div>}
                          {r.violation_type !== undefined && <div><label className={labelCls}>Violation Type</label>
                            <select value={editFields.violation_type || ""} onChange={e => setEditFields(f => ({ ...f, violation_type: e.target.value }))} className={inputCls}>
                              {PARKING_VIOLATION_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select></div>}
                          {r.space !== undefined && <div><label className={labelCls}>Space</label><input value={editFields.space || ""} onChange={e => setEditFields(f => ({ ...f, space: e.target.value }))} className={inputCls} /></div>}
                          {/* Long text fields */}
                          {r.narrative !== undefined && <div className="sm:col-span-2"><label className={labelCls}>Patrol Narrative</label>
                            <textarea rows={4} value={editFields.narrative || ""} onChange={e => setEditFields(f => ({ ...f, narrative: e.target.value }))} className={textareaCls} /></div>}
                          {r.description !== undefined && <div className="sm:col-span-2"><label className={labelCls}>Incident Description</label>
                            <textarea rows={4} value={editFields.description || ""} onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))} className={textareaCls} /></div>}
                          {r.action_taken !== undefined && <div className="sm:col-span-2"><label className={labelCls}>Action Taken</label>
                            <textarea rows={3} value={editFields.action_taken || ""} onChange={e => setEditFields(f => ({ ...f, action_taken: e.target.value }))} className={textareaCls} /></div>}
                          {r.notes !== undefined && <div className="sm:col-span-2"><label className={labelCls}>Notes</label>
                            <textarea rows={3} value={editFields.notes || ""} onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))} className={textareaCls} /></div>}
                        </div>
                      ) : (
                        /* ── VIEW MODE ── */
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
                            <Field label="Date"    value={r.date} />
                            {r.time             && <Field label="Time"           value={r.time} />}
                            <Field label="Officer" value={r.officer_name || r.officer || "—"} />
                            {r.shift            && <Field label="Shift"          value={r.shift} />}
                            {r.weather          && <Field label="Weather"        value={r.weather} />}
                            {r.incident_type    && <Field label="Incident Type"  value={r.incident_type} />}
                            {r.location         && <Field label="Location"       value={r.location} />}
                            {(r.building || r.apartment) && <Field label="Bldg / Apt" value={[r.building, r.apartment].filter(Boolean).join(" / ")} />}
                            {r.hoh_name         && <Field label="HOH"            value={r.hoh_name} />}
                            {r.reliant_case_no  && <Field label="Reliant #"      value={r.reliant_case_no} />}
                            {r.hpd_report_no    && <Field label="HPD #"          value={r.hpd_report_no} />}
                            {r.asg_report_no    && <Field label="ASG #"          value={r.asg_report_no} />}
                            {r.persons_involved && <Field label="Persons"        value={r.persons_involved} />}
                            {r.first_name       && <Field label="Subject"        value={`${r.first_name} ${r.last_name}`} />}
                            {r.dob              && <Field label="DOB"            value={r.dob} />}
                            {r.sex              && <Field label="Sex"            value={r.sex} />}
                            {r.race             && <Field label="Race"           value={r.race} />}
                            {r.oln              && <Field label="OLN"            value={r.oln} />}
                            {r.address          && <Field label="Address"        value={r.address} />}
                            {r.reason           && <Field label="Reason"         value={r.reason} />}
                            {r.make             && <Field label="Make"           value={r.make} />}
                            {r.model            && <Field label="Model"          value={r.model} />}
                            {r.color            && <Field label="Color"          value={r.color} />}
                            {r.year             && <Field label="Year"           value={r.year} />}
                            {r.plate            && <Field label="Plate"          value={`${displayPlate(r.plate)}${r.state && !isNoPlate(r.plate) ? " (" + r.state + ")" : ""}`} />}
                            {r.descriptors      && <Field label="Descriptors"    value={r.descriptors} />}
                            {r.violation_issued && <Field label="Violation #"    value={r.violation_number || "Issued"} />}
                            {r.violation_type   && <Field label="Violation Type"  value={r.violation_type} />}
                            {r.space            && <Field label="Space"           value={r.space} />}
                            {r.tow_requested    && <Field label="Tow"             value={r.tow_reason ? `Requested — ${r.tow_reason}` : "Requested"} />}
                            {r.lvl_issued       && <Field label="Violation Type"  value={r.violation_type || "—"} />}
                            {r.lvl_issued       && <Field label="Category"        value={r.violation_category === "lease_compliance" ? "Lease compliance" : "Security / community"} />}
                            {r.lvl_issued && r.notice_level        && <Field label="Notice Level"   value={r.notice_level} />}
                            {r.lvl_issued && r.distribution_method && <Field label="Distribution"   value={r.distribution_method} />}
                            {r.lvl_issued && r.lvl_posted_date     && <Field label="LVL Posted"     value={r.lvl_posted_date} />}
                            {r.lvl_issued && r.issued_by           && <Field label="Issued By"      value={r.issued_by} />}
                            {r.record_source && r.record_source !== "officer" && <Field label="Source" value={r.record_source} />}
                          </div>
                          {r.lvl_issued && (
                            <div className="bg-amber-50 border border-amber-300 text-amber-900 text-sm px-4 py-2 rounded-lg font-medium mb-3">⚖️ Lease violation issued{r.hoh_ack ? " · HOH delivery acknowledged" : ""}.</div>
                          )}
                          {r.bolo_match && (
                            <div className="bg-red-50 border border-red-300 text-red-800 text-sm px-4 py-2 rounded-lg font-medium mb-3">🚨 Plate matched an active BOLO at the time this was logged.</div>
                          )}
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
                          {r.photo_url && (
                            <div className="mb-3">
                              <div className="text-xs font-semibold text-gray-500 mb-2">Photo</div>
                              <SignedImage src={r.photo_url} bucket="contact-photos" alt="report photo" className="max-h-48 rounded-lg border border-gray-200 object-cover" />
                            </div>
                          )}
                          {Array.isArray(r.photo_urls) && r.photo_urls.length > 0 && (
                            <div className="mb-3">
                              <div className="text-xs font-semibold text-gray-500 mb-2">Photos ({r.photo_urls.length})</div>
                              <div className="flex flex-wrap gap-2">
                                {r.photo_urls.map((u: string, i: number) => (
                                  <SignedLink key={i} href={u} bucket="contact-photos" title={`Photo ${i + 1}`}>
                                    <SignedImage src={u} bucket="contact-photos" alt={`Photo ${i + 1}`} className="w-24 h-24 rounded-lg border border-gray-200 object-cover" />
                                  </SignedLink>
                                ))}
                              </div>
                            </div>
                          )}
                          {(r.follow_up_required || r.follow_up) && (
                            <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm px-4 py-2 rounded-lg font-medium">⚠ Follow-up action required</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AUDIT LOG TAB ── */}
      {/* ── PASSDOWN LOG TAB ── */}
      {activeTab === "passdown" && (
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* SUBMIT FORM */}
            <div>
              <h3 className="text-lg font-bold mb-4 text-gray-800">Submit Passdown</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div><label className={labelCls}>Date</label>
                    <input type="date" value={pdDate} onChange={e => setPdDate(e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>Outgoing Shift</label>
                    <select value={pdShift} onChange={e => setPdShift(e.target.value)} className={inputCls}>
                      <option>Day</option><option>Evening</option><option>Night</option><option>Overnight</option>
                    </select></div>
                  <div><label className={labelCls}>Officer Name</label>
                    <input value={pdOfficer} onChange={e => setPdOfficer(e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>Location</label>
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
                  {pdSaving ? "Saving..." : "Save Passdown (draft)"}
                </button>
                <p className="text-xs text-gray-400 mt-2">Saving does not send it. Review &amp; edit the narrative in <span className="font-medium">Recent Passdowns</span>, then click Send.</p>
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
                  {pdEditingId === p.id ? (
                    <div>
                      <textarea rows={6} value={pdEditNotes} onChange={e => setPdEditNotes(e.target.value)} className={textareaCls} />
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => saveEditPassdown(p)}
                          className="px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer">💾 Save</button>
                        <button onClick={() => { setPdEditingId(null); setPdEditNotes("") }}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 border-none cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap mb-3">{p.notes}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.sent_at
                          ? <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ Sent {new Date(p.sent_at).toLocaleString()}</span>
                          : <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Draft — not sent</span>}
                        <button onClick={() => startEditPassdown(p)}
                          className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 border-none cursor-pointer">✏️ Edit</button>
                        <button onClick={() => sendPassdown(p)} disabled={pdSendingId === p.id}
                          className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 border-none cursor-pointer disabled:opacity-50">
                          {pdSendingId === p.id ? "Sending…" : (p.sent_at ? "📨 Resend" : "📨 Send")}
                        </button>
                      </div>
                    </>
                  )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div><label className={labelCls}>Subject Name</label>
                  <input value={boloName} onChange={e => setBoloName(e.target.value)} placeholder="First Last" className={inputCls} /></div>
                <div><label className={labelCls}>Reason / Alert Type</label>
                  <input value={boloReason} onChange={e => setBoloReason(e.target.value)} placeholder="e.g. Trespassing, Theft, Warrant" className={inputCls} /></div>
                <div><label className={labelCls}>DOB</label>
                  <input type="date" value={boloDob} onChange={e => setBoloDob(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>OLN (Driver License #)</label>
                  <input value={boloOln} onChange={e => setBoloOln(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>SSN</label>
                  <input value={boloSsn} onChange={e => setBoloSsn(e.target.value)} placeholder="XXX-XX-XXXX or last 4" maxLength={11} className={inputCls} /></div>
                <div><label className={labelCls}>Sex</label>
                  <select value={boloSex} onChange={e => setBoloSex(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select></div>
                <div><label className={labelCls}>Race</label>
                  <select value={boloRace} onChange={e => setBoloRace(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    <option>Black</option><option>White</option><option>Hispanic</option>
                    <option>Asian</option><option>Native American</option><option>Other</option>
                  </select></div>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="boloFirearm" checked={boloFirearm} onChange={e => setBoloFirearm(e.target.checked)} className="w-4 h-4 accent-red-700" />
                  <label htmlFor="boloFirearm" className="text-sm font-medium text-gray-700">🔫 Firearm flag — known to carry</label>
                </div>
                <div className="sm:col-span-2"><label className={labelCls}>Description</label>
                  <textarea rows={3} value={boloDesc} onChange={e => setBoloDesc(e.target.value)}
                    placeholder="Physical description, clothing, identifying features, last known location..."
                    className={textareaCls} /></div>
                <div><label className={labelCls}>Vehicle Description</label>
                  <input value={boloVehicle} onChange={e => setBoloVehicle(e.target.value)} placeholder="Year, Make, Model, Color" className={inputCls} /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2"><label className={labelCls}>License Plate</label>
                    <input value={boloPlate} onChange={e => setBoloPlate(e.target.value.toUpperCase())} placeholder="ABC1234" className={inputCls} /></div>
                  <div><label className={labelCls}>State</label>
                    <input value={boloPlateState} onChange={e => setBoloPlateState(e.target.value.toUpperCase())} placeholder="VA" maxLength={2} className={inputCls} /></div>
                </div>
                <div><label className={labelCls}>Location</label>
                  <select value={boloCommunity} onChange={e => setBoloCommunity(e.target.value)} className={inputCls}>
                    <option value="">All Properties</option>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div><label className={labelCls}>Added By</label>
                  <input value={boloAddedBy} onChange={e => setBoloAddedBy(e.target.value)} className={inputCls} /></div>

                {/* PHOTO */}
                <div className="sm:col-span-2">
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
              {editingBoloId === b.id ? (
                /* INLINE EDIT FORM (admin only) */
                <div>
                  <h4 className="font-bold text-red-800 mb-3 text-sm uppercase tracking-wide">Edit BOLO</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div><label className={labelCls}>Subject Name</label>
                      <input value={editBoloName} onChange={e => setEditBoloName(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>Reason / Alert Type</label>
                      <input value={editBoloReason} onChange={e => setEditBoloReason(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>DOB</label>
                      <input type="date" value={editBoloDob} onChange={e => setEditBoloDob(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>OLN (Driver License #)</label>
                      <input value={editBoloOln} onChange={e => setEditBoloOln(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>SSN</label>
                      <input value={editBoloSsn} onChange={e => setEditBoloSsn(e.target.value)} placeholder="XXX-XX-XXXX or last 4" maxLength={11} className={inputCls} /></div>
                    <div><label className={labelCls}>Sex</label>
                      <select value={editBoloSex} onChange={e => setEditBoloSex(e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        <option>Male</option><option>Female</option><option>Other</option>
                      </select></div>
                    <div><label className={labelCls}>Race</label>
                      <select value={editBoloRace} onChange={e => setEditBoloRace(e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        <option>Black</option><option>White</option><option>Hispanic</option>
                        <option>Asian</option><option>Native American</option><option>Other</option>
                      </select></div>
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <input type="checkbox" id={`editBoloFirearm-${b.id}`} checked={editBoloFirearm} onChange={e => setEditBoloFirearm(e.target.checked)} className="w-4 h-4 accent-red-700" />
                      <label htmlFor={`editBoloFirearm-${b.id}`} className="text-sm font-medium text-gray-700">🔫 Firearm flag — known to carry</label>
                    </div>
                    <div className="sm:col-span-2"><label className={labelCls}>Description</label>
                      <textarea rows={3} value={editBoloDesc} onChange={e => setEditBoloDesc(e.target.value)} className={textareaCls} /></div>
                    <div><label className={labelCls}>Vehicle Description</label>
                      <input value={editBoloVehicle} onChange={e => setEditBoloVehicle(e.target.value)} className={inputCls} /></div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2"><label className={labelCls}>License Plate</label>
                        <input value={editBoloPlate} onChange={e => setEditBoloPlate(e.target.value.toUpperCase())} placeholder="ABC1234" className={inputCls} /></div>
                      <div><label className={labelCls}>State</label>
                        <input value={editBoloPlateState} onChange={e => setEditBoloPlateState(e.target.value.toUpperCase())} placeholder="VA" maxLength={2} className={inputCls} /></div>
                    </div>
                    <div><label className={labelCls}>Location</label>
                      <select value={editBoloCommunity} onChange={e => setEditBoloCommunity(e.target.value)} className={inputCls}>
                        <option value="">All Properties</option>
                        {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></div>
                    <div><label className={labelCls}>Added By</label>
                      <input value={editBoloAddedBy} onChange={e => setEditBoloAddedBy(e.target.value)} className={inputCls} /></div>
                    {b.photo_url && (
                      <div className="sm:col-span-2 flex items-center gap-3">
                        <SignedImage src={b.photo_url} bucket="contact-photos" alt="" className="w-16 h-20 object-cover rounded border border-gray-300" />
                        <span className="text-xs text-gray-500">Photo replacement coming soon — current photo unchanged on save.</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveBoloEdit(b)} disabled={savingBoloEdit}
                      className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer disabled:opacity-50">
                      {savingBoloEdit ? "Saving..." : "💾 Save"}
                    </button>
                    <button onClick={cancelBoloEdit}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold rounded-md border-none cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* DISPLAY MODE */
                <div className="flex gap-4">
                  {b.photo_url && (
                    <SignedImage src={b.photo_url} bucket="contact-photos" alt="BOLO subject" className="w-20 h-24 object-cover rounded-lg flex-shrink-0 border border-red-200" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full mr-2 ${b.active ? "bg-red-600 text-white" : "bg-gray-400 text-white"}`}>
                          {b.active ? "🔴 ACTIVE" : "✓ Resolved"}
                        </span>
                        {b.community_id && <span className="text-xs text-gray-800 font-semibold">📍 {getCommunityName(b.community_id)}</span>}
                      </div>
                      <div className="text-xs text-gray-400 text-right shrink-0 ml-2">
                        <div>{new Date(b.created_at).toLocaleDateString()}</div>
                        {b.added_by && <div>By: {b.added_by}</div>}
                      </div>
                    </div>
                    {b.name && <div className="font-bold text-gray-900 text-lg">{b.name}</div>}
                    {b.reason && <div className="text-red-700 font-semibold text-sm mb-1">{b.reason}</div>}
                    {(b.dob || b.oln || b.ssn || b.sex || b.race || b.firearm_flag) && (
                      <div className="flex flex-wrap gap-4 mt-1 mb-1 text-xs text-gray-500">
                        {b.dob  && <span>DOB: {b.dob}</span>}
                        {b.oln  && <span>OLN: {b.oln}</span>}
                        {b.ssn  && <span>SSN: {maskSSN(b.ssn)}</span>}
                        {b.sex  && <span>Sex: {b.sex}</span>}
                        {b.race && <span>Race: {b.race}</span>}
                        {b.firearm_flag && <span className="text-red-600 font-semibold">🔫 Firearm</span>}
                      </div>
                    )}
                    {b.description && <div className="text-sm text-gray-700 mb-1 whitespace-pre-wrap">{b.description}</div>}
                    {b.vehicle && (
                      <div className="text-xs text-gray-600 mt-1">
                        🚗 <span className="font-medium">Vehicle:</span> {b.vehicle}
                      </div>
                    )}
                    {b.plate && (
                      <div className="text-xs text-gray-600 mt-1">
                        🔖 <span className="font-medium">Plate:</span> {b.plate}{b.plate_state ? ` (${b.plate_state})` : ""}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {b.active ? (
                        <button onClick={() => resolveBolo(b.id)}
                          className="px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 border-none cursor-pointer">
                          ✓ Mark Resolved
                        </button>
                      ) : (
                        <button onClick={() => reactivateBolo(b.id)}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 border-none cursor-pointer">
                          🔴 Reactivate
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button onClick={() => startBoloEdit(b)}
                            className="px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 border-none cursor-pointer">
                            ✎ Edit
                          </button>
                          <button onClick={() => { notifyBolo(b.id); setBoloMessage(`📧 Email notification sent for ${b.name || b.description?.slice(0, 40) || "BOLO"}`); setTimeout(() => setBoloMessage(""), 2500) }}
                            title="Re-send email notification to recipients"
                            className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border-none cursor-pointer">
                            📧 Notify
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
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

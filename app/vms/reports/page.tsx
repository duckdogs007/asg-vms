"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { VisitorLog } from "@/lib/types"
import { ADMIN_EMAILS, checkCanApprove } from "@/lib/admin"
import { displayPlate, isNoPlate } from "@/components/VehicleFields"

// Recent-submissions typeKey → URL slug for /vms/reports/[type]/[id]
const SUB_TYPE_SLUG: Record<string, string> = {
  incident:      "incident",
  fieldContact:  "field-contact",
  vehicleFI:     "vehicle-fi",
  parking:       "parking",
  dailyLog:      "daily-log",
  maintenance:   "maintenance",
  gateChecklist: "gate-checklist",
}

// report_queue.report_type → URL slug
const QUEUE_TYPE_SLUG: Record<string, string> = {
  incident:      "incident",
  field_contact: "field-contact",
  vehicle_fi:    "vehicle-fi",
  parking:       "parking",
  daily_log:     "daily-log",
  maintenance:   "maintenance",
}

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

// typeKey → report_queue.report_type value
const SUB_QUEUE_TYPE: Partial<Record<string, string>> = {
  incident:      "incident",
  fieldContact:  "field_contact",
  vehicleFI:     "vehicle_fi",
  parking:       "parking",
  dailyLog:      "daily_log",
  maintenance:   "maintenance",
}

interface SubmissionRow {
  id: string
  typeKey: "incident" | "fieldContact" | "vehicleFI" | "parking" | "dailyLog" | "maintenance" | "gateChecklist"
  typeLabel: string
  officer: string
  community_id: string | null
  created_at: string
  summary: string
  queueStatus?: string
  approvedBy?: string
  approvedAt?: string
}

interface RunnerRow {
  id: string; typeKey: string; typeLabel: string; color: string
  date: string; summary: string; officer: string; slug: string
  raw?: any // original record — used by the Watchlist roster export for full columns
}

const REPORT_TYPES = [
  { key: "incidents",      label: "Incident Reports",   color: "red",     table: "incident_reports",             dateCol: "date"           },
  { key: "fieldContacts",  label: "Field Contacts",     color: "purple",  table: "contact_history",              dateCol: "created_at"     },
  { key: "vehicleFIs",     label: "Vehicle FIs",        color: "orange",  table: "vehicle_fi_logs",              dateCol: "date"           },
  { key: "parking",        label: "Parking Violations", color: "amber",   table: "parking_violations",           dateCol: "date"           },
  { key: "dailyLogs",      label: "Daily Logs",         color: "teal",    table: "officer_daily_logs",           dateCol: "date"           },
  { key: "maintenance",    label: "Maintenance",        color: "emerald", table: "property_maintenance_reports", dateCol: "created_at"     },
  { key: "gateChecklists", label: "Gate Checklists",    color: "slate",   table: "gate_checklists",              dateCol: "checklist_date" },
  { key: "visitorLogs",    label: "Visitor Log",        color: "indigo",  table: "visitor_logs",                 dateCol: "created_at"     },
] as const
type RptTypeKey = typeof REPORT_TYPES[number]["key"]

const RUNNER_SLUG: Record<string, string> = {
  incidents:      "incident",
  fieldContacts:  "field-contact",
  vehicleFIs:     "vehicle-fi",
  parking:        "parking",
  dailyLogs:      "daily-log",
  maintenance:    "maintenance",
  gateChecklists: "gate-checklist",
  visitorLogs:    "visitor-log",
}

// unit_activity.source_table → /vms/reports/[type] slug (for the Unit History report)
const UA_SOURCE_SLUG: Record<string, string> = {
  incident_reports:             "incident",
  parking_violations:           "parking",
  vehicle_fi_logs:              "vehicle-fi",
  contact_history:              "field-contact",
  officer_daily_logs:           "daily-log",
  property_maintenance_reports: "maintenance",
  gate_checklists:              "gate-checklist",
  visitor_logs:                 "visitor-log",
}

const RUNNER_BADGE_KEY: Record<string, string> = {
  incidents:      "incident",
  fieldContacts:  "fieldContact",
  vehicleFIs:     "vehicleFI",
  parking:        "parking",
  dailyLogs:      "dailyLog",
  maintenance:    "maintenance",
  gateChecklists: "gateChecklist",
  visitorLogs:    "visitorLog",
  watchlist:      "watchlist",
}

// Maps top-bar type filter key → SubmissionRow.typeKey for Recent Submissions filtering
const TOP_FILTER_TO_SUB_KEY: Record<string, string> = {
  incidents:      "incident",
  fieldContacts:  "fieldContact",
  vehicleFIs:     "vehicleFI",
  parking:        "parking",
  dailyLogs:      "dailyLog",
  maintenance:    "maintenance",
  gateChecklists: "gateChecklist",
  visitorLogs:    "visitorLog",
}

const SUB_BADGE: Record<string, string> = {
  // camelCase keys — Recent Submissions (s.typeKey)
  incident:      "bg-red-100 text-red-700",
  fieldContact:  "bg-purple-100 text-purple-700",
  vehicleFI:     "bg-orange-100 text-orange-700",
  parking:       "bg-amber-100 text-amber-700",
  dailyLog:      "bg-teal-100 text-teal-700",
  maintenance:   "bg-emerald-100 text-emerald-700",
  gateChecklist: "bg-slate-100 text-slate-700",
  visitorLog:    "bg-indigo-100 text-indigo-700",
  watchlist:     "bg-rose-100 text-rose-700",
  // snake_case keys — Review Queue (q.report_type)
  field_contact: "bg-purple-100 text-purple-700",
  vehicle_fi:    "bg-orange-100 text-orange-700",
  daily_log:     "bg-teal-100 text-teal-700",
}

const RPT_COLORS: Record<string, { idle: string; open: string; title: string; val: string }> = {
  red:     { idle: "bg-red-50 border-red-200",       open: "bg-red-100 border-red-300",       title: "text-red-700",     val: "text-red-800"     },
  purple:  { idle: "bg-purple-50 border-purple-200", open: "bg-purple-100 border-purple-300", title: "text-purple-700",  val: "text-purple-800"  },
  orange:  { idle: "bg-orange-50 border-orange-200", open: "bg-orange-100 border-orange-300", title: "text-orange-700",  val: "text-orange-800"  },
  amber:   { idle: "bg-amber-50 border-amber-200",   open: "bg-amber-100 border-amber-300",   title: "text-amber-700",   val: "text-amber-800"   },
  teal:    { idle: "bg-teal-50 border-teal-200",     open: "bg-teal-100 border-teal-300",     title: "text-teal-700",    val: "text-teal-800"    },
  emerald: { idle: "bg-emerald-50 border-emerald-200", open: "bg-emerald-100 border-emerald-300", title: "text-emerald-700", val: "text-emerald-800" },
  slate:   { idle: "bg-slate-50 border-slate-200",   open: "bg-slate-100 border-slate-300",   title: "text-slate-700",   val: "text-slate-800"   },
  indigo:  { idle: "bg-indigo-50 border-indigo-200", open: "bg-indigo-100 border-indigo-300", title: "text-indigo-700",  val: "text-indigo-800"  },
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
  const [canApprove,     setCanApprove]     = useState(false)
  const [userEmail,      setUserEmail]      = useState("")
  const [deleting,       setDeleting]       = useState<string | null>(null)
  const [entryLogSearch, setEntryLogSearch] = useState("")
  const [priorTotal,     setPriorTotal]     = useState<number | null>(null)
  const EMPTY_RPT: Record<RptTypeKey, number> = { incidents: 0, fieldContacts: 0, vehicleFIs: 0, parking: 0, dailyLogs: 0, maintenance: 0, gateChecklists: 0, visitorLogs: 0 }
  // rptCommunity is derived from the top-level community filter — one picker controls everything
  const rptCommunity = community
  const [rptSummary,       setRptSummary]       = useState<Record<RptTypeKey, number>>(EMPTY_RPT)
  const [rptSummaryLoading,setRptSummaryLoading]= useState(false)
  const [rptOpenDetail,    setRptOpenDetail]    = useState<RptTypeKey | null>(null)
  const [rptDetailRows,    setRptDetailRows]    = useState<any[]>([])
  const [rptDetailLoading, setRptDetailLoading] = useState(false)

  const [topTypeFilter, setTopTypeFilter] = useState("all")
  const [activeTab,     setActiveTab]     = useState<"reports" | "activity" | "registry">("reports")

  const [runnerType,    setRunnerType]    = useState("all")
  const [runnerRows,    setRunnerRows]    = useState<RunnerRow[]>([])
  const [uhSort,        setUhSort]        = useState<"location" | "date" | "type">("location")
  const [aiOpen,        setAiOpen]        = useState(false)
  const [aiLoading,     setAiLoading]     = useState(false)
  const [aiError,       setAiError]       = useState("")
  const [aiResult,      setAiResult]      = useState<any>(null)
  const [aiMeta,        setAiMeta]        = useState<any>(null)
  const [aiCached,      setAiCached]      = useState(false)
  const [aiGenAt,       setAiGenAt]       = useState("")
  const [aiGenBy,       setAiGenBy]       = useState("")
  const [runnerLoading, setRunnerLoading] = useState(false)
  const [runnerRan,     setRunnerRan]     = useState(false)

  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  // Parking violations for the selected community + date range (filtered by the
  // violation `date`). Surfaced as its own section so officer-enforcement data
  // shows up in platform reporting, not just the Officer Reports tab.
  const [parking, setParking] = useState<any[]>([])
  // Lease violations (incident_reports where lvl_issued = true) for the selected
  // community + date range. Each row gets an `_offenders` array attached from
  // violation_offenders so ban-match data renders inline.
  const [leaseViols, setLeaseViols] = useState<any[]>([])
  // Registered-vehicle database (resident + visitor) for the selected community.
  // Registry is current-state, not date-ranged — it loads per community only.
  const [registry,   setRegistry]   = useState<any[]>([])
  const [regSearch,  setRegSearch]  = useState("")
  const [regKind,    setRegKind]    = useState<"all" | "resident" | "visitor">("all")
  const [recentSubs,        setRecentSubs]        = useState<SubmissionRow[]>([])
  const [recentSubsLoading, setRecentSubsLoading] = useState(false)
  const [recentSubsExpanded, setRecentSubsExpanded] = useState(false)

  // Review queue (admin/supervisor)
  const [queue,        setQueue]        = useState<any[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [approved,        setApproved]        = useState<any[]>([])
  const [approvedLoading, setApprovedLoading] = useState(false)
  const [approvedExpanded, setApprovedExpanded] = useState(false)
  const [approvingId,  setApprovingId]  = useState<string | null>(null)
  const [returnId,     setReturnId]     = useState<string | null>(null)
  const [returnNotes,  setReturnNotes]  = useState("")
  const [returnSaving, setReturnSaving] = useState(false)
  const [queueMsg,     setQueueMsg]     = useState<Record<string, { ok: boolean; msg: string }>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const email = user?.email || ""
      setUserEmail(email)
      setIsAdmin(ADMIN_EMAILS.includes(email))
    })
    checkCanApprove().then(setCanApprove)
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
      if (chosen) {
        setCommunity(chosen.id)
      }
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

  useEffect(() => { if (community) loadData() }, [community, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (community) loadRegistry() }, [community]) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (community) { setRptOpenDetail(null); setRptDetailRows([]); loadRptSummary() } }, [community, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync Report Runner type when top-bar filter changes
  useEffect(() => { setRunnerType(topTypeFilter); setRunnerRan(false) }, [topTypeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

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
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "registered_vehicles",
        filter: `community_id=eq.${community}` }, () => {
        loadData()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_reports",
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

    // Lease violations in range (incident_reports with lvl_issued), newest first.
    // Pull their offenders in one batched query and attach to each row.
    const { data: lv } = await supabase
      .from("incident_reports").select("*")
      .eq("community_id", community)
      .eq("lvl_issued", true)
      .gte("date", dateFrom).lte("date", dateTo)
      .order("date", { ascending: false })
    const lvRows = lv || []
    const lvIds  = lvRows.map(r => r.id)
    let offenders: any[] = []
    if (lvIds.length > 0) {
      const { data: vo } = await supabase
        .from("violation_offenders").select("*")
        .in("report_id", lvIds)
      offenders = vo || []
    }
    const offByReport = offenders.reduce((m: Record<string, any[]>, o) => {
      (m[o.report_id] = m[o.report_id] || []).push(o); return m
    }, {})
    setLeaseViols(lvRows.map(r => ({ ...r, _offenders: offByReport[r.id] || [] })))

    // Fire-and-forget: prior period count for comparison delta.
    const prior = priorRange(dateFrom, dateTo)
    supabase.from("visitor_logs")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community)
      .gte("created_at", prior.from + "T00:00:00")
      .lte("created_at", prior.to   + "T23:59:59")
      .then(({ count }) => setPriorTotal(count ?? 0))
  }

  async function loadRegistry() {
    if (!community) return
    const { data: rv } = await supabase
      .from("registered_vehicles").select("*")
      .eq("community_id", community)
      .order("kind", { ascending: true }).order("plate", { ascending: true })
    setRegistry(rv || [])
  }

  async function loadRptSummary() {
    if (!rptCommunity) return
    setRptSummaryLoading(true)
    const [incR, ctR, vfiR, pvR, logR, mntR, gcR, vlR] = await Promise.all([
      supabase.from("incident_reports").select("*", { count: "exact", head: true }).eq("community_id", rptCommunity).gte("date", dateFrom).lte("date", dateTo),
      supabase.from("contact_history").select("*", { count: "exact", head: true }).eq("community_id", rptCommunity).gte("created_at", dateFrom + "T00:00:00").lte("created_at", dateTo + "T23:59:59"),
      supabase.from("vehicle_fi_logs").select("*", { count: "exact", head: true }).eq("community_id", rptCommunity).gte("date", dateFrom).lte("date", dateTo),
      supabase.from("parking_violations").select("*", { count: "exact", head: true }).eq("community_id", rptCommunity).gte("date", dateFrom).lte("date", dateTo),
      supabase.from("officer_daily_logs").select("*", { count: "exact", head: true }).eq("community_id", rptCommunity).gte("date", dateFrom).lte("date", dateTo),
      supabase.from("property_maintenance_reports").select("*", { count: "exact", head: true }).eq("community_id", rptCommunity).gte("created_at", dateFrom + "T00:00:00").lte("created_at", dateTo + "T23:59:59"),
      supabase.from("gate_checklists").select("*", { count: "exact", head: true }).eq("community_id", rptCommunity).gte("checklist_date", dateFrom).lte("checklist_date", dateTo),
      supabase.from("visitor_logs").select("*", { count: "exact", head: true }).eq("community_id", rptCommunity).gte("created_at", dateFrom + "T00:00:00").lte("created_at", dateTo + "T23:59:59"),
    ])
    setRptSummary({
      incidents:      incR.count  || 0,
      fieldContacts:  ctR.count   || 0,
      vehicleFIs:     vfiR.count  || 0,
      parking:        pvR.count   || 0,
      dailyLogs:      logR.count  || 0,
      maintenance:    mntR.count  || 0,
      gateChecklists: gcR.count   || 0,
      visitorLogs:    vlR.count   || 0,
    })
    setRptSummaryLoading(false)
  }

  async function toggleRptDetail(key: RptTypeKey) {
    if (rptOpenDetail === key) { setRptOpenDetail(null); setRptDetailRows([]); return }
    setRptOpenDetail(key)
    setRptDetailRows([])
    setRptDetailLoading(true)
    const rt = REPORT_TYPES.find(r => r.key === key)!
    let q = supabase.from(rt.table).select("*").eq("community_id", rptCommunity)
    if (rt.dateCol === "created_at") {
      q = q.gte("created_at", dateFrom + "T00:00:00").lte("created_at", dateTo + "T23:59:59")
    } else {
      q = q.gte("date", dateFrom).lte("date", dateTo)
    }
    const { data } = await (q as any).order(rt.dateCol, { ascending: false }).limit(200)
    setRptDetailRows(data || [])
    setRptDetailLoading(false)
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

  // Load once on mount — cross-community, not date-filtered.
  useEffect(() => { loadRecentSubmissions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load queue whenever approve-eligibility resolves
  useEffect(() => { if (canApprove) { loadQueue(); loadApproved() } }, [canApprove]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRecentSubmissions() {
    setRecentSubsLoading(true)
    const N = 20
    const [incR, ctR, vfiR, pvR, logR, mntR, gcR] = await Promise.all([
      supabase.from("incident_reports").select("id,community_id,created_at,incident_type,officer_name,issued_by").order("created_at", { ascending: false }).limit(N),
      supabase.from("contact_history").select("id,community_id,created_at,officer,first_name,last_name").order("created_at", { ascending: false }).limit(N),
      supabase.from("vehicle_fi_logs").select("id,community_id,created_at,officer_name,plate").order("created_at", { ascending: false }).limit(N),
      supabase.from("parking_violations").select("id,community_id,created_at,officer_name,plate,violation_type").order("created_at", { ascending: false }).limit(N),
      supabase.from("officer_daily_logs").select("id,community_id,created_at,officer_name").order("created_at", { ascending: false }).limit(N),
      supabase.from("property_maintenance_reports").select("id,community_id,created_at,officer_name,issue_type").order("created_at", { ascending: false }).limit(N),
      supabase.from("gate_checklists").select("id,community_id,created_at,checklist_date,guard_name,shift").order("created_at", { ascending: false }).limit(N),
    ])
    const rows: SubmissionRow[] = [
      ...(incR.data || []).map(r => ({
        id: r.id, typeKey: "incident" as const, typeLabel: "Incident Report",
        officer: r.issued_by || r.officer_name || "—", community_id: r.community_id,
        created_at: r.created_at, summary: r.incident_type || "—",
      })),
      ...(ctR.data || []).map(r => ({
        id: r.id, typeKey: "fieldContact" as const, typeLabel: "Field Contact",
        officer: r.officer || "—", community_id: r.community_id,
        created_at: r.created_at, summary: [r.first_name, r.last_name].filter(Boolean).join(" ") || "—",
      })),
      ...(vfiR.data || []).map(r => ({
        id: r.id, typeKey: "vehicleFI" as const, typeLabel: "Vehicle FI",
        officer: r.officer_name || "—", community_id: r.community_id,
        created_at: r.created_at, summary: r.plate ? `Plate: ${r.plate}` : "—",
      })),
      ...(pvR.data || []).map(r => ({
        id: r.id, typeKey: "parking" as const, typeLabel: "Parking Violation",
        officer: r.officer_name || "—", community_id: r.community_id,
        created_at: r.created_at, summary: [r.violation_type, r.plate].filter(Boolean).join(" · ") || "—",
      })),
      ...(logR.data || []).map(r => ({
        id: r.id, typeKey: "dailyLog" as const, typeLabel: "Daily Log",
        officer: r.officer_name || "—", community_id: r.community_id,
        created_at: r.created_at, summary: "Daily activity log",
      })),
      ...(mntR.data || []).map(r => ({
        id: r.id, typeKey: "maintenance" as const, typeLabel: "Maintenance Report",
        officer: r.officer_name || "—", community_id: r.community_id,
        created_at: r.created_at, summary: r.issue_type || "—",
      })),
      ...(gcR.data || []).map(r => ({
        id: r.id, typeKey: "gateChecklist" as const, typeLabel: "Gate Checklist",
        officer: r.guard_name || "—", community_id: r.community_id,
        created_at: r.created_at, summary: [r.checklist_date, r.shift].filter(Boolean).join(" · ") || "—",
      })),
    ]
    rows.sort((a, b) => new Date(utc(b.created_at)).getTime() - new Date(utc(a.created_at)).getTime())
    const top15 = rows.slice(0, 15)

    // Batch-fetch queue status for the 15 displayed rows (types that go through the queue)
    const queueable = top15.filter(r => SUB_QUEUE_TYPE[r.typeKey])
    if (queueable.length > 0) {
      const { data: qRows } = await supabase
        .from("report_queue")
        .select("report_id,report_type,status,reviewed_by,reviewed_at")
        .in("report_id", queueable.map(r => r.id))
      const qMap: Record<string, typeof qRows extends (infer T)[] | null ? T : never> = {}
      for (const q of qRows || []) { qMap[q.report_id] = q }
      for (const row of top15) {
        const q = qMap[row.id]
        if (q) {
          row.queueStatus = q.status
          row.approvedBy  = q.reviewed_by ?? undefined
          row.approvedAt  = q.reviewed_at ?? undefined
        }
      }
    }

    setRecentSubs(top15)
    setRecentSubsLoading(false)
  }

  async function loadQueue() {
    setQueueLoading(true)
    const { data } = await supabase.from("report_queue")
      .select("*")
      .in("status", ["pending", "needs_revision"])
      .order("submitted_at", { ascending: true })
    setQueue(data || [])
    setQueueLoading(false)
  }

  // Recently approved reports — report_queue rows that have been reviewed and
  // sent to the client. status='sent' is set by the approve endpoint.
  async function loadApproved() {
    setApprovedLoading(true)
    const { data } = await supabase.from("report_queue")
      .select("*")
      .eq("status", "sent")
      .order("reviewed_at", { ascending: false })
      .limit(15)
    setApproved(data || [])
    setApprovedLoading(false)
  }

  async function approveReport(queueId: string) {
    setApprovingId(queueId)
    const res = await fetch("/api/reports/queue/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    })
    const data = await res.json()
    setApprovingId(null)
    const msg = data.ok
      ? `✅ Approved and emailed to ${data.recipients?.length ? data.recipients.join(", ") : "no contacts on file"}.`
      : `Error: ${data.error || "unknown"}`
    setQueueMsg(prev => ({ ...prev, [queueId]: { ok: data.ok, msg } }))
    if (data.ok) {
      // Audit logging for approvals is handled authoritatively server-side in
      // /api/reports/queue/approve (no client-side insert — avoids duplicates
      // and guarantees every approval is recorded).
      setTimeout(() => {
        setQueue(prev => prev.filter(q => q.id !== queueId))
        setQueueMsg(prev => { const u = { ...prev }; delete u[queueId]; return u })
        loadRecentSubmissions()
        loadApproved()
      }, 2000)
    }
  }

  async function returnReport(queueId: string, notes: string) {
    if (!notes.trim()) return
    setReturnSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from("report_queue").update({
      status:         "needs_revision",
      revision_notes: notes.trim(),
      reviewed_by:    user?.email || null,
      reviewed_at:    new Date().toISOString(),
    }).eq("id", queueId)
    setReturnSaving(false)
    if (error) { alert("Failed: " + error.message); return }
    supabase.from("audit_logs").insert({
      user_email: user?.email || "unknown",
      action: "returned", resource_type: "Report Queue", resource_id: queueId,
      detail: `Returned report for revision — ${notes.trim().slice(0, 100)}`,
      created_at: new Date().toISOString(),
    })
    setReturnId(null)
    setReturnNotes("")
    loadQueue()
    loadRecentSubmissions()
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

  // Watchlist (Barred Persons) roster — current state for a community, not
  // date-ranged. Powers "export a list of barred persons by property location".
  async function runWatchlistRoster() {
    const { data } = await supabase
      .from("watchlist").select("*")
      .eq("community_id", rptCommunity)
      .order("last_name", { ascending: true })
      .limit(2000)
    const rows: RunnerRow[] = (data || []).map((w: any) => {
      const name = [w.first_name, w.middle_name, w.last_name].filter(Boolean).join(" ").trim()
      const summary = [
        name || "—",
        w.reason,
        [w.sex, w.race].filter(Boolean).join("/"),
        w.dob ? `DOB ${w.dob}` : null,
        w.status && w.status !== "Active" ? `(${w.status})` : null,
        w.firearm_flag ? "🔫" : null,
      ].filter(Boolean).join(" · ")
      return {
        id: w.id, typeKey: "watchlist", typeLabel: "Barred Person", color: "rose",
        date: w.ban_date || "", summary, officer: w.banned_by || "—", slug: "intel", raw: w,
      }
    })
    setRunnerRows(rows); setRunnerLoading(false); setRunnerRan(true)
  }

  // Sort Unit History rows by location (building/apartment), date, or type.
  function sortUnitHistory(rows: RunnerRow[], key: "location" | "date" | "type"): RunnerRow[] {
    const locKey = (r: RunnerRow) => `${r.raw?.building ?? ""}|${r.raw?.apartment ?? ""}`
    const arr = [...rows]
    if (key === "date")      arr.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    else if (key === "type") arr.sort((a, b) => (a.typeLabel || "").localeCompare(b.typeLabel || "") || locKey(a).localeCompare(locKey(b), undefined, { numeric: true }))
    else                     arr.sort((a, b) => locKey(a).localeCompare(locKey(b), undefined, { numeric: true }) || (b.date || "").localeCompare(a.date || ""))
    return arr
  }

  // Unit History report — complete activity for a community from the
  // unit_activity view, sortable by location. Not date-ranged.
  async function runUnitHistory(sortKey: "location" | "date" | "type" = uhSort) {
    const { data } = await supabase
      .from("unit_activity").select("*")
      .eq("community_id", rptCommunity)
      .order("building", { ascending: true })
      .order("apartment", { ascending: true })
      .order("event_at", { ascending: false })
      .limit(3000)
    const rows: RunnerRow[] = (data || []).map((u: any) => {
      const loc  = [u.building, u.apartment].filter(Boolean).join("-") || "—"
      const refs = [
        u.reliant_case_no && `Reliant ${u.reliant_case_no}`,
        u.hpd_report_no && `HPD ${u.hpd_report_no}`,
        u.asg_report_no && `ASG ${u.asg_report_no}`,
      ].filter(Boolean).join(" · ")
      return {
        id: u.source_id, typeKey: "unithistory", typeLabel: u.record_type || "Activity", color: "slate",
        date: u.event_at ? new Date(u.event_at).toLocaleDateString("en-CA") : "",
        summary: [loc, u.hoh_name].filter(Boolean).join(" · ") || "—",
        officer: [u.detail, refs].filter(Boolean).join(" · ") || "—",
        slug: UA_SOURCE_SLUG[u.source_table] || "", raw: u,
      }
    })
    setRunnerRows(sortUnitHistory(rows, sortKey)); setRunnerLoading(false); setRunnerRan(true)
  }

  // AI Summary — scan all activity for the community + date range and produce a
  // structured operations brief (concerns, follow-ups, patterns). Beta.
  async function runAiSummary(force = false, isRetry = false) {
    if (!rptCommunity) return
    if (!isRetry) { setAiOpen(true); setAiResult(null); setAiMeta(null) }
    setAiLoading(true); setAiError("")
    let res: Response, data: any
    try {
      res = await fetch("/api/ai/location-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: rptCommunity, from: dateFrom, to: dateTo, force }),
      })
      data = await res.json().catch(() => ({}))
    } catch (e: any) {
      setAiError(e?.message || "Failed to generate summary."); setAiLoading(false); return
    }
    // Transparent single auto-retry on a rate-limit (short delays only).
    if (res.status === 429 && !isRetry && (Number(data.retryAfter) || 99) <= 30) {
      const wait = Math.min(30, Math.max(3, Number(data.retryAfter) || 12))
      setAiLoading(false)
      for (let s = wait; s > 0; s--) {
        setAiError(`Rate limited by the AI service — auto-retrying in ${s}s…`)
        await new Promise(r => setTimeout(r, 1000))
      }
      return runAiSummary(force, true)
    }
    if (!res.ok) { setAiError(data.error || "Failed to generate summary."); setAiLoading(false); return }
    setAiResult(data.summary); setAiMeta(data.meta)
    setAiCached(!!data.cached); setAiGenAt(data.generatedAt || ""); setAiGenBy(data.generatedBy || "")
    setAiLoading(false)
  }

  // Render the source-record links a finding cites (via aiMeta.sources map).
  function renderSources(refs?: string[]) {
    if (!refs?.length || !aiMeta?.sources) return null
    const items = refs.map((r: string) => aiMeta.sources[r]).filter(Boolean)
    if (!items.length) return null
    return (
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {items.map((s: any, i: number) => s.href ? (
          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-700 hover:underline">🔗 {s.label}</a>
        ) : (
          <span key={i} className="text-[11px] text-gray-400">{s.label}</span>
        ))}
      </div>
    )
  }

  function printAiSummary() {
    if (!aiResult || !aiMeta) return
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const sec = (title: string, body: string) => body ? `<h2>${esc(title)}</h2>${body}` : ""
    const list = (arr: any[], fmt: (x: any) => string) => arr?.length ? `<ul>${arr.map(x => `<li>${fmt(x)}</li>`).join("")}</ul>` : "<p class='muted'>None noted.</p>"
    const html = `<!DOCTYPE html><html><head><title>AI Summary — ${esc(aiMeta.community)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:28px;color:#111}h1{font-size:17px;margin-bottom:2px}h2{font-size:13px;margin:16px 0 4px;border-bottom:1px solid #ddd;padding-bottom:2px}.meta{color:#666;font-size:11px;margin-bottom:12px}ul{margin:4px 0 8px 18px;padding:0}li{margin-bottom:4px}.muted{color:#999}.hi{color:#b91c1c;font-weight:bold}.med{color:#b45309;font-weight:bold}.lo{color:#555;font-weight:bold}.tag{font-size:10px}</style>
</head><body>
<h1>AI Operations Summary — ${esc(aiMeta.community)}</h1>
<div class="meta">${esc(aiMeta.from)} to ${esc(aiMeta.to)} · ${aiMeta.totalRecords} records · AI-generated (review before distribution) · ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
<p>${esc(aiResult.executive_summary)}</p>
${sec("Concerns", list(aiResult.concerns, (c: any) => `<span class="${c.severity === "high" ? "hi" : c.severity === "medium" ? "med" : "lo"}">[${esc(c.severity)}]</span> ${esc(c.title)}${c.location ? ` — ${esc(c.location)}` : ""}${c.detail ? `<br><span class="muted">${esc(c.detail)}</span>` : ""}`))}
${sec("Follow-ups", list(aiResult.follow_ups, (f: any) => `${esc(f.title)}${f.location ? ` — ${esc(f.location)}` : ""}${f.detail ? `<br><span class="muted">${esc(f.detail)}</span>` : ""}`))}
${sec("Patterns", list(aiResult.patterns, (p: any) => `${esc(p.title)}${p.detail ? `<br><span class="muted">${esc(p.detail)}</span>` : ""}`))}
${sec("Recommendations", list(aiResult.recommendations, (r: any) => esc(r)))}
</body></html>`
    const w = window.open("", "_blank")
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  async function runReport() {
    if (!rptCommunity) return
    setRunnerLoading(true); setRunnerRan(false); setRunnerRows([])
    if (runnerType === "watchlist")   { await runWatchlistRoster(); return }
    if (runnerType === "unithistory") { await runUnitHistory();     return }
    const typesToRun = runnerType === "all"
      ? REPORT_TYPES
      : REPORT_TYPES.filter(rt => rt.key === runnerType)
    const results = await Promise.all(typesToRun.map(async rt => {
      let q = (supabase.from(rt.table) as any).select("*").eq("community_id", rptCommunity)
      if (rt.dateCol === "created_at") q = q.gte("created_at", dateFrom + "T00:00:00").lte("created_at", dateTo + "T23:59:59")
      else q = q.gte(rt.dateCol, dateFrom).lte(rt.dateCol, dateTo)
      const { data } = await q.order(rt.dateCol, { ascending: false }).limit(500)
      return { rt, rows: (data || []) as any[] }
    }))
    const rows: RunnerRow[] = []
    for (const { rt, rows: data } of results) {
      for (const r of data) {
        let date = "", summary = "", officer = ""
        if (rt.key === "incidents") {
          date = r.date || ""; officer = r.issued_by || r.officer_name || "—"
          summary = [r.incident_type, r.description?.substring(0, 120)].filter(Boolean).join(" · ")
        } else if (rt.key === "fieldContacts") {
          date = r.created_at ? new Date(utc(r.created_at)).toLocaleDateString("en-CA") : ""; officer = r.officer_name || "—"
          summary = r.contact_name || r.subject_name || "—"
        } else if (rt.key === "vehicleFIs") {
          date = r.date || ""; officer = r.officer_name || "—"
          summary = [displayPlate(r.plate), [r.year, r.color, r.make, r.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
        } else if (rt.key === "parking") {
          date = r.date || ""; officer = r.officer_name || "—"
          summary = [r.violation_type, displayPlate(r.plate), r.location].filter(Boolean).join(" · ")
        } else if (rt.key === "dailyLogs") {
          date = r.date || ""; officer = r.officer_name || "—"
          summary = [r.shift, r.log_type, r.narrative?.substring(0, 120)].filter(Boolean).join(" · ")
        } else if (rt.key === "maintenance") {
          date = r.created_at ? new Date(utc(r.created_at)).toLocaleDateString("en-CA") : ""; officer = r.officer_name || "—"
          summary = [r.issue_type, r.description?.substring(0, 120)].filter(Boolean).join(" · ")
        } else if (rt.key === "gateChecklists") {
          date = r.checklist_date || (r.created_at ? new Date(utc(r.created_at)).toLocaleDateString("en-CA") : ""); officer = r.guard_name || "—"
          summary = [r.shift, r.guard_name ? `Guard: ${r.guard_name}` : null].filter(Boolean).join(" · ")
        } else if (rt.key === "visitorLogs") {
          date = r.created_at ? new Date(utc(r.created_at)).toLocaleDateString("en-CA") : ""
          officer = r.person_type || "visitor"
          const name = [r.dl_first_name || r.first_name, r.dl_last_name || r.last_name].filter(Boolean).join(" ")
          summary = [name, r.unit_number && `Unit ${r.unit_number}`, r.resident_name && `→ ${r.resident_name}`, r.status === "denied" && "DENIED"].filter(Boolean).join(" · ")
        }
        rows.push({ id: r.id, typeKey: rt.key, typeLabel: rt.label, color: rt.color,
          date, summary: summary || "—", officer, slug: RUNNER_SLUG[rt.key] || rt.key })
      }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date))
    setRunnerRows(rows); setRunnerLoading(false); setRunnerRan(true)
  }

  function exportRunnerCSV() {
    const communityLabel = communities.find(c => c.id === rptCommunity)?.name || ""
    // Barred-persons roster gets its own full-column layout instead of the
    // generic Date/Type/Details columns.
    if (runnerType === "watchlist") {
      const header = ["Last Name", "First Name", "Middle Name", "DOB", "Sex", "Race", "OLN / DL", "SSN", "Reason", "Status", "Firearm Flag", "Banned By", "Ban Date", "Location"]
      const data = runnerRows.map(r => {
        const w = r.raw || {}
        return [w.last_name || "", w.first_name || "", w.middle_name || "", w.dob || "", w.sex || "", w.race || "",
          w.oln || "", w.ssn || "", w.reason || "", w.status || "", w.firearm_flag ? "Yes" : "", w.banned_by || "", w.ban_date || "", communityLabel]
      })
      const csv = [header, ...data].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
      const blob = new Blob([csv], { type: "text/csv" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a"); a.href = url
      a.download = `barred-persons-${communityLabel.replace(/\s+/g, "-").toLowerCase() || "community"}.csv`
      a.click(); URL.revokeObjectURL(url)
      return
    }
    // Unit History gets location-first columns for sorting/filtering in Excel.
    if (runnerType === "unithistory") {
      const header = ["Building", "Apartment", "Location", "HOH", "Type", "Detail", "Date", "Reliant #", "HPD #", "ASG #", "Source", "Community"]
      const data = runnerRows.map(r => {
        const u = r.raw || {}
        return [u.building || "", u.apartment || "", [u.building, u.apartment].filter(Boolean).join("-"), u.hoh_name || "",
          u.record_type || "", u.detail || "", r.date || "", u.reliant_case_no || "", u.hpd_report_no || "", u.asg_report_no || "", u.record_source || "", communityLabel]
      })
      const csv = [header, ...data].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
      const blob = new Blob([csv], { type: "text/csv" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a"); a.href = url
      a.download = `unit-history-${communityLabel.replace(/\s+/g, "-").toLowerCase() || "community"}.csv`
      a.click(); URL.revokeObjectURL(url)
      return
    }
    const header = ["Date", "Type", "Details", "Officer", "Community", "ID"]
    const data = runnerRows.map(r => [r.date, r.typeLabel, r.summary, r.officer, communityLabel, r.id])
    const csv = [header, ...data].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a"); a.href = url
    a.download = `report-runner-${communityLabel.replace(/\s+/g, "-").toLowerCase()}-${dateFrom}-to-${dateTo}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  function printRunnerReport() {
    const communityLabel = communities.find(c => c.id === rptCommunity)?.name || ""
    // Barred-persons roster prints as a person-detail table for client delivery.
    if (runnerType === "watchlist") {
      const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      const html = `<!DOCTYPE html><html><head><title>Barred Persons — ${esc(communityLabel)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}h1{font-size:16px;margin-bottom:4px}.meta{color:#666;font-size:11px;margin-bottom:16px}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;text-align:left;padding:6px 8px;font-size:11px;border-bottom:2px solid #d1d5db}td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:11px}</style>
</head><body>
<h1>Barred Persons — ${esc(communityLabel)}</h1>
<div class="meta">${runnerRows.length} person${runnerRows.length !== 1 ? "s" : ""} · Printed ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
<table><thead><tr><th>Name</th><th>DOB</th><th>Sex</th><th>Race</th><th>Reason</th><th>Status</th><th>Banned By</th><th>Ban Date</th></tr></thead><tbody>
${runnerRows.map(r => { const w = r.raw || {}; const nm = [w.first_name, w.middle_name, w.last_name].filter(Boolean).join(" ")
  return `<tr><td>${esc(nm) || "—"}${w.firearm_flag ? " 🔫" : ""}</td><td>${esc(w.dob) || "—"}</td><td>${esc(w.sex) || "—"}</td><td>${esc(w.race) || "—"}</td><td>${esc(w.reason) || "—"}</td><td>${esc(w.status) || "—"}</td><td>${esc(w.banned_by) || "—"}</td><td>${esc(w.ban_date) || "—"}</td></tr>` }).join("\n")}
</tbody></table></body></html>`
      const w = window.open("", "_blank")
      if (w) { w.document.write(html); w.document.close(); w.print() }
      return
    }
    // Unit History prints as a location-sorted activity table.
    if (runnerType === "unithistory") {
      const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      const html = `<!DOCTYPE html><html><head><title>Unit History — ${esc(communityLabel)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}h1{font-size:16px;margin-bottom:4px}.meta{color:#666;font-size:11px;margin-bottom:16px}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;text-align:left;padding:6px 8px;font-size:11px;border-bottom:2px solid #d1d5db}td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:11px}</style>
</head><body>
<h1>Unit History — ${esc(communityLabel)}</h1>
<div class="meta">${runnerRows.length} record${runnerRows.length !== 1 ? "s" : ""} · Sorted by ${uhSort} · Printed ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
<table><thead><tr><th>Location</th><th>HOH</th><th>Type</th><th>Detail</th><th>Date</th></tr></thead><tbody>
${runnerRows.map(r => { const u = r.raw || {}; const loc = [u.building, u.apartment].filter(Boolean).join("-") || "—"
  return `<tr><td>${esc(loc)}</td><td>${esc(u.hoh_name) || "—"}</td><td>${esc(u.record_type) || "—"}</td><td>${esc(u.detail) || "—"}</td><td>${esc(r.date) || "—"}</td></tr>` }).join("\n")}
</tbody></table></body></html>`
      const w = window.open("", "_blank")
      if (w) { w.document.write(html); w.document.close(); w.print() }
      return
    }
    const typeLabel = runnerType === "all" ? "All Report Types" : (REPORT_TYPES.find(rt => rt.key === runnerType)?.label || runnerType)
    const html = `<!DOCTYPE html><html><head><title>Report Summary — ${communityLabel}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}h1{font-size:16px;margin-bottom:4px}.meta{color:#666;font-size:11px;margin-bottom:16px}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;text-align:left;padding:6px 8px;font-size:11px;border-bottom:2px solid #d1d5db}td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:11px}.badge{font-size:10px;font-weight:bold;text-transform:uppercase;white-space:nowrap}</style>
</head><body>
<h1>Report Summary — ${communityLabel}</h1>
<div class="meta">${typeLabel} · ${dateFrom} to ${dateTo} · ${runnerRows.length} record${runnerRows.length !== 1 ? "s" : ""} · Printed ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
<table><thead><tr><th>Date</th><th>Type</th><th>Details</th><th>Officer</th></tr></thead><tbody>
${runnerRows.map(r => `<tr><td>${r.date || "—"}</td><td class="badge">${r.typeLabel}</td><td>${r.summary}</td><td>${r.officer}</td></tr>`).join("\n")}
</tbody></table></body></html>`
    const w = window.open("", "_blank")
    if (w) { w.document.write(html); w.document.close(); w.print() }
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
      displayPlate(p.plate), isNoPlate(p.plate || "") ? "" : (p.state || ""),
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

  function exportLeaseViolationsCSV() {
    const header = ["Date", "Bldg", "Apt", "HOH", "Category", "Type", "Notice Level",
      "Distribution", "LVL Posted", "HOH Ack", "Source", "Reliant #", "HPD #", "ASG #",
      "Offenders", "Ban Hits", "Issued By"]
    const rows = leaseViols.map(v => {
      const offs = v._offenders || []
      return [
        v.date || "", v.building || "", v.apartment || "", v.hoh_name || "",
        v.violation_category || "", v.violation_type || "", v.notice_level || "",
        v.distribution_method || "", v.lvl_posted_date || "",
        v.hoh_ack ? "Yes" : "", v.record_source || "",
        v.reliant_case_no || "", v.hpd_report_no || "", v.asg_report_no || "",
        offs.map((o: any) => o.name).filter(Boolean).join("; "),
        offs.filter((o: any) => o.ban_match).map((o: any) => o.name).filter(Boolean).join("; "),
        v.issued_by || "",
      ]
    })
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `lease-violations-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // A visitor registration is expired when its pass end date has passed.
  // Resident registrations don't expire.
  function regExpired(v: any): boolean {
    return v.kind === "visitor" && !!v.valid_to && v.valid_to < todayStr()
  }

  function exportRegistryCSV() {
    const header = ["Kind", "Plate", "State", "Make", "Model", "Color", "Year",
      "Resident/Sponsor", "Unit", "Permit/Pass #", "Valid From", "Valid To", "Status"]
    const rows = filteredRegistry.map(v => [
      v.kind || "",
      displayPlate(v.plate), isNoPlate(v.plate || "") ? "" : (v.plate_state || ""),
      v.make || "", v.model || "", v.color || "", v.year || "",
      v.kind === "visitor" ? (v.sponsor_resident || "") : (v.resident_name || ""),
      v.unit || "",
      v.kind === "visitor" ? (v.visitor_pass || "") : (v.permit_number || ""),
      v.valid_from || "", v.valid_to || "",
      regExpired(v) ? "EXPIRED" : "Active",
    ])
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `vehicle-registry-${(communityName || "community").replace(/\s+/g, "-").toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const todayEntries = visits.filter(v => new Date(utc(v.created_at)).toLocaleDateString("en-CA") === todayStr()).length
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

  // Registry filtered by kind toggle + free-text search (plate or any name field).
  const filteredRegistry = registry.filter(v => {
    if (regKind !== "all" && v.kind !== regKind) return false
    const q = regSearch.trim().toLowerCase()
    if (!q) return true
    return [v.plate, v.resident_name, v.sponsor_resident, v.unit, v.permit_number,
            v.visitor_pass, v.make, v.model, v.color]
      .some(f => (f || "").toString().toLowerCase().includes(q))
  })

  function applyPreset(p: DatePreset) {
    setDateFrom(p.from())
    setDateTo(p.to())
  }
  const isPresetActive = (p: DatePreset) => dateFrom === p.from() && dateTo === p.to()

  return (
    <main className="p-5 max-w-6xl">

      {/* PAGE HEADER */}
      <h1 className="text-2xl font-bold mb-5">Reports & Analytics</h1>

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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Report Type</label>
            <select value={topTypeFilter} onChange={e => setTopTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
              <option value="all">All Types</option>
              {REPORT_TYPES.map(rt => (
                <option key={rt.key} value={rt.key}>{rt.label}</option>
              ))}
            </select>
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

      {/* TAB BAR */}
      <div className="flex gap-0.5 mb-6 border-b border-gray-200">
        {([
          { key: "reports",  label: "Reports",          icon: "📋" },
          { key: "activity", label: "Visitor Activity",  icon: "📊" },
          { key: "registry", label: "Registry",           icon: "🚗" },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); if (tab.key === "activity") window.scrollTo({ top: 0, behavior: "smooth" }) }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === tab.key
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300 bg-transparent"
            }`}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.key === "reports" && canApprove && queue.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full leading-none">{queue.length}</span>
            )}
            {tab.key === "activity" && todayEntries > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full leading-none">{todayEntries}</span>
            )}
          </button>
        ))}
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

      {/* ── REPORT RUNNER ── */}
      {activeTab === "reports" && communities.length > 0 && (
        <Section label="Report Runner">
          {communityName && (
            <div className="text-xs text-gray-400 mb-4">
              Showing results for <span className="font-semibold text-gray-700">{communityName}</span> · {dateFrom} to {dateTo}. Use the filter bar above to change community or date range.
            </div>
          )}

          {/* Monthly Reports quick-links */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Link href="/vms/reports/gate-checklist-report"
              className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm hover:border-slate-400 transition-all group">
              <span className="text-xl">📋</span>
              <div>
                <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">Gate Checklist Monthly Report</div>
                <div className="text-xs text-gray-400">Full gate-by-gate detail by location · Print / PDF</div>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => {
                if (!rptCommunity) return
                setRunnerType("unithistory"); setUhSort("location")
                setRunnerLoading(true); setRunnerRan(false); setRunnerRows([])
                runUnitHistory("location")
              }}
              disabled={!rptCommunity}
              className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm hover:border-slate-400 transition-all group text-left cursor-pointer disabled:opacity-40 border-solid">
              <span className="text-xl">🏢</span>
              <div>
                <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">Unit History Report</div>
                <div className="text-xs text-gray-400">Complete unit history by location · sortable · CSV / Print</div>
              </div>
            </button>

            {canApprove && (
              <button
                type="button"
                onClick={() => runAiSummary()}
                disabled={!rptCommunity}
                className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm hover:border-indigo-400 transition-all group text-left cursor-pointer disabled:opacity-40 border-solid">
                <span className="text-xl">🧠</span>
                <div>
                  <div className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700">
                    AI Summary <span className="text-[9px] uppercase tracking-wide bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full align-middle">Beta</span>
                  </div>
                  <div className="text-xs text-gray-400">AI review of all activity · concerns &amp; follow-ups · {dateFrom} to {dateTo}</div>
                </div>
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div className="flex flex-col gap-1 w-52">
              <label className="text-xs font-semibold text-gray-500">Report Type</label>
              <select value={runnerType} onChange={e => { setRunnerType(e.target.value); setRunnerRan(false) }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
                <option value="all">All types</option>
                {REPORT_TYPES.map(rt => <option key={rt.key} value={rt.key}>{rt.label}</option>)}
                <option value="watchlist">Watchlist (Barred Persons)</option>
                <option value="unithistory">Unit History</option>
              </select>
            </div>
            {runnerType === "unithistory" && runnerRan && runnerRows.length > 0 && (
              <div className="flex flex-col gap-1 w-40">
                <label className="text-xs font-semibold text-gray-500">Sort by</label>
                <select value={uhSort} onChange={e => { const k = e.target.value as "location" | "date" | "type"; setUhSort(k); setRunnerRows(prev => sortUnitHistory(prev, k)) }}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
                  <option value="location">Location</option>
                  <option value="date">Date</option>
                  <option value="type">Type</option>
                </select>
              </div>
            )}
            <button
              onClick={runReport}
              disabled={!rptCommunity || runnerLoading}
              className="px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 border-none cursor-pointer disabled:opacity-40"
            >
              {runnerLoading ? "Running…" : "▶ Run Report"}
            </button>
            {runnerRan && runnerRows.length > 0 && (
              <>
                <button onClick={exportRunnerCSV}
                  className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 border-none cursor-pointer">
                  ⬇ Export CSV
                </button>
                <button onClick={printRunnerReport}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 cursor-pointer">
                  🖨 Print
                </button>
              </>
            )}
          </div>

          {/* Results */}
          {runnerLoading && <div className="text-gray-400 text-sm animate-pulse py-6">Running report…</div>}

          {runnerRan && !runnerLoading && (
            runnerRows.length === 0 ? (
              <div className="text-gray-400 text-sm py-8 text-center bg-white border border-gray-200 rounded-xl">
                {runnerType === "watchlist"
                  ? "No barred persons on file for this community."
                  : runnerType === "unithistory"
                  ? "No unit history on file for this community."
                  : "No reports found for this community + date range."}
              </div>
            ) : (
              <>
                <div className="text-xs text-gray-500 mb-2 font-semibold">
                  {runnerRows.length} {runnerType === "watchlist" ? `barred person${runnerRows.length !== 1 ? "s" : ""}` : runnerType === "unithistory" ? `unit-activity record${runnerRows.length !== 1 ? "s" : ""}` : `record${runnerRows.length !== 1 ? "s" : ""}`} ·&nbsp;
                  {communities.find(c => c.id === rptCommunity)?.name}
                  {runnerType !== "watchlist" && runnerType !== "unithistory" && <>&nbsp;· {dateFrom} to {dateTo}</>}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {runnerRows.map((r, i) => {
                    return (
                      <div key={`${r.typeKey}:${r.id}`}
                        className={`flex items-center gap-3 px-4 py-3 ${i < runnerRows.length - 1 ? "border-b border-gray-100" : ""}`}>
                        <div className="text-xs text-gray-400 w-20 flex-shrink-0 font-mono">{r.date || "—"}</div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${SUB_BADGE[RUNNER_BADGE_KEY[r.typeKey]] || "bg-gray-100 text-gray-700"}`}>
                          {r.typeLabel}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-800 truncate">{r.summary}</div>
                          <div className="text-xs text-gray-400 truncate">{r.officer}</div>
                        </div>
                        {(r.typeKey === "watchlist" || r.slug) ? (
                          <Link href={r.typeKey === "watchlist" ? `/vms/intel/${r.id}` : `/vms/reports/${r.slug}/${r.id}`}
                            className="text-xs text-blue-700 hover:underline whitespace-nowrap font-medium flex-shrink-0">
                            View →
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-300 whitespace-nowrap flex-shrink-0">—</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          )}
        </Section>
      )}

      {/* ── REVIEW QUEUE (admin + supervisor) ── */}
      {activeTab === "reports" && canApprove && (
        <Section label={`Review Queue${queue.length > 0 ? ` (${queue.length} pending)` : ""}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-400">Reports awaiting supervisor approval before sending to the client</div>
            <button
              onClick={loadQueue}
              disabled={queueLoading}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50 border-solid"
            >
              {queueLoading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>

          {queueLoading ? (
            <div className="text-gray-400 text-sm animate-pulse py-4">Loading…</div>
          ) : queue.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
              No reports pending review.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {queue.map((q, i) => {
                const badge  = SUB_BADGE[q.report_type] || "bg-gray-100 text-gray-700"
                const comm   = communities.find(c => c.id === q.community_id)?.name || "—"
                const isRet  = q.status === "needs_revision"
                const msg    = queueMsg[q.id]
                return (
                  <div key={q.id} className={`${i < queue.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${badge}`}>
                        {q.report_type.replace(/_/g, " ")}
                      </span>
                      {isRet && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                          Revision Pending
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{q.summary || "—"}</div>
                        <div className="text-xs text-gray-500 truncate">{q.officer_name || q.submitted_by || "—"} · {comm}</div>
                        {isRet && q.revision_comment && (
                          <div className="text-xs text-amber-700 truncate mt-0.5">Officer note: {q.revision_comment}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-xs text-gray-400 text-right mr-1">
                          <div>{timeAgo(q.submitted_at)}</div>
                          <div className="text-[10px] text-gray-300">
                            {new Date(utc(q.submitted_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        </div>
                        <Link
                          href={`/vms/reports/${QUEUE_TYPE_SLUG[q.report_type] ?? q.report_type}/${q.report_id}`}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg whitespace-nowrap"
                        >
                          🔍 View
                        </Link>
                        <button
                          onClick={() => approveReport(q.id)}
                          disabled={approvingId === q.id}
                          className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded-lg border-none cursor-pointer disabled:opacity-50"
                        >
                          {approvingId === q.id ? "Sending…" : "✅ Approve & Send"}
                        </button>
                        <button
                          onClick={() => { setReturnId(returnId === q.id ? null : q.id); setReturnNotes("") }}
                          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold rounded-lg border-none cursor-pointer"
                        >
                          🔄 Return
                        </button>
                      </div>
                    </div>

                    {/* Approve result message */}
                    {msg && (
                      <div className={`px-4 pb-3 text-xs font-semibold ${msg.ok ? "text-green-700" : "text-red-700"}`}>
                        {msg.msg}
                      </div>
                    )}

                    {/* Return-for-revision inline form */}
                    {returnId === q.id && (
                      <div className="px-4 pb-4 pt-1 bg-amber-50 border-t border-amber-100">
                        <div className="text-xs font-semibold text-amber-800 mb-1">Return to officer with notes:</div>
                        <textarea
                          value={returnNotes}
                          onChange={e => setReturnNotes(e.target.value)}
                          placeholder="What needs to be corrected or added?"
                          className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                          rows={3}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => returnReport(q.id, returnNotes)}
                            disabled={returnSaving || !returnNotes.trim()}
                            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg border-none cursor-pointer disabled:opacity-50"
                          >
                            {returnSaving ? "Returning…" : "↩ Return for Revision"}
                          </button>
                          <button
                            onClick={() => { setReturnId(null); setReturnNotes("") }}
                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs rounded-lg cursor-pointer hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── RECENTLY APPROVED ── */}
      {canApprove && (
        <Section label={`Recently Approved${approved.length > 0 ? ` (${approved.length})` : ""}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-400">Reports reviewed and sent to the client (last 15)</div>
            <button
              onClick={loadApproved}
              disabled={approvedLoading}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50 border-solid"
            >
              {approvedLoading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>

          {approvedLoading ? (
            <div className="text-gray-400 text-sm animate-pulse py-4">Loading…</div>
          ) : approved.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
              No approved reports yet.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {(approvedExpanded ? approved : approved.slice(0, 3)).map((q, i, shown) => {
                const badge = SUB_BADGE[q.report_type] || "bg-gray-100 text-gray-700"
                const comm  = communities.find(c => c.id === q.community_id)?.name || "—"
                return (
                  <div key={q.id} className={`flex items-center gap-3 px-4 py-3 ${i < shown.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${badge}`}>
                      {q.report_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                      ✓ Sent
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{q.summary || "—"}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {q.officer_name || q.submitted_by || "—"} · {comm}
                        {q.reviewed_by && <> · Approved by {q.reviewed_by}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-xs text-gray-400 text-right mr-1">
                        <div>{q.reviewed_at ? timeAgo(q.reviewed_at) : "—"}</div>
                        <div className="text-[10px] text-gray-300">
                          {q.reviewed_at ? new Date(utc(q.reviewed_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                        </div>
                      </div>
                      <Link
                        href={`/vms/reports/${QUEUE_TYPE_SLUG[q.report_type] ?? q.report_type}/${q.report_id}`}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg whitespace-nowrap"
                      >
                        🔍 View
                      </Link>
                    </div>
                  </div>
                )
              })}
              {approved.length > 3 && (
                <button
                  onClick={() => setApprovedExpanded(v => !v)}
                  className="w-full px-4 py-2.5 text-xs font-semibold text-blue-700 hover:bg-gray-50 bg-white border-0 border-t border-gray-100 cursor-pointer text-center"
                >
                  {approvedExpanded ? "▲ Show less" : `▼ Show all ${approved.length}`}
                </button>
              )}
            </div>
          )}
        </Section>
      )}

      {/* ── RECENT SUBMISSIONS ── */}
      {activeTab === "reports" && (
      <Section label="Recent Report Submissions">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-gray-400">Latest reports filed across all communities (last 15)</div>
          <button
            onClick={loadRecentSubmissions}
            disabled={recentSubsLoading}
            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-50 border-solid"
          >
            {recentSubsLoading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
        {recentSubsLoading ? (
          <div className="text-gray-400 text-sm animate-pulse py-4">Loading…</div>
        ) : recentSubs.length === 0 ? (
          <div className="text-gray-400 text-sm py-6 text-center">No reports found.</div>
        ) : (
          <>
            {(() => {
              const filtered  = recentSubs.filter(s => topTypeFilter === "all" || s.typeKey === TOP_FILTER_TO_SUB_KEY[topTypeFilter])
              const pending   = filtered.filter(s => s.queueStatus === "pending" || s.queueStatus === "needs_revision")
              const submitted = filtered.filter(s => s.queueStatus !== "pending" && s.queueStatus !== "needs_revision")

              function SubRow({ s, i, arr, tint }: { s: SubmissionRow; i: number; arr: SubmissionRow[]; tint?: boolean }) {
                const badge = SUB_BADGE[s.typeKey] || "bg-gray-100 text-gray-700"
                const isNew = Date.now() - new Date(utc(s.created_at)).getTime() < 24 * 3600 * 1000
                const comm  = communities.find(c => c.id === s.community_id)?.name || "—"
                return (
                  <div className={`flex items-center gap-3 px-4 py-3 ${tint ? "bg-amber-50/60" : ""} ${i < arr.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${badge}`}>
                      {s.typeLabel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{s.summary}</div>
                      <div className="text-xs text-gray-500 truncate">{s.officer} · {comm}</div>
                      {s.queueStatus === "sent" && s.approvedBy && (
                        <div className="text-[10px] text-green-700 mt-0.5 truncate">
                          ✓ Approved by {s.approvedBy}{s.approvedAt ? ` · ${new Date(utc(s.approvedAt)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                        </div>
                      )}
                      {s.queueStatus === "needs_revision" && (
                        <div className="text-[10px] font-semibold text-orange-700 mt-0.5">↩ Returned — revision needed</div>
                      )}
                      {s.queueStatus === "pending" && (
                        <div className="text-[10px] text-amber-700 mt-0.5">Awaiting supervisor review</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isNew && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">New</span>
                      )}
                      <div className="text-xs text-gray-400 text-right">
                        <div>{timeAgo(s.created_at)}</div>
                        <div className="text-[10px] text-gray-300">
                          {new Date(utc(s.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                      </div>
                      <Link href={`/vms/reports/${SUB_TYPE_SLUG[s.typeKey]}/${s.id}`}
                        className="text-xs text-blue-700 hover:underline whitespace-nowrap font-medium">
                        View →
                      </Link>
                    </div>
                  </div>
                )
              }

              return (
                <>
                  {/* ── Awaiting Review (officers only — supervisors/admins use the Review Queue above) ── */}
                  {pending.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">⏳ Awaiting Review</span>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{pending.length}</span>
                      </div>
                      <div className="bg-white border border-amber-300 rounded-xl overflow-hidden">
                        {pending.map((s, i, arr) => <SubRow key={`${s.typeKey}:${s.id}`} s={s} i={i} arr={arr} tint />)}
                      </div>
                    </div>
                  )}

                  {/* ── Submitted ── */}
                  {submitted.length > 0 && (
                    <>
                      {pending.length > 0 && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Submitted</span>
                        </div>
                      )}
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        {submitted.slice(0, recentSubsExpanded ? submitted.length : 3).map((s, i, arr) => (
                          <SubRow key={`${s.typeKey}:${s.id}`} s={s} i={i} arr={arr} />
                        ))}
                      </div>
                      {submitted.length > 3 && (
                        <button onClick={() => setRecentSubsExpanded(e => !e)}
                          className="mt-2 w-full py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer bg-white">
                          {recentSubsExpanded ? "▲ Show less" : `▼ Show all ${submitted.length} submitted reports`}
                        </button>
                      )}
                    </>
                  )}
                </>
              )
            })()}
          </>
        )}
      </Section>
      )}

      {/* ── REPORTS BY COMMUNITY ── */}
      {activeTab === "reports" && communities.length > 0 && (
        <Section label="Reports by Community">
          {communityName && (
            <div className="mb-3 text-xs text-gray-500">
              Showing data for <span className="font-semibold text-gray-800">{communityName}</span> · {dateFrom} to {dateTo}. Use the filter bar above to change community or date range.
            </div>
          )}

          {rptCommunity && (
            rptSummaryLoading ? (
              <div className="text-gray-400 text-sm animate-pulse py-4">Loading…</div>
            ) : (
              <>
                {/* Summary cards — each is a link to expand inline detail */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                  {REPORT_TYPES.filter(rt => topTypeFilter === "all" || rt.key === topTypeFilter).map(rt => {
                    const count  = rptSummary[rt.key]
                    const isOpen = rptOpenDetail === rt.key
                    const clr    = RPT_COLORS[rt.color]
                    return (
                      <button key={rt.key}
                        onClick={() => toggleRptDetail(rt.key)}
                        disabled={count === 0}
                        className={`text-left border rounded-xl px-4 py-3 transition-all w-full ${
                          count === 0
                            ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200"
                            : isOpen
                              ? `${clr.open} shadow-sm cursor-pointer`
                              : `${clr.idle} hover:shadow-sm cursor-pointer`
                        }`}
                      >
                        <div className={`text-xs font-medium mb-1 ${count === 0 ? "text-gray-400" : clr.title}`}>{rt.label}</div>
                        <div className={`text-2xl font-bold leading-tight ${count === 0 ? "text-gray-400" : clr.val}`}>{count}</div>
                        {count > 0 && (
                          <div className="text-[10px] text-blue-600 mt-1 font-semibold underline">
                            {isOpen ? "▲ collapse" : "▼ view details"}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Inline detail panel */}
                {rptOpenDetail && (() => {
                  const rt = REPORT_TYPES.find(r => r.key === rptOpenDetail)!
                  const clr = RPT_COLORS[rt.color]
                  return (
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-2">
                      <div className={`px-4 py-2.5 border-b border-gray-100 flex items-center justify-between ${clr.idle}`}>
                        <span className={`text-sm font-semibold ${clr.title}`}>
                          {rt.label}
                          {!rptDetailLoading && <span className="ml-2 font-normal text-gray-500">({rptDetailRows.length} record{rptDetailRows.length !== 1 ? "s" : ""})</span>}
                        </span>
                        <button onClick={() => { setRptOpenDetail(null); setRptDetailRows([]) }}
                          className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer bg-transparent border-none">
                          ✕ Close
                        </button>
                      </div>

                      {rptDetailLoading ? (
                        <div className="px-4 py-6 text-gray-400 text-sm animate-pulse">Loading records…</div>
                      ) : rptDetailRows.length === 0 ? (
                        <div className="px-4 py-6 text-gray-400 text-sm text-center">No records found.</div>
                      ) : (
                        <div className="divide-y divide-gray-100 max-h-[480px] overflow-y-auto">
                          {rptDetailRows.map((row, i) => {
                            if (rptOpenDetail === "incidents") return (
                              <div key={row.id || i} className="px-4 py-3 flex items-start gap-4">
                                <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{row.date || "—"}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 truncate">{row.incident_type || row.violation_type || "—"}</div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {[row.building && row.apartment ? `${row.building} / ${row.apartment}` : (row.building || row.apartment || null), row.issued_by || row.officer_name].filter(Boolean).join(" · ") || "—"}
                                  </div>
                                  {row.description && <div className="text-xs text-gray-400 truncate mt-0.5">{row.description}</div>}
                                </div>
                                {row.lvl_issued && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full flex-shrink-0">LVL</span>}
                              </div>
                            )
                            if (rptOpenDetail === "fieldContacts") return (
                              <div key={row.id || i} className="px-4 py-3 flex items-start gap-4">
                                <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">
                                  {row.created_at ? new Date(utc(row.created_at)).toLocaleDateString("en-CA") : "—"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 truncate">{row.contact_name || row.subject_name || "—"}</div>
                                  <div className="text-xs text-gray-500 truncate">{row.officer_name || "—"}</div>
                                  {row.notes && <div className="text-xs text-gray-400 truncate mt-0.5">{row.notes}</div>}
                                </div>
                              </div>
                            )
                            if (rptOpenDetail === "vehicleFIs") return (
                              <div key={row.id || i} className="px-4 py-3 flex items-start gap-4">
                                <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{row.date || "—"}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 font-mono">{displayPlate(row.plate) || "—"}{row.state && !isNoPlate(row.plate || "") ? ` (${row.state})` : ""}</div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {[row.year, row.color, row.make, row.model].filter(Boolean).join(" ") || "—"}
                                  </div>
                                  <div className="text-xs text-gray-400 truncate">{row.officer_name || "—"}</div>
                                </div>
                                {row.notes && <div className="text-xs text-gray-400 max-w-[200px] truncate">{row.notes}</div>}
                              </div>
                            )
                            if (rptOpenDetail === "parking") return (
                              <div key={row.id || i} className="px-4 py-3 flex items-start gap-4">
                                <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{row.date || "—"}{row.time ? <><br />{row.time}</> : ""}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 font-mono">{displayPlate(row.plate) || "—"}{row.state && !isNoPlate(row.plate || "") ? ` (${row.state})` : ""}</div>
                                  <div className="text-xs text-gray-500 truncate">{row.violation_type || "—"}{row.location ? ` · ${row.location}` : ""}{row.space ? ` Space ${row.space}` : ""}</div>
                                  <div className="text-xs text-gray-400 truncate">{row.officer_name || "—"}</div>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                  {row.bolo_match    && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">BOLO</span>}
                                  {row.tow_requested && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">Tow</span>}
                                </div>
                              </div>
                            )
                            if (rptOpenDetail === "dailyLogs") return (
                              <div key={row.id || i} className="px-4 py-3 flex items-start gap-4">
                                <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{row.date || "—"}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 truncate">{row.officer_name || row.officer || "—"}</div>
                                  <div className="text-xs text-gray-500 truncate">{[row.shift, row.shift_times, row.log_type].filter(Boolean).join(" · ") || "—"}</div>
                                  {(row.narrative || row.notes) && <div className="text-xs text-gray-400 truncate mt-0.5">{row.narrative || row.notes}</div>}
                                </div>
                              </div>
                            )
                            if (rptOpenDetail === "maintenance") return (
                              <div key={row.id || i} className="px-4 py-3 flex items-start gap-4">
                                <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">
                                  {row.created_at ? new Date(utc(row.created_at)).toLocaleDateString("en-CA") : "—"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 truncate">{row.issue_type || "—"}</div>
                                  <div className="text-xs text-gray-500 truncate">{[row.location, row.reported_by].filter(Boolean).join(" · ") || "—"}</div>
                                  {row.description && <div className="text-xs text-gray-400 truncate mt-0.5">{row.description}</div>}
                                </div>
                              </div>
                            )
                            if (rptOpenDetail === "gateChecklists") return (
                              <div key={row.id || i} className="px-4 py-3 flex items-start gap-4">
                                <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{row.checklist_date || "—"}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 truncate">{row.guard_name || "—"}</div>
                                  <div className="text-xs text-gray-500 truncate">{row.shift || "—"}</div>
                                </div>
                              </div>
                            )
                            if (rptOpenDetail === "visitorLogs") return (
                              <div key={row.id || i} className="px-4 py-3 flex items-start gap-4">
                                <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">
                                  {row.created_at ? new Date(utc(row.created_at)).toLocaleDateString("en-CA") : "—"}
                                  <div>{row.created_at ? new Date(utc(row.created_at)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 truncate capitalize">
                                    {[row.dl_first_name || row.first_name, row.dl_last_name || row.last_name].filter(Boolean).join(" ") || "—"}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">
                                    <span className="capitalize">{row.person_type || "visitor"}</span>
                                    {row.unit_number ? ` · Unit ${row.unit_number}` : ""}
                                    {row.resident_name ? ` · Visiting: ${row.resident_name}` : ""}
                                    {row.status === "denied" && <span className="ml-1 text-red-600 font-semibold">· Denied</span>}
                                  </div>
                                </div>
                                <Link href={`/vms/reports/visitor-log/${row.id}`}
                                  className="text-xs text-indigo-700 hover:underline whitespace-nowrap font-medium flex-shrink-0">
                                  View →
                                </Link>
                              </div>
                            )
                            return null
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )
          )}
        </Section>
      )}

      {/* ── VISITOR ACTIVITY (per community) ── */}

      {activeTab === "activity" && hasData && (
        <>
          {/* ── ENTRY LOG ── */}
          <Section label={`Entry Log${
            entryLogSearch.trim()
              ? ` — ${filteredEntries.length} match${filteredEntries.length === 1 ? "" : "es"} of ${visits.length}`
              : visits.length > logLimit ? ` (showing ${logLimit} of ${visits.length})` : ` (${visits.length})`
          }`}>
            <div className="mb-3 flex gap-2 items-center">
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
              {hasData && (
                <button onClick={exportCSV}
                  className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-700 border-none cursor-pointer whitespace-nowrap ml-auto">
                  ⬇ Export CSV
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
                    <button
                      onClick={(e) => { e.stopPropagation(); window.location.href = `/vms/reports/visitor-log/${v.id}` }}
                      title="View entry details"
                      className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded border-none cursor-pointer whitespace-nowrap"
                    >
                      View
                    </button>
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

          {/* ── TRAFFIC BREAKDOWN + DAILY ACTIVITY ── */}
          <Section label="Traffic Breakdown">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-2">
                <StatCard title="Total"       value={stats.total}       accent="blue"
                  sub={deltaSub(stats.total, priorTotal, `${dayCount}d`)} />
                <StatCard title="Visitors"    value={stats.visitors}    accent="indigo" />
                <StatCard title="Deliveries"  value={stats.deliveries}  accent="sky" />
                <StatCard title="Contractors" value={stats.contractors} accent="violet" />
                <StatCard title="Employees"   value={stats.employees}   accent="emerald" />
                <StatCard title="Residents"   value={stats.residents}   accent="green" />
              </div>
              {/* Daily bar chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col justify-between">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Daily Activity</div>
                <div className="flex items-end gap-px flex-1" style={{ minHeight: "64px" }}>
                  {allDates.map(date => {
                    const count = stats.byDay[date] || 0
                    const pct   = (count / maxDayCount) * 100
                    const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
                    return (
                      <div key={date} title={`${label}: ${count}`}
                        className="flex flex-col items-center justify-end flex-1 min-w-0 h-full cursor-default group">
                        {count > 0 ? (
                          <div className="w-full rounded-sm bg-blue-700 transition-all group-hover:opacity-80"
                            style={{ height: `${Math.max(3, (pct / 100) * 56)}px` }} />
                        ) : (
                          <div className="w-full border-b border-dashed border-gray-300" style={{ height: "1px" }} />
                        )}
                      </div>
                    )
                  })}
                </div>
                {allDates.length <= 31 && (
                  <div className="flex gap-px mt-1">
                    {allDates.map(date => {
                      const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
                      return (
                        <div key={date} className="flex-1 min-w-0 text-center text-[7px] text-gray-400 leading-tight truncate">
                          {label}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="text-[10px] text-gray-400 mt-1.5">
                  Peak: <strong className="text-gray-600">{Object.entries(stats.byDay).sort((a,b) => b[1]-a[1])[0]
                    ? `${new Date(Object.entries(stats.byDay).sort((a,b) => b[1]-a[1])[0][0] + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${Object.entries(stats.byDay).sort((a,b) => b[1]-a[1])[0][1]})`
                    : "—"
                  }</strong>
                </div>
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

        </>
      )}

      {/* ── PARKING VIOLATIONS ── (own gate so it shows even with no visitor entries) */}
      {activeTab === "reports" && community && !loading && parking.length > 0 && (() => {
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
                    {displayPlate(p.plate) || "—"}{p.state && !isNoPlate(p.plate || "") ? ` (${p.state})` : ""}
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

      {/* ── LEASE VIOLATIONS ── (own gate; incident_reports with lvl_issued) */}
      {activeTab === "reports" && community && !loading && leaseViols.length > 0 && (() => {
        const byType = leaseViols.reduce((m: Record<string, number>, v) => {
          const k = v.violation_type || "Other"; m[k] = (m[k] || 0) + 1; return m
        }, {})
        const leaseComplianceCount = leaseViols.filter(v => v.violation_category === "lease_compliance").length
        const securityCount        = leaseViols.filter(v => v.violation_category === "security_community").length
        const banHits = leaseViols.filter(v => (v._offenders || []).some((o: any) => o.ban_match)).length
        return (
          <Section label={`Lease Violations (${leaseViols.length})`}>
            <div className="flex justify-end mb-3">
              <button onClick={exportLeaseViolationsCSV}
                className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-700 border-none cursor-pointer">
                ⬇ Export Lease Violations CSV
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard title="Violations"       value={leaseViols.length}     accent="amber"  sub={`${dayCount}d range`} />
              <StatCard title="Lease Compliance"  value={leaseComplianceCount} accent="red"    sub="lease/compliance issues" />
              <StatCard title="Security/Community" value={securityCount}       accent="orange" sub="security & community" />
              <StatCard title="Ban Hits"          value={banHits}             accent="red"    sub="offender matched ban list" />
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
              {leaseViols.map((v, i) => {
                const offs    = v._offenders || []
                const hasBan  = offs.some((o: any) => o.ban_match)
                const offNames = offs.map((o: any) => o.name).filter(Boolean).join(", ")
                const unit = [v.building, v.apartment].filter(Boolean).join(" / ") || "—"
                return (
                  <div key={v.id} className={`flex items-center gap-4 px-4 py-3 ${i < leaseViols.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <div className="font-mono font-semibold text-gray-800 w-28 flex-shrink-0 truncate">
                      {unit}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">
                        {v.violation_type || "—"}{v.notice_level ? ` · ${v.notice_level}` : ""}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {[v.hoh_name, v.violation_category].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {offNames && (
                        <div className="text-xs text-gray-400 truncate mt-0.5">{offNames}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {hasBan && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">⛔ Ban</span>}
                      {v.record_source && v.record_source !== "officer" && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-full capitalize">{v.record_source}</span>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-400 w-28 flex-shrink-0">
                      <div>{v.date}{v.time ? ` · ${v.time}` : ""}</div>
                      <div className="truncate">{v.issued_by || "—"}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )
      })()}

      {/* ── VEHICLE & VISITOR REGISTRY ── (own gate; current registry, not date-ranged) */}
      {activeTab === "registry" && community && !loading && registry.length > 0 && (() => {
        const residents = registry.filter(v => v.kind === "resident").length
        const visitors  = registry.filter(v => v.kind === "visitor").length
        const expired   = registry.filter(regExpired).length
        return (
          <Section label={`Vehicle & Visitor Registry (${registry.length})`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex gap-1.5">
                {(["all", "resident", "visitor"] as const).map(k => (
                  <button key={k} onClick={() => setRegKind(k)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                      regKind === k ? "bg-blue-800 text-white border-blue-800" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                    {k === "all" ? "All" : k === "resident" ? "Residents" : "Visitors"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input value={regSearch} onChange={e => setRegSearch(e.target.value)}
                  placeholder="Search plate or name…"
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 w-56" />
                <button onClick={exportRegistryCSV}
                  className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-700 border-none cursor-pointer whitespace-nowrap">
                  ⬇ Export CSV
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard title="Registered"  value={registry.length} accent="blue"    sub={communityName || "this community"} />
              <StatCard title="Residents"   value={residents}       accent="emerald" sub="permitted vehicles" />
              <StatCard title="Visitors"    value={visitors}        accent="violet"  sub="passes on file" />
              <StatCard title="Expired"     value={expired}         accent="red"     sub="visitor pass lapsed" />
            </div>

            {/* Registry table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    <th className="px-4 py-2 font-semibold">Plate</th>
                    <th className="px-4 py-2 font-semibold">Vehicle</th>
                    <th className="px-4 py-2 font-semibold">Kind</th>
                    <th className="px-4 py-2 font-semibold">Resident / Sponsor</th>
                    <th className="px-4 py-2 font-semibold">Permit / Pass</th>
                    <th className="px-4 py-2 font-semibold">Validity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistry.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">No vehicles match your filter.</td></tr>
                  )}
                  {filteredRegistry.map((v, i) => {
                    const exp = regExpired(v)
                    return (
                      <tr key={v.id} className={i < filteredRegistry.length - 1 ? "border-b border-gray-100" : ""}>
                        <td className="px-4 py-2.5 font-mono font-semibold text-gray-800 whitespace-nowrap">
                          {displayPlate(v.plate) || "—"}{v.plate_state && !isNoPlate(v.plate || "") ? ` (${v.plate_state})` : ""}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{[v.year, v.color, v.make, v.model].filter(Boolean).join(" ") || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${v.kind === "visitor" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {v.kind === "visitor" ? "Visitor" : "Resident"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          {(v.kind === "visitor" ? v.sponsor_resident : v.resident_name) || "—"}
                          {v.unit ? <span className="text-gray-400"> · Unit {v.unit}</span> : null}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{(v.kind === "visitor" ? v.visitor_pass : v.permit_number) || "—"}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {v.kind === "visitor"
                            ? (v.valid_to
                                ? <span className={exp ? "text-red-700 font-semibold" : "text-gray-600"}>
                                    {v.valid_from ? `${v.valid_from} → ` : "→ "}{v.valid_to}
                                    {exp && <span className="ml-1.5 px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">EXPIRED</span>}
                                  </span>
                                : <span className="text-gray-400">—</span>)
                            : <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )
      })()}

      {/* AI Summary modal */}
      {aiOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setAiOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-100">
              <div>
                <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  🧠 AI Operations Summary
                  <span className="text-[9px] uppercase tracking-wide bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Beta</span>
                </div>
                {aiMeta && <div className="text-xs text-gray-500 mt-0.5">{aiMeta.community} · {aiMeta.from} to {aiMeta.to} · {aiMeta.totalRecords} records</div>}
                {aiGenAt && !aiLoading && (
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {aiCached ? "Cached" : "Generated"} {new Date(aiGenAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{aiGenBy ? ` by ${aiGenBy}` : ""}
                  </div>
                )}
              </div>
              <button onClick={() => setAiOpen(false)} className="text-gray-400 hover:text-gray-700 bg-transparent border-none cursor-pointer text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-4">
              {aiLoading && <div className="py-10 text-center text-gray-500 text-sm animate-pulse">🧠 Analyzing all activity for this location…</div>}
              {aiError && !aiLoading && <div className="py-6 text-center text-red-600 text-sm">{aiError}</div>}
              {aiResult && !aiLoading && (
                <div className="space-y-4">
                  <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    ⚠ AI-generated from logged records — review before sharing with a client and verify each item against the source report.
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed">{aiResult.executive_summary}</p>

                  {aiResult.concerns?.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Concerns</div>
                      <div className="space-y-2">
                        {aiResult.concerns.map((c: any, i: number) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0 ${c.severity === "high" ? "bg-red-100 text-red-700" : c.severity === "medium" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>{c.severity}</span>
                            <div className="text-sm"><span className="font-semibold text-gray-800">{c.title}</span>{c.location && <span className="text-gray-500"> — {c.location}</span>}{c.detail && <div className="text-xs text-gray-500 mt-0.5">{c.detail}</div>}{renderSources(c.sources)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiResult.follow_ups?.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Follow-ups</div>
                      <ul className="space-y-1.5">
                        {aiResult.follow_ups.map((f: any, i: number) => (
                          <li key={i} className="text-sm text-gray-800">• <span className="font-medium">{f.title}</span>{f.location && <span className="text-gray-500"> — {f.location}</span>}{f.detail && <div className="text-xs text-gray-500 ml-3">{f.detail}</div>}<div className="ml-3">{renderSources(f.sources)}</div></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiResult.patterns?.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Patterns</div>
                      <ul className="space-y-1.5">
                        {aiResult.patterns.map((p: any, i: number) => (
                          <li key={i} className="text-sm text-gray-800">• <span className="font-medium">{p.title}</span>{p.detail && <div className="text-xs text-gray-500 ml-3">{p.detail}</div>}<div className="ml-3">{renderSources(p.sources)}</div></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiResult.recommendations?.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Recommendations</div>
                      <ul className="space-y-1.5">
                        {aiResult.recommendations.map((r: any, i: number) => (
                          <li key={i} className="text-sm text-gray-800">• {r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2">
              {aiResult && !aiLoading && (
                <>
                  <button onClick={() => runAiSummary(true)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 cursor-pointer mr-auto">🔄 Regenerate</button>
                  <button onClick={printAiSummary} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 cursor-pointer">🖨 Print / PDF</button>
                </>
              )}
              <button onClick={() => setAiOpen(false)} className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 border-none cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">{label}</div>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
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

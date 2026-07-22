"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Community, Unit, Resident } from "@/lib/types"
import CadTicker from "@/components/CadTicker"
import BoloTicker from "@/components/BoloTicker"
import { fireAlert } from "@/lib/alerts"
import { checkIsGuest } from "@/lib/admin"
import VisitorPhotoCapture from "@/components/VisitorPhotoCapture"
import { saveVisitorPhotos } from "@/lib/visitorPhotos"
import { sortUnits } from "@/lib/units"
import PassPrinterModal from "@/components/PassPrinterModal"

type MatchStatus = "none" | "verify" | "confirmed" | "cleared"

export default function VMSPage() {

  const router = useRouter()

  const [communities,    setCommunities]    = useState<Community[]>([])
  const [communityId,    setCommunityId]    = useState("")
  const [units,          setUnits]          = useState<Unit[]>([])
  const [unitId,         setUnitId]         = useState("")
  const [residents,      setResidents]      = useState<Resident[]>([])
  const [residentId,     setResidentId]     = useState("")

  const [visitorName,    setVisitorName]    = useState("")
  const [personType,     setPersonType]     = useState("Visitor")
  const [destination,    setDestination]    = useState("")

  const [matchStatus,    setMatchStatus]    = useState<MatchStatus>("none")
  const [boloHit,        setBoloHit]        = useState<any>(null)  // active BOLO match (non-blocking)
  const [possibleMatches,setPossibleMatches]= useState<any[]>([])
  const [selectedPerson, setSelectedPerson] = useState<any>(null)
  const [enteredDOB,     setEnteredDOB]     = useState("")

  const [resolvedName,   setResolvedName]   = useState("")
  const [alertMode,      setAlertMode]      = useState(false)
  const [statusMessage,  setStatusMessage]  = useState("")

  const [dob,            setDob]            = useState("")
  const [oln,            setOln]            = useState("")
  const [plate,          setPlate]          = useState("")
  const [showExtra,      setShowExtra]      = useState(false)

  const [isGuest,        setIsGuest]        = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState("")
  const [idPhotos,       setIdPhotos]       = useState<File[]>([])
  const [livePhotos,     setLivePhotos]     = useState<File[]>([])
  const [loadError,      setLoadError]      = useState("")
  const [confirmed,      setConfirmed]      = useState<{
    name: string; wasVerify: boolean
    logId: string | null; communityId: string | null; communityName: string
    personType: string; unitNumber: string | null; residentName: string | null; plate: string
  } | null>(null)
  const [showPasses,     setShowPasses]     = useState(false)

  const [todayStats, setTodayStats] = useState({ total: 0, visitors: 0, contractors: 0, deliveries: 0, employees: 0 })
  const [todayLogs,  setTodayLogs]  = useState<Array<{ first_name: string; last_name: string; person_type: string; unit_number: string | null; destination: string | null; created_at: string }>>([])

  // Guards against firing the watchlist-hit alert + denied_entries insert more
  // than once per BARRED confirmation (DOB input can re-fire on backspace/retype).
  const barredFiredRef = useRef(false)

  useEffect(() => {
    checkIsGuest().then(ok => setIsGuest(ok)).catch(() => setIsGuest(false))
  }, [])

  useEffect(() => {
    loadCommunities()
    const params = new URLSearchParams(window.location.search)
    const returned = params.get("return")
    if (returned) handleNameInput(returned)
    // Accept ?first=&last=&dob=&oln= from redirects (e.g. old /vms/manual links)
    const pFirst = params.get("first"), pLast = params.get("last")
    if (pFirst || pLast) handleNameInput(`${pFirst || ""} ${pLast || ""}`.trim())
    if (params.get("dob")) { setDob(params.get("dob")!); setShowExtra(true) }
    if (params.get("oln")) { setOln(params.get("oln")!); setShowExtra(true) }
  }, [])

  useEffect(() => {
    if (!confirmed) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Enter" && !showPasses) setConfirmed(null) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [confirmed, showPasses])

  // Intentionally no useEffect on residentId — resident selection records who is being visited,
  // not the visitor's own name

  // Persist current community so TopNav SOS button can include it in the
  // alert payload (TopNav has no community context of its own).
  function rememberCommunity(id: string, name: string) {
    if (typeof window === "undefined") return
    localStorage.setItem("asg-current-community-id",   id)
    localStorage.setItem("asg-current-community-name", name)
  }

  async function loadTodayLogs(commId: string) {
    if (!commId) return
    const today = new Date().toISOString().split("T")[0]
    const { data } = await supabase
      .from("visitor_logs")
      .select("first_name, last_name, person_type, unit_number, destination, created_at")
      .eq("community_id", commId)
      .gte("created_at", today + "T00:00:00")
      .order("created_at", { ascending: false })
      .limit(50)
    const entries = data || []
    setTodayLogs(entries)
    setTodayStats({
      total:       entries.length,
      visitors:    entries.filter(e => e.person_type?.toLowerCase() === "visitor").length,
      contractors: entries.filter(e => e.person_type?.toLowerCase() === "contractor").length,
      deliveries:  entries.filter(e => e.person_type?.toLowerCase().startsWith("delivery")).length,
      employees:   entries.filter(e => e.person_type?.toLowerCase() === "employee").length,
    })
  }

  async function loadCommunities() {
    const { data, error } = await supabase.from("communities").select("*")
    if (error) { setLoadError("Failed to load communities."); return }
    setCommunities(data || [])
    if (data?.length) {
      // Default to the location chosen at sign-on (confirm-location), mirrored
      // to localStorage. Fall back to St Luke then the first community. Don't
      // blindly select data[0] — that discarded the user's login location and
      // clobbered the shared key for every other page.
      const savedId    = typeof window !== "undefined" ? localStorage.getItem("asg-current-community-id") || "" : ""
      const savedMatch = data.find(c => c.id === savedId)
      const stLuke     = data.find(c => /st\.?\s*luke/i.test(c.name))
      const chosen     = savedMatch || stLuke || data[0]
      setCommunityId(chosen.id)
      rememberCommunity(chosen.id, chosen.name)
      loadUnits(chosen.id, data)
    }
  }

  // Reload today's log whenever the selected community changes
  useEffect(() => { loadTodayLogs(communityId) }, [communityId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUnits(commId: string, communityList?: Community[]) {
    setCommunityId(commId)
    const list = communityList ?? communities
    const c = list.find(x => x.id === commId)
    if (c) rememberCommunity(c.id, c.name)
    const { data, error } = await supabase
      .from("units").select("*").eq("community_id", commId).limit(5000)
    if (error) { setLoadError("Failed to load units."); return }
    setUnits(sortUnits(data || []))
  }

  async function loadResidents(rawUnitNumber: string) {
    const unitNumber = rawUnitNumber.trim()
    setUnitId(unitNumber)
    setLoadError("")
    if (!unitNumber) { setResidents([]); return }
    const { data, error } = await supabase
      .from("residents")
      .select("*")
      .eq("community_id", communityId)
      .eq("unit_number", unitNumber)
      .not("name", "is", null)
    if (error) { setLoadError("Failed to load residents."); return }
    setResidents(data || [])
  }

  function parseName(input: string) {
    input = input.toLowerCase().trim()
    if (input.includes(",")) {
      const [last, first] = input.split(",").map(s => s.trim())
      return { first, last }
    }
    const parts = input.split(" ").filter(Boolean)
    // For 3+ word names (e.g. "John Michael Smith"), take first word as first
    // and last word as last so the last name is never lost.
    return { first: parts[0] || "", last: parts[parts.length - 1] || "" }
  }

  async function runWatchlistCheck(first: string, last: string): Promise<any[]> {
    // OLN is most specific — check it first when the officer has the license
    if (oln.trim()) {
      const { data } = await supabase.from("watchlist").select("*").ilike("oln", oln.trim())
      if (data?.length) return data
    }
    if (!last) return []
    // Name + DOB — catches suffix mismatches the DB trigger also handles
    if (dob) {
      const { data } = await supabase.from("watchlist").select("*").ilike("last_name", last)
      const hits = (data || []).filter(p =>
        p.last_name?.toLowerCase() === last.toLowerCase() &&
        (!first || p.first_name?.toLowerCase().startsWith(first.toLowerCase())) &&
        p.dob === dob
      )
      if (hits.length) return hits
    }
    // Name only (original fallback)
    const { data } = await supabase.from("watchlist").select("*").ilike("last_name", last)
    if (!data) return []
    return data.filter(p =>
      p.last_name.toLowerCase() === last &&
      (!first || p.first_name.toLowerCase().startsWith(first))
    )
  }

  // Non-blocking BOLO check (BOLO stores a single full-name field).
  async function runBoloCheck(first: string, last: string): Promise<any | null> {
    if (oln.trim()) {
      const { data } = await supabase.from("bolos").select("*").eq("active", true).ilike("oln", oln.trim())
      if (data?.length) return data[0]
    }
    if (!last) return null
    const { data } = await supabase.from("bolos").select("*").eq("active", true).ilike("name", `%${last}%`)
    const hits = (data || []).filter((b: any) => {
      const n = (b.name || "").toLowerCase()
      return n.includes(last.toLowerCase()) && (!first || n.includes(first.toLowerCase()))
    })
    return hits[0] || null
  }

  // Re-run check when DOB or OLN changes (name already typed)
  useEffect(() => {
    if (!visitorName) return
    const { first, last } = parseName(visitorName)
    runBoloCheck(first, last).then(setBoloHit)
    runWatchlistCheck(first, last).then(matches => {
      if (matches.length === 0) {
        setResolvedName(`${first} ${last}`)
        setMatchStatus("cleared")
        setAlertMode(false)
        setStatusMessage("🟢 Visitor Cleared")
        setPossibleMatches([])
      } else {
        setPossibleMatches(matches)
        setMatchStatus("verify")
        setAlertMode(true)
        setStatusMessage("⚠️ Possible Watchlist Match")
      }
    })
  }, [dob, oln]) // eslint-disable-line react-hooks/exhaustive-deps

  async function validateDOB(inputDOB?: string, personOverride?: any) {
    const sp = personOverride ?? selectedPerson
    if (!sp?.dob) return
    const dbDOB   = String(sp.dob).slice(0, 10)
    const entered = inputDOB || enteredDOB
    if (entered === dbDOB) {
      setMatchStatus("confirmed")
      setAlertMode(true)
      setStatusMessage("🚨 BARRED PERSON — CONFIRMED")

      // Dedupe: only fire alert + log denied entry once per BARRED confirmation
      if (barredFiredRef.current) return
      barredFiredRef.current = true

      const communityName  = communities.find(c => c.id === communityId)?.name || "Unknown"
      const selectedRes    = residents.find(r => r.id === residentId)

      // 1. Audit: log denied entry to DB so the attempt is recorded even if
      //    the Teams alert is missed. Fire-and-forget.
      const { data: { user } } = await supabase.auth.getUser()
      supabase.from("denied_entries").insert({
        watchlist_id:   sp.id || null,
        first_name:     sp.first_name,
        last_name:      sp.last_name,
        dob:            dbDOB,
        oln:            sp.oln || null,
        community_id:   communityId || null,
        community_name: communityName,
        unit_number:    unitId || null,
        resident_name:  selectedRes?.name || null,
        guard_email:    user?.email || null,
        reason:         sp.reason || null,
        alert_sent:     true,
      }).then(({ error }) => {
        if (error) console.error("[denied_entries] insert failed:", error)
      })

      // 2. Real-time alert to Teams (fire-and-forget; UI must not block)
      fireAlert({
        type:         "watchlist_hit",
        severity:     "critical",
        community_id: communityId || null,
        subject:      `🚨 BARRED PERSON CONFIRMED — ${communityName}`,
        body:         `A confirmed watchlist match has occurred at ${communityName}. The check-in was blocked.`,
        payload: {
          Community:   communityName,
          Unit:        unitId || "—",
          Visitor:     `${sp.first_name} ${sp.last_name}`,
          DOB:         dbDOB,
          OLN:         sp.oln || "",
          Reason:      sp.reason || "",
          Comments:    sp.comments || "",
          BannedBy:    sp.banned_by || "",
          BanDate:     sp.ban_date || "",
          Time:        new Date().toLocaleString("en-US"),
        },
      })
    } else {
      setStatusMessage("⚠️ DOB Mismatch — Investigate")
      setMatchStatus("verify")
    }
  }

  function resetForm() {
    barredFiredRef.current = false
    setVisitorName("")
    setUnitId("")
    setResidentId("")
    setResidents([])
    setPersonType("Visitor")
    setDestination("")
    setMatchStatus("none")
    setBoloHit(null)
    setResolvedName("")
    setStatusMessage("")
    setAlertMode(false)
    setPossibleMatches([])
    setSelectedPerson(null)
    setEnteredDOB("")
    setSaveError("")
    setIdPhotos([]); setLivePhotos([])
    setDob(""); setOln(""); setPlate("")
    setShowExtra(false)
  }

  async function handleNameInput(input: string) {
    setVisitorName(input)
    const { first, last } = parseName(input)
    if (!last) { setBoloHit(null); return }
    runBoloCheck(first, last).then(setBoloHit)
    const matches = await runWatchlistCheck(first, last)
    if (matches.length === 0) {
      setResolvedName(`${first} ${last}`)
      setMatchStatus("cleared")
      setAlertMode(false)
      setStatusMessage("🟢 Visitor Cleared")
      return
    }
    setPossibleMatches(matches)
    setMatchStatus("verify")
    setAlertMode(true)
    setStatusMessage("⚠️ Possible Watchlist Match")
  }

  async function handleProceedCheckIn() {
    if (!visitorName) { alert("Enter visitor name"); return }
    setSaving(true)
    setSaveError("")
    try {
      const { first, last } = parseName(visitorName)
      const unitNumber = unitId || null

      let visitorId: string | null = null
      const { data: existing } = await supabase
        .from("visitors").select("id")
        .ilike("first_name", first).ilike("last_name", last)
        .limit(1).maybeSingle()

      if (existing) {
        visitorId = existing.id
      } else {
        const { data: created, error: createErr } = await supabase
          .from("visitors")
          .insert({ first_name: first, last_name: last, community_id: communityId || null, dob: dob || null, oln: oln || null })
          .select("id").single()
        if (createErr) { setSaveError("Failed to create visitor record."); return }
        visitorId = created.id
      }

      const selectedResident = residents.find(r => r.id === residentId)
      const { data: logRow, error } = await supabase.from("visitor_logs").insert({
        visitor_id:    visitorId,
        first_name:    first,
        last_name:     last,
        person_type:   personType,
        community_id:  communityId,
        unit_number:   unitNumber,
        resident_name: selectedResident?.name || null,
        destination:   destination || null,
        entry_method:   "checkin_manual",
        watchlist_hit:  matchStatus === "verify",
        dob:            dob || null,
        oln:            oln || null,
        vehicle_plate:  plate || null,
        created_at:    new Date().toISOString()
      }).select("id").single()

      if (error) { setSaveError("Check-in failed: " + error.message); return }

      // Attach any captured ID/Live photos to the person + this check-in.
      if (idPhotos.length || livePhotos.length) {
        const { data: { user } } = await supabase.auth.getUser()
        await saveVisitorPhotos(idPhotos, livePhotos, {
          visitorId:    visitorId as string,
          visitorLogId: (logRow as { id?: string } | null)?.id || null,
          communityId:  communityId || null,
          capturedBy:   user?.email || null,
        })
      }

      const displayName  = `${first} ${last}`.trim()
      const wasVerify    = matchStatus === "verify"
      supabase.auth.getUser().then(({ data: { user } }) => {
        supabase.from("audit_logs").insert({
          user_email: user?.email || "unknown",
          action: "created", resource_type: "Visitor Check-In", resource_id: "",
          detail: `${displayName} checked in — ${personType}${unitNumber ? ` · Unit ${unitNumber}` : ""}`,
          created_at: new Date().toISOString(),
        })
      })
      setConfirmed({
        name: displayName, wasVerify,
        logId: (logRow as { id?: string } | null)?.id || null,
        communityId: communityId || null,
        communityName: communities.find(c => c.id === communityId)?.name || "",
        personType,
        unitNumber: unitNumber || null,
        residentName: selectedResident?.name || null,
        plate: plate || "",
      })
      resetForm()
      loadTodayLogs(communityId)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"

  const checkInBtnCls = matchStatus === "confirmed"
    ? "w-full py-3 bg-red-700 text-white rounded-md text-sm font-bold border-none cursor-not-allowed opacity-60"
    : matchStatus === "cleared"
    ? "w-full py-3 bg-green-600 text-white rounded-md text-sm font-bold hover:bg-green-700 transition-colors border-none cursor-pointer disabled:opacity-50"
    : "w-full py-3 bg-blue-800 text-white rounded-md text-sm font-semibold hover:bg-blue-900 transition-colors border-none cursor-pointer disabled:opacity-50"

  const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1"

  return (
    <div className="p-4 sm:p-5 pb-16">
      <h2 className="text-2xl font-bold mb-5">Visitor Check-In</h2>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {loadError}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5 lg:gap-8">

        {/* ── LEFT: FORM ── */}
        <div className="w-full lg:max-w-xl flex flex-col gap-4">

          {/* SECTION 1: Location */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Location</div>
            <div>
              <label className={labelCls}>Location</label>
              <select value={communityId} onChange={(e) => loadUnits(e.target.value)} className={inputCls}>
                {communities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Destination</label>
              <select value={unitId} onChange={(e) => loadResidents(e.target.value)} className={inputCls}>
                <option value="">Select Destination</option>
                {units.map(u => (
                  <option key={u.id} value={u.unit_number.trim()}>{u.unit_number.trim()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Person Being Visited</label>
              <select value={residentId} onChange={(e) => setResidentId(e.target.value)} className={inputCls}>
                <option value="">Select Resident</option>
                {residents.map(r => (
                  <option key={r.id} value={r.id}>{r.name}{r.relationship ? ` (${r.relationship})` : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {/* SECTIONS 2 + 3: Visitor Identity and Log Entry side by side */}
          <div className="flex flex-col sm:flex-row gap-4">

            {/* SECTION 2: Visitor Identity */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Visitor Identity</div>
              <div>
                <label className={labelCls}>Visitor Name</label>
                <input
                  value={visitorName}
                  onChange={(e) => handleNameInput(e.target.value)}
                  placeholder="First Last  or  Last, First"
                  className={inputCls}
                  autoComplete="off"
                />
              </div>

              {/* No-ID expansion: DOB, license, plate for visitors without a scannable ID */}
              <button
                type="button"
                onClick={() => setShowExtra(v => !v)}
                className="text-xs text-blue-700 hover:text-blue-900 font-semibold text-left border-none bg-transparent cursor-pointer p-0 leading-none"
              >
                {showExtra ? "▾ Hide ID fields" : "▸ No ID to scan? Add DOB / License / Plate"}
              </button>
              {showExtra && (
                <div className="flex flex-col gap-2 border-t border-gray-100 pt-2">
                  <div>
                    <label className={labelCls}>Date of Birth</label>
                    <input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Driver License #</label>
                    <input value={oln} onChange={e => setOln(e.target.value)} placeholder="OLN / License #" className={inputCls} autoComplete="off" />
                  </div>
                  <div>
                    <label className={labelCls}>Vehicle Plate</label>
                    <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="Plate number" className={inputCls} autoComplete="off" />
                  </div>
                </div>
              )}

              <button
                onClick={() => router.push("/vms/scan")}
                className="w-full py-2 bg-gray-800 text-white rounded-md text-sm font-medium hover:bg-gray-900 transition-colors border-none cursor-pointer"
              >
                📷 Scan Driver License Instead
              </button>
            </div>

            {/* SECTION 3: Classification + Submit */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Log Entry</div>
              <div>
                <label className={labelCls}>Person Type</label>
                <select value={personType} onChange={(e) => setPersonType(e.target.value)} className={inputCls}>
                  <option>Visitor</option>
                  <option>Delivery</option>
                  <option>Contractor</option>
                  <option>Employee</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Destination <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="e.g. Leasing office, Pool, Unit 4B…"
                  className={inputCls}
                />
              </div>

              {!isGuest && (
                <VisitorPhotoCapture idFiles={idPhotos} liveFiles={livePhotos} setIdFiles={setIdPhotos} setLiveFiles={setLivePhotos} />
              )}

              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-xs">
                  {saveError}
                </div>
              )}

              {isGuest ? (
                <div className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg text-center font-medium">
                  👁 View-only access — check-in is disabled for guest accounts.
                </div>
              ) : (
                <button
                  onClick={matchStatus === "confirmed" ? undefined : handleProceedCheckIn}
                  disabled={saving || matchStatus === "confirmed"}
                  className={checkInBtnCls}
                >
                  {saving ? "Saving..." : matchStatus === "confirmed" ? "🚫 ENTRY DENIED — BARRED" : "✅ Proceed Check-In"}
                </button>
              )}
              {matchStatus === "confirmed" && (
                <>
                  <div className="text-xs text-red-600 text-center font-medium">Contact supervisor before proceeding</div>
                  <button
                    onClick={resetForm}
                    className="w-full py-2 mt-1 bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer transition-colors"
                  >
                    ✓ Acknowledge & Clear — Next Visitor
                  </button>
                </>
              )}
            </div>

          </div>

        </div>

        {/* ── RIGHT: STATUS PANEL ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">

          {/* Today's entry stats */}
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { label: "Total",       value: todayStats.total,       cls: "text-blue-400   border-blue-900"   },
              { label: "Visitors",    value: todayStats.visitors,    cls: "text-indigo-400 border-indigo-900" },
              { label: "Contractors", value: todayStats.contractors, cls: "text-violet-400 border-violet-900" },
              { label: "Deliveries",  value: todayStats.deliveries,  cls: "text-sky-400    border-sky-900"    },
              { label: "Employees",   value: todayStats.employees,   cls: "text-emerald-400 border-emerald-900" },
            ].map(s => (
              <div key={s.label} className={`bg-gray-900 border rounded-lg px-2 py-2 text-center ${s.cls}`}>
                <div className="text-xl font-bold leading-tight">{s.value}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          {confirmed ? (
            /* Confirmation panel */
            <div className={`flex flex-col items-center justify-center gap-4 border-2 rounded-xl px-6 py-10 text-white text-center ${confirmed.wasVerify ? "bg-yellow-900 border-yellow-500" : "bg-green-900 border-green-500"}`}>
              <div className="text-3xl font-bold tracking-wide">✅ VISITOR LOGGED</div>
              <div className="text-xl font-semibold">{confirmed.name}</div>
              <div className={`text-lg font-bold ${confirmed.wasVerify ? "text-yellow-300" : "text-green-300"}`}>
                {confirmed.wasVerify ? "⚠️ POSSIBLE MATCH — VERIFY IDENTITY" : "🟢 CLEAR"}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => setShowPasses(true)}
                  className="px-6 py-2 bg-white/10 border border-white/40 text-white rounded-md font-semibold cursor-pointer text-sm hover:bg-white/20"
                >
                  🖨 Print Pass
                </button>
                <button
                  onClick={() => setConfirmed(null)}
                  className={`px-8 py-2 text-white rounded-md font-semibold border-none cursor-pointer text-sm transition-colors ${confirmed.wasVerify ? "bg-yellow-700 hover:bg-yellow-600" : "bg-green-600 hover:bg-green-500"}`}
                >
                  ENTER — Continue
                </button>
              </div>
              <div className={`text-xs ${confirmed.wasVerify ? "text-yellow-400" : "text-green-400"}`}>Press Enter or click to log next visitor</div>
            </div>
          ) : (
            <>
              {/* Status box */}
              <div className={`px-4 py-3 rounded-xl font-medium ${
                alertMode
                  ? "bg-red-900 border-2 border-red-500 text-white"
                  : matchStatus === "cleared"
                  ? "bg-green-950 border-2 border-green-600 text-white"
                  : "bg-gray-900 border border-gray-700 text-white"
              }`}>
                <div className="text-lg font-semibold">{resolvedName || visitorName || "Awaiting visitor name…"}</div>
                {statusMessage && <div className="text-sm mt-1 font-medium">{statusMessage}</div>}
              </div>

              {/* BOLO — non-blocking; shown alongside cleared/verify status */}
              {boloHit && (
                <div className="px-4 py-3 rounded-xl bg-amber-500 border-2 border-amber-600 text-white">
                  <div className="text-base font-bold">⚠ BOLO — Be On the Lookout</div>
                  {boloHit.name && <div className="text-sm mt-0.5 font-semibold">{boloHit.name}</div>}
                  {(boloHit.reason || boloHit.description) && (
                    <div className="text-amber-50 text-xs mt-1">{boloHit.reason || boloHit.description}</div>
                  )}
                  {boloHit.firearm_flag && <div className="mt-1.5 inline-block px-2 py-0.5 bg-red-700 rounded text-xs font-bold">🔫 Firearm</div>}
                  <div className="text-amber-100 text-xs mt-1.5">Not barred — entry allowed. Notify a supervisor and stay alert.</div>
                </div>
              )}

              {/* Watchlist match panel */}
              {matchStatus === "verify" && (
                <div className="bg-gray-900 text-white rounded-xl p-4">
                  <div className="text-sm font-bold mb-3 text-yellow-400">⚠ Possible Watchlist Match — Verify Identity</div>
                  {possibleMatches.map(p => (
                    <div key={p.id} className="bg-gray-800 rounded-lg p-3 mb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-white">{p.first_name} {p.last_name}
                            <span className="text-red-400 ml-2 text-xs">🚨 BARRED</span>
                          </div>
                          {p.dob && <div className="text-xs text-gray-400 mt-0.5">DOB: {p.dob}</div>}
                          {(p.reason) && (
                            <div className="text-xs text-orange-300 mt-1 font-medium">Reason: {p.reason}</div>
                          )}
                          {(p.comments || p.notes) && (
                            <div className="text-xs text-gray-400 mt-1 max-w-sm">Notes: {p.comments || p.notes}</div>
                          )}
                          {p.banned_by && (
                            <div className="text-xs text-gray-500 mt-0.5">Banned by: {p.banned_by}</div>
                          )}
                          {p.ban_date && (
                            <div className="text-xs text-gray-500">Ban date: {p.ban_date}</div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedPerson(p)
                            // If DOB was already entered in the identity section, pre-fill
                            // the confirmation field and auto-validate immediately.
                            // Pass p directly to avoid the stale-closure issue with selectedPerson state.
                            if (dob) { setEnteredDOB(dob); validateDOB(dob, p) }
                          }}
                          className="text-xs px-3 py-1 bg-blue-700 rounded hover:bg-blue-600 border-none cursor-pointer text-white shrink-0 ml-3"
                        >
                          Select
                        </button>
                      </div>

                      {selectedPerson?.id === p.id && (
                        <div className="mt-3 flex flex-col gap-2 border-t border-gray-700 pt-3">
                          <label className="text-xs text-gray-400 font-semibold">Verify DOB</label>
                          <input
                            type="date"
                            value={enteredDOB}
                            onChange={(e) => {
                              const v = e.target.value
                              setEnteredDOB(v)
                              if (v.length === 10) validateDOB(v, p)
                            }}
                            className="px-2 py-1.5 rounded border border-gray-600 bg-gray-700 text-white text-sm focus:outline-none"
                          />
                          {statusMessage.includes("Mismatch") && (
                            <button
                              onClick={() => window.location.href = `/vms/intel?search=${encodeURIComponent(`${p.first_name} ${p.last_name}`)}`}
                              className="text-xs px-3 py-1.5 bg-yellow-700 rounded hover:bg-yellow-600 border-none cursor-pointer text-white"
                            >
                              🔎 Investigate in Intel Terminal
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Today's visitor log */}
              {matchStatus === "none" && (
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                    Today's Entries{todayLogs.length > 0 ? ` — ${todayLogs.length}` : ""}
                  </div>
                  {todayLogs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <div className="text-4xl mb-3">🛂</div>
                      <div className="text-sm">Enter a visitor name or scan a license to begin</div>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
                      {todayLogs.map((e, i) => {
                        const typeColors: Record<string, string> = {
                          visitor:    "text-blue-400",
                          contractor: "text-violet-400",
                          delivery:   "text-sky-400",
                          employee:   "text-emerald-400",
                        }
                        const tColor = typeColors[e.person_type?.toLowerCase()] || "text-gray-400"
                        const ts = e.created_at.endsWith("Z") || e.created_at.includes("+") ? e.created_at : e.created_at + "Z"
                        const t = new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                        const intelHref = `/vms/intel?search=${encodeURIComponent(`${e.first_name} ${e.last_name}`)}`
                        return (
                          <div key={i} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                            <div>
                              <Link href={intelHref} className="text-sm font-semibold text-white hover:text-blue-300 transition-colors">
                                {e.first_name} {e.last_name}
                              </Link>
                              <div className={`text-xs ${tColor}`}>{e.person_type}{e.unit_number ? ` · Unit ${e.unit_number}` : ""}{e.destination ? ` · ${e.destination}` : ""}</div>
                            </div>
                            <div className="text-xs text-gray-500 shrink-0 ml-3">{t}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      <BoloTicker communityId={communityId} />
      <CadTicker />

      <PassPrinterModal
        open={showPasses}
        onClose={() => setShowPasses(false)}
        communityId={confirmed?.communityId ?? null}
        communityName={confirmed?.communityName ?? ""}
        visitorName={confirmed?.name ?? ""}
        personType={confirmed?.personType ?? "Visitor"}
        unitNumber={confirmed?.unitNumber ?? null}
        residentName={confirmed?.residentName ?? null}
        visitorLogId={confirmed?.logId ?? null}
        defaultPlate={confirmed?.plate ?? ""}
      />
    </div>
  )
}

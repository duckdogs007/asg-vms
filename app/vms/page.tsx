"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Community, Unit, Resident } from "@/lib/types"
import CadTicker from "@/components/CadTicker"
import { fireAlert } from "@/lib/alerts"

type MatchStatus = "none" | "verify" | "confirmed" | "cleared"

interface RecentEntry {
  name: string
  unit: string
  type: string
  time: string
}

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

  const [matchStatus,    setMatchStatus]    = useState<MatchStatus>("none")
  const [possibleMatches,setPossibleMatches]= useState<any[]>([])
  const [selectedPerson, setSelectedPerson] = useState<any>(null)
  const [enteredDOB,     setEnteredDOB]     = useState("")

  const [resolvedName,   setResolvedName]   = useState("")
  const [alertMode,      setAlertMode]      = useState(false)
  const [statusMessage,  setStatusMessage]  = useState("")

  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState("")
  const [loadError,      setLoadError]      = useState("")
  const [confirmed,      setConfirmed]      = useState<string | null>(null)
  const [recentEntries,  setRecentEntries]  = useState<RecentEntry[]>([])

  // Guards against firing the watchlist-hit alert + denied_entries insert more
  // than once per BARRED confirmation (DOB input can re-fire on backspace/retype).
  const barredFiredRef = useRef(false)

  useEffect(() => {
    loadCommunities()
    const params = new URLSearchParams(window.location.search)
    const returned = params.get("return")
    if (returned) handleNameInput(returned)
  }, [])

  useEffect(() => {
    if (!confirmed) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Enter") setConfirmed(null) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [confirmed])

  // Intentionally no useEffect on residentId — resident selection records who is being visited,
  // not the visitor's own name

  async function loadCommunities() {
    const { data, error } = await supabase.from("communities").select("*")
    if (error) { setLoadError("Failed to load communities."); return }
    setCommunities(data || [])
    if (data?.length) {
      setCommunityId(data[0].id)
      loadUnits(data[0].id)
    }
  }

  async function loadUnits(commId: string) {
    setCommunityId(commId)
    const { data, error } = await supabase
      .from("units").select("*").eq("community_id", commId)
    if (error) { setLoadError("Failed to load units."); return }
    setUnits(data || [])
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
    const parts = input.split(" ")
    return { first: parts[0] || "", last: parts[1] || "" }
  }

  async function checkWatchlist(first: string, last: string) {
    if (!last) return []
    const { data } = await supabase
      .from("watchlist").select("*").ilike("last_name", last)
    if (!data) return []
    return data.filter(p =>
      p.last_name.toLowerCase() === last &&
      (!first || p.first_name.toLowerCase().startsWith(first))
    )
  }

  async function validateDOB(inputDOB?: string) {
    if (!selectedPerson?.dob) return
    const dbDOB   = String(selectedPerson.dob).slice(0, 10)
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
        watchlist_id:   selectedPerson.id || null,
        first_name:     selectedPerson.first_name,
        last_name:      selectedPerson.last_name,
        dob:            dbDOB,
        oln:            selectedPerson.oln || null,
        community_id:   communityId || null,
        community_name: communityName,
        unit_number:    unitId || null,
        resident_name:  selectedRes?.name || null,
        guard_email:    user?.email || null,
        reason:         selectedPerson.reason || null,
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
          Visitor:     `${selectedPerson.first_name} ${selectedPerson.last_name}`,
          DOB:         dbDOB,
          OLN:         selectedPerson.oln || "",
          Reason:      selectedPerson.reason || "",
          Comments:    selectedPerson.comments || "",
          BannedBy:    selectedPerson.banned_by || "",
          BanDate:     selectedPerson.ban_date || "",
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
    setMatchStatus("none")
    setResolvedName("")
    setStatusMessage("")
    setAlertMode(false)
    setPossibleMatches([])
    setSelectedPerson(null)
    setEnteredDOB("")
    setSaveError("")
  }

  async function handleNameInput(input: string) {
    setVisitorName(input)
    const { first, last } = parseName(input)
    if (!last) return
    const matches = await checkWatchlist(first, last)
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
          .insert({ first_name: first, last_name: last })
          .select("id").single()
        if (createErr) { setSaveError("Failed to create visitor record."); return }
        visitorId = created.id
      }

      const selectedResident = residents.find(r => r.id === residentId)
      const { error } = await supabase.from("visitor_logs").insert({
        visitor_id:    visitorId,
        first_name:    first,
        last_name:     last,
        person_type:   personType,
        community_id:  communityId,
        unit_number:   unitNumber,
        resident_name: selectedResident?.name || null,
        created_at:    new Date().toISOString()
      })

      if (error) { setSaveError("Check-in failed: " + error.message); return }

      const displayName = `${first} ${last}`.trim()
      const now = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      setRecentEntries(prev => [
        { name: displayName, unit: unitId || "—", type: personType, time: now },
        ...prev.slice(0, 4)
      ])
      setConfirmed(displayName)
      resetForm()
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
              <label className={labelCls}>Community</label>
              <select value={communityId} onChange={(e) => loadUnits(e.target.value)} className={inputCls}>
                {communities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <select value={unitId} onChange={(e) => loadResidents(e.target.value)} className={inputCls}>
                <option value="">Select Unit</option>
                {units.map(u => (
                  <option key={u.id} value={u.unit_number.trim()}>{u.unit_number.trim()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Resident Being Visited</label>
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
                </select>
              </div>

              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-xs">
                  {saveError}
                </div>
              )}

              <button
                onClick={matchStatus === "confirmed" ? undefined : handleProceedCheckIn}
                disabled={saving || matchStatus === "confirmed"}
                className={checkInBtnCls}
              >
                {saving ? "Saving..." : matchStatus === "confirmed" ? "🚫 ENTRY DENIED — BARRED" : "✅ Proceed Check-In"}
              </button>
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

          {confirmed ? (
            /* Confirmation panel */
            <div className="flex flex-col items-center justify-center gap-4 bg-green-900 border-2 border-green-500 rounded-xl px-6 py-10 text-white text-center">
              <div className="text-3xl font-bold tracking-wide">✅ VISITOR LOGGED</div>
              <div className="text-xl font-semibold">{confirmed}</div>
              <div className="text-green-300 text-lg font-bold">🟢 CLEAR</div>
              <button
                onClick={() => setConfirmed(null)}
                className="mt-2 px-8 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md font-semibold border-none cursor-pointer text-sm transition-colors"
              >
                ENTER — Continue
              </button>
              <div className="text-green-400 text-xs">Press Enter or click to log next visitor</div>
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
                          onClick={() => setSelectedPerson(p)}
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
                              if (v.length === 10) setTimeout(() => validateDOB(v), 50)
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

              {/* Recent entries this session */}
              {recentEntries.length > 0 && matchStatus === "none" && (
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Entries — This Session</div>
                  {recentEntries.map((e, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                      <div>
                        <div className="text-sm font-semibold text-white">{e.name}</div>
                        <div className="text-xs text-gray-400">{e.type}{e.unit !== "—" ? ` · Unit ${e.unit}` : ""}</div>
                      </div>
                      <div className="text-xs text-gray-500 shrink-0 ml-3">{e.time}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Idle prompt */}
              {matchStatus === "none" && recentEntries.length === 0 && (
                <div className="bg-gray-900 border border-gray-700 rounded-xl px-6 py-10 text-center text-gray-500">
                  <div className="text-4xl mb-3">🛂</div>
                  <div className="text-sm">Enter a visitor name or scan a license to begin</div>
                </div>
              )}
            </>
          )}

        </div>
      </div>

      <CadTicker />
    </div>
  )
}

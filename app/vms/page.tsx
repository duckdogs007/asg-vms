"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Community, Unit, Resident } from "@/lib/types"

type MatchStatus = "none" | "verify" | "confirmed" | "cleared"

export default function VMSPage() {

  const router = useRouter()

  const [communities,   setCommunities]   = useState<Community[]>([])
  const [communityId,   setCommunityId]   = useState("")
  const [units,         setUnits]         = useState<Unit[]>([])
  const [unitId,        setUnitId]        = useState("")
  const [residents,     setResidents]     = useState<Resident[]>([])
  const [residentId,    setResidentId]    = useState("")

  const [visitorName,   setVisitorName]   = useState("")
  const [personType,    setPersonType]    = useState("Visitor")

  const [matchStatus,   setMatchStatus]   = useState<MatchStatus>("none")
  const [possibleMatches,setPossibleMatches] = useState<any[]>([])
  const [selectedPerson,setSelectedPerson]= useState<any>(null)
  const [enteredDOB,   setEnteredDOB]    = useState("")

  const [resolvedName, setResolvedName]  = useState("")
  const [alertMode,    setAlertMode]     = useState(false)
  const [statusMessage,setStatusMessage] = useState("")

  const [saving,       setSaving]        = useState(false)
  const [saveError,    setSaveError]     = useState("")
  const [loadError,    setLoadError]     = useState("")

  useEffect(() => {
    loadCommunities()

    const params = new URLSearchParams(window.location.search)
    const returned = params.get("return")
    if (returned) handleNameInput(returned)
  }, [])

  useEffect(() => {
    if (!residentId) return
    const selected = residents.find(r => r.id === residentId)
    if (selected) {
      setVisitorName(selected.name)
      setPersonType("Resident")
    }
  }, [residentId])

  async function loadCommunities() {
    const { data, error } = await supabase.from("communities").select("*")

    if (error) {
      setLoadError("Failed to load communities.")
      return
    }

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

  async function loadResidents(uid: string) {
    setUnitId(uid)
    if (!uid) { setResidents([]); return }

    const unit = units.find(u => u.id === uid)
    console.log("unit found:", unit, "communityId:", communityId)
    if (!unit) { setResidents([]); return }

    const { data, error } = await supabase
      .from("residents")
      .select("*")
      .ilike("unit_number", unit.unit_number)

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

  function validateDOB(inputDOB?: string) {
    if (!selectedPerson?.dob) return
    const dbDOB  = String(selectedPerson.dob).slice(0, 10)
    const entered = inputDOB || enteredDOB

    if (entered === dbDOB) {
      setMatchStatus("confirmed")
      setAlertMode(true)
      setStatusMessage("🚨 BARRED PERSON — CONFIRMED")
    } else {
      setStatusMessage("⚠️ DOB Mismatch — Investigate")
      setMatchStatus("verify")
    }
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
      const selectedUnit = units.find(u => u.id === unitId)
      const unitNumber   = selectedUnit?.unit_number || null

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

        if (createErr) {
          setSaveError("Failed to create visitor record.")
          return
        }
        visitorId = created.id
      }

      const { error } = await supabase.from("visitor_logs").insert({
        visitor_id:  visitorId,
        first_name:  first,
        last_name:   last,
        person_type: personType,
        community_id: communityId,
        unit_number:  unitNumber,
        created_at:   new Date().toISOString()
      })

      if (error) {
        setSaveError("Check-in failed: " + error.message)
        return
      }

      alert("Visitor Logged ✅")
      setVisitorName("")
      setMatchStatus("none")
      setResolvedName("")
      setStatusMessage("")
      setAlertMode(false)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "px-2 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"

  return (
    <div className="p-5">
      <h2 className="text-2xl font-bold mb-5">ASG Visitor Management System</h2>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {loadError}
        </div>
      )}

      <div className="flex gap-8">

        {/* LEFT */}
        <div className="flex-1 flex flex-col gap-3 max-w-xs">

          <label className="text-sm font-medium text-gray-700">Community</label>
          <select
            value={communityId}
            onChange={(e) => loadUnits(e.target.value)}
            className={inputCls}
          >
            {communities.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button
            onClick={() => router.push("/vms/scan")}
            className="py-3 bg-gray-800 text-white rounded-md text-sm font-medium hover:bg-gray-900 transition-colors border-none cursor-pointer"
          >
            Scan Driver License
          </button>

          <label className="text-sm font-medium text-gray-700">Manual Entry</label>
          <input
            value={visitorName}
            onChange={(e) => handleNameInput(e.target.value)}
            placeholder="First Last or Last, First"
            className={inputCls}
          />

          <label className="text-sm font-medium text-gray-700">Person Type</label>
          <select value={personType} onChange={(e) => setPersonType(e.target.value)} className={inputCls}>
            <option>Visitor</option>
            <option>Delivery</option>
            <option>Contractor</option>
          </select>

          <label className="text-sm font-medium text-gray-700">Unit</label>
          <select value={unitId} onChange={(e) => loadResidents(e.target.value)} className={inputCls}>
            <option value="">Select Unit</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.unit_number}</option>
            ))}
          </select>

          <label className="text-sm font-medium text-gray-700">Resident</label>
          <select value={residentId} onChange={(e) => setResidentId(e.target.value)} className={inputCls}>
            <option value="">Select Resident</option>
            {residents.map(r => (
              <option key={r.id} value={r.id}>{r.name}{r.relationship ? ` (${r.relationship})` : ""}</option>
            ))}
          </select>

          {saveError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {saveError}
            </div>
          )}

          <button
            onClick={handleProceedCheckIn}
            disabled={saving}
            className="py-3 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors border-none cursor-pointer disabled:opacity-50 mt-1"
          >
            {saving ? "Saving..." : "✅ Proceed Check-In"}
          </button>

        </div>

        {/* RIGHT */}
        <div className="flex-1">

          <div className={`px-4 py-3 rounded-lg text-white font-medium mb-3 ${alertMode ? "bg-red-900 border-2 border-red-500" : "bg-gray-900"}`}>
            <div className="text-lg">{resolvedName || visitorName || "—"}</div>
            {statusMessage && <div className="text-sm mt-1">{statusMessage}</div>}
          </div>

          {matchStatus === "verify" && (
            <div className="bg-gray-900 text-white rounded-lg p-4">
              <div className="text-sm font-semibold mb-3 text-yellow-400">Possible Matches — Verify Identity</div>
              {possibleMatches.map(p => (
                <div key={p.id} className="bg-gray-800 rounded-md p-3 mb-2">
                  <div className="flex justify-between items-center">
                    <div>
                      {p.first_name} {p.last_name}
                      <span className="text-red-400 ml-2 text-sm">🚨 BARRED</span>
                    </div>
                    <button
                      onClick={() => setSelectedPerson(p)}
                      className="text-xs px-3 py-1 bg-blue-700 rounded hover:bg-blue-600 border-none cursor-pointer text-white"
                    >
                      Select
                    </button>
                  </div>

                  {selectedPerson?.id === p.id && (
                    <div className="mt-3 flex flex-col gap-2">
                      <label className="text-xs text-gray-400">Verify DOB</label>
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
                          🔎 Investigate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import CommunitySelector from "@/components/CommunitySelector"
import SecurityAlert from "@/components/SecurityAlert"
import { WatchlistEntry, VehicleWatchlistEntry } from "@/lib/types"
import VisitorPhotoCapture from "@/components/VisitorPhotoCapture"
import { saveVisitorPhotos } from "@/lib/visitorPhotos"

// Accepts YYYY-MM-DD (already valid), YYYYMMDD, or MMDDYYYY (Virginia AAMVA)
// and returns YYYY-MM-DD or "" if it can't be parsed.
function normaliseDOB(raw: string): string {
  if (!raw) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{8}$/.test(raw)) {
    const yA = raw.slice(0, 4), mA = raw.slice(4, 6), dA = raw.slice(6, 8)
    if (+yA >= 1900 && +yA <= 2099 && +mA >= 1 && +mA <= 12 && +dA >= 1 && +dA <= 31) return `${yA}-${mA}-${dA}`
    const mB = raw.slice(0, 2), dB = raw.slice(2, 4), yB = raw.slice(4, 8)
    if (+yB >= 1900 && +yB <= 2099 && +mB >= 1 && +mB <= 12 && +dB >= 1 && +dB <= 31) return `${yB}-${mB}-${dB}`
  }
  return ""
}

const DEFAULT_COMMUNITY_NAME = "St Luke Apartments"

interface VisitStats {
  total: number
  lastVisit: string
  apartment: string
}

export default function ManualEntry() {

  const [community,    setCommunity]    = useState("")
  const [firstName,    setFirstName]    = useState("")
  const [lastName,     setLastName]     = useState("")
  const [dob,          setDob]          = useState("")
  const [oln,          setOln]          = useState("")
  const [plate,        setPlate]        = useState("")
  const [plateState,   setPlateState]   = useState("VA")
  const [apartment,    setApartment]    = useState("")
  const [residentName, setResidentName] = useState("")
  const [visitorType,  setVisitorType]  = useState("Visitor")
  const [idPhotos,     setIdPhotos]     = useState<File[]>([])
  const [livePhotos,   setLivePhotos]   = useState<File[]>([])

  const [alertPerson,     setAlertPerson]     = useState<WatchlistEntry | null>(null)
  const [returningVisitor,setReturningVisitor] = useState<any>(null)
  const [visitStats,      setVisitStats]      = useState<VisitStats | null>(null)

  const [message, setMessage] = useState("")
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")

  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Community: prefer the one already chosen in /vms or /vms/scan
    // (shared key 'asg-current-community-id'), else fall back to legacy key
    // 'asg-community', else default to St Luke Apartments by name lookup.
    const saved = localStorage.getItem("asg-current-community-id")
                 || localStorage.getItem("asg-community")
    if (saved) {
      setCommunity(saved)
    } else {
      supabase.from("communities").select("id,name").ilike("name", DEFAULT_COMMUNITY_NAME)
        .limit(1).maybeSingle()
        .then(({ data }) => {
          if (data?.id) setCommunity(data.id)
        })
    }

    const params = new URLSearchParams(window.location.search)
    if (params.get("first")) setFirstName(params.get("first")!)
    if (params.get("last"))  setLastName(params.get("last")!)
    if (params.get("dob"))   setDob(normaliseDOB(params.get("dob")!))
    if (params.get("oln"))   setOln(params.get("oln")!)

    firstRef.current?.focus()
  }, [])

  async function checkWatchlist(first: string, last: string, dobValue?: string, olnValue?: string): Promise<WatchlistEntry | null> {
    try {
      if (olnValue) {
        const { data } = await supabase.from("watchlist").select("*").ilike("oln", olnValue)
        if (data?.length) {
          return { ...data[0], match_level: "Driver License Match", confidence: 100 }
        }
      }

      if (dobValue) {
        const { data } = await supabase.from("watchlist").select("*")
          .ilike("first_name", first).ilike("last_name", last).eq("dob", dobValue)
        if (data?.length) {
          return { ...data[0], match_level: "Name + DOB", confidence: 90 }
        }
      }

      const { data } = await supabase.from("watchlist").select("*")
        .ilike("first_name", first).ilike("last_name", last)
      if (data?.length) {
        return { ...data[0], match_level: "Name Only", confidence: 60 }
      }

      return null
    } catch {
      return null
    }
  }

  async function checkVehicleWatchlist(plateValue: string, stateValue: string): Promise<VehicleWatchlistEntry | null> {
    if (!plateValue) return null

    const { data } = await supabase.from("vehicle_watchlist").select("*")
      .ilike("plate", plateValue).ilike("state", stateValue)

    if (data?.length) {
      return { ...data[0], match_level: "Vehicle Plate Match", confidence: 95 }
    }
    return null
  }

  async function checkReturningVisitor(first: string, last: string) {
    const { data: visitor } = await supabase.from("visitors").select("*")
      .ilike("first_name", first).ilike("last_name", last).limit(1)

    if (!visitor?.length) return

    const { data: logs } = await supabase.from("visitor_logs").select("*")
      .eq("visitor_id", visitor[0].id).order("created_at", { ascending: false })

    if (logs?.length) {
      setReturningVisitor(visitor[0])
      setVisitStats({ total: logs.length, lastVisit: logs[0].created_at, apartment: logs[0].apartment })
    }
  }

  useEffect(() => {
    // Debounce so each keystroke doesn't fire its own watchlist + returning
    // visitor + vehicle queries. ~250ms feels responsive but eliminates the
    // burst of redundant queries during normal typing.
    const t = setTimeout(async () => {
      if (firstName.length >= 2 && lastName.length >= 2) {
        checkReturningVisitor(firstName, lastName)

        const banned = await checkWatchlist(firstName, lastName, dob, oln)
        if (banned) { setAlertPerson(banned); return }
      }

      if (plate.length >= 3) {
        const vehicle = await checkVehicleWatchlist(plate, plateState)
        if (vehicle) {
          // SecurityAlert renders WatchlistEntry shape (name + dob fields). For
          // a vehicle match, fold plate/state into the name fields so it shows
          // sanely instead of "undefined undefined".
          setAlertPerson({
            id:          vehicle.id,
            first_name:  vehicle.plate,
            last_name:   vehicle.state ? `(${vehicle.state})` : "",
            reason:      vehicle.reason || "Vehicle on watchlist",
            notes:       vehicle.notes ?? null,
            match_level: vehicle.match_level || "Vehicle Plate Match",
            confidence:  vehicle.confidence ?? 95,
          } as WatchlistEntry)
          return
        }
      }
    }, 250)
    return () => clearTimeout(t)
  }, [firstName, lastName, dob, oln, plate, plateState])

  async function saveVisitor() {
    if (!firstName || !lastName) { setError("First and last name required."); return }

    setSaving(true)
    setError("")
    setMessage("")

    try {
      // De-dupe the person: reuse an existing visitor matched by name (+ DOB
      // when provided) so photos and visit history follow one visitor_id.
      let visitorId: string
      let vq = supabase.from("visitors").select("id")
        .ilike("first_name", firstName).ilike("last_name", lastName)
      if (dob) vq = vq.eq("dob", dob)
      const { data: existingVisitor } = await vq.limit(1).maybeSingle()
      if (existingVisitor) {
        visitorId = (existingVisitor as { id: string }).id
      } else {
        const { data: created, error: visitorError } = await supabase
          .from("visitors")
          .insert([{ first_name: firstName, last_name: lastName, dob: dob || null, oln: oln || null, plate: plate || null }])
          .select("id").single()
        if (visitorError || !created) { setError(visitorError?.message || "Failed to create visitor record."); return }
        visitorId = (created as { id: string }).id
      }

      const { data: logRow, error: logError } = await supabase.from("visitor_logs").insert([{
        visitor_id:    visitorId,
        first_name:    firstName,
        last_name:     lastName,
        person_type:   visitorType,
        community_id:  community || null,
        unit_number:   apartment || null,
        apartment:     apartment || null,
        resident_name: residentName || null,
        created_at:    new Date().toISOString()
      }]).select("id").single()

      if (logError) { setError(logError.message); return }

      // Attach any captured ID/Live photos to the person + this check-in.
      if (idPhotos.length || livePhotos.length) {
        const { data: { user } } = await supabase.auth.getUser()
        await saveVisitorPhotos(idPhotos, livePhotos, {
          visitorId,
          visitorLogId: (logRow as { id?: string } | null)?.id || null,
          communityId:  community || null,
          capturedBy:   user?.email || null,
        })
      }

      const manualName = `${firstName} ${lastName}`.trim()
      supabase.auth.getUser().then(({ data: { user } }) => {
        supabase.from("audit_logs").insert({
          user_email: user?.email || "unknown",
          action: "created", resource_type: "Visitor Check-In (Manual)", resource_id: "",
          detail: `${manualName} checked in — ${visitorType}${apartment ? ` · Unit ${apartment}` : ""}`,
          created_at: new Date().toISOString(),
        })
      })
      setMessage("Visitor logged successfully.")
      setFirstName(""); setLastName(""); setDob(""); setOln("")
      setPlate(""); setApartment(""); setResidentName("")
      setIdPhotos([]); setLivePhotos([])
      setVisitorType("Visitor"); setReturningVisitor(null); setVisitStats(null)
      firstRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"

  return (
    <main className="p-4 sm:p-8 max-w-lg">

      <SecurityAlert person={alertPerson} onClose={() => setAlertPerson(null)} />

      <h1 className="text-2xl font-bold mb-5">Visitor Entry</h1>

      <CommunitySelector
        value={community}
        onChange={async (value) => {
          setCommunity(value)
          localStorage.setItem("asg-community", value)
          localStorage.setItem("asg-current-community-id", value)
          // Also persist the community NAME so other pages (TopNav SOS, etc.)
          // that read 'asg-current-community-name' stay in sync with /vms/scan.
          const { data } = await supabase.from("communities").select("name").eq("id", value).maybeSingle()
          const row = data as { name: string } | null
          if (row?.name) localStorage.setItem("asg-current-community-name", row.name)
        }}
      />

      {returningVisitor && visitStats && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-5">
          <div className="font-semibold text-indigo-800 mb-2">Returning Visitor Detected</div>
          <div className="text-sm text-indigo-700 flex flex-col gap-1">
            <span>{returningVisitor.first_name} {returningVisitor.last_name}</span>
            <span>Visits: {visitStats.total}</span>
            <span>Last Visit: {new Date(visitStats.lastVisit).toLocaleDateString()}</span>
            <span>Last Apartment: {visitStats.apartment}</span>
          </div>
          <button
            onClick={() => setApartment(visitStats.apartment)}
            className="mt-3 px-4 py-2 bg-blue-800 text-white text-sm rounded-md hover:bg-blue-900 transition-colors border-none cursor-pointer"
          >
            Use Previous Apartment
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">

        <input ref={firstRef}    value={firstName}    onChange={e => setFirstName(e.target.value)}    placeholder="First Name"       className={inputCls} />
        <input                   value={lastName}     onChange={e => setLastName(e.target.value)}     placeholder="Last Name"        className={inputCls} />
        <label className="text-xs font-semibold text-gray-500 -mb-1.5 mt-1">DOB</label>
        <input type="date"       value={dob}          onChange={e => setDob(e.target.value)}           className={inputCls} />
        <input                   value={oln}          onChange={e => setOln(e.target.value)}           placeholder="Driver License #" className={inputCls} />
        <input                   value={plate}        onChange={e => setPlate(e.target.value)}         placeholder="Vehicle Plate"    className={inputCls} />
        <input                   value={plateState}   onChange={e => setPlateState(e.target.value)}   placeholder="Plate State"      className={inputCls} />
        <input                   value={apartment}    onChange={e => setApartment(e.target.value)}    placeholder="Apartment Visiting" className={inputCls} />
        <input                   value={residentName} onChange={e => setResidentName(e.target.value)} placeholder="Resident Name"    className={inputCls} />

        <select value={visitorType} onChange={e => setVisitorType(e.target.value)} className={inputCls}>
          <option value="Visitor">Visitor</option>
          <option value="Contractor">Contractor</option>
          <option value="Delivery Driver">Delivery Driver</option>
          <option value="Employee">Employee</option>
        </select>

        <VisitorPhotoCapture idFiles={idPhotos} liveFiles={livePhotos} setIdFiles={setIdPhotos} setLiveFiles={setLivePhotos} />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-md text-sm">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2.5 rounded-md text-sm">
            {message}
          </div>
        )}

        <button
          onClick={saveVisitor}
          disabled={saving}
          className="py-3 bg-blue-800 text-white font-semibold rounded-md hover:bg-blue-900 transition-colors border-none cursor-pointer disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Entry"}
        </button>

        <Link href="/vms">
          <div className="py-3 bg-gray-700 text-white rounded-md text-center text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer">
            Back to VMS
          </div>
        </Link>

      </div>
    </main>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"
import SecurityAlert from "../../../components/SecurityAlert"

type Status = "idle" | "checking" | "clear" | "barred"

export default function ScanID(){

  const router = useRouter()

  const [person,     setPerson]      = useState<any>(null)
  const [alertPerson,setAlertPerson] = useState<any>(null)
  const [status,     setStatus]      = useState<Status>("idle")

  const textareaRef     = useRef<HTMLTextAreaElement>(null)
  const lastResultRef   = useRef<number>(0)   // timestamp when status flipped to clear/barred
  const RESET_GRACE_MS  = 250                  // ignore Enter/input this long after result appears

  // DEBUG — temporary, remove once scan flow is stable
  const [debugLog, setDebugLog] = useState<string[]>([])
  function dbg(msg: string) {
    setDebugLog(prev => [`${new Date().toLocaleTimeString("en-US",{hour12:false})}.${String(Date.now()%1000).padStart(3,"0")}  ${msg}`, ...prev].slice(0, 60))
    console.log("[scan]", msg)
  }

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  /* DRIVER LICENSE PARSER (AAMVA) */
  function parseLicense(data: string) {
    const codes = [
      "DAA","DAB","DAC","DAD","DAE","DAF","DAG","DAH","DAI","DAJ","DAK",
      "DAL","DAM","DAN","DAO","DAP","DAQ","DAR","DAS","DAT","DAU","DAV",
      "DAW","DAX","DAY","DAZ","DBA","DBB","DBC","DBD","DBE","DBH","DBI",
      "DBJ","DBL","DBM","DBN","DBO","DBP","DBQ","DCA","DCB","DCD","DCF",
      "DCG","DCH","DCI","DCJ","DCK","DCL","DCS","DCT","DCU","DDA","DDB",
      "DDC","DDD","DDE","DDF","DDG","DDH","DDI","DDJ","DDK","DDL",
    ]
    const codeAlt = codes.join("|")
    const fields: Record<string,string> = {}
    for (const code of codes) {
      const re = new RegExp(code + "([\\s\\S]+?)(?=" + codeAlt + "|$)")
      const m = data.match(re)
      if (m) fields[code] = m[1].trim()
    }
    let first  = fields.DAC || fields.DCT || ""
    let last   = fields.DCS || fields.DAB || ""
    let middle = fields.DAD || ""
    if ((!first || !last) && fields.DAA) {
      const parts = fields.DAA.split(",").map(s => s.trim())
      if (parts.length >= 2) {
        last   = last   || parts[0] || ""
        first  = first  || parts[1] || ""
        middle = middle || parts[2] || ""
      }
    }
    return {
      first_name:  first,
      last_name:   last,
      middle_name: middle,
      dob:         fields.DBB || "",
      oln:         fields.DAQ || "",
      address:     fields.DAG || "",
      city:        fields.DAI || "",
      state:       fields.DAJ || "",
      zip:         fields.DAK || "",
      sex:         fields.DBC || "",
      height:      fields.DAU || "",
      eye_color:   fields.DAY || "",
    }
  }

  async function findWatchlistHit(first: string, last: string, oln: string) {
    if (oln) {
      const { data } = await supabase.from("watchlist").select("*").ilike("oln", oln)
      if (data && data.length > 0) return data[0]
    }
    if (last) {
      const { data } = await supabase.from("watchlist").select("*").ilike("last_name", last)
      const hits = (data || []).filter(p =>
        p.last_name?.toLowerCase() === last.toLowerCase() &&
        (!first || p.first_name?.toLowerCase().startsWith(first.toLowerCase()))
      )
      if (hits.length > 0) return hits[0]
    }
    return null
  }

  async function processScan(scan: string) {
    const trimmed = scan.replace(/[\r\n\t]+$/g, "")
    if (!trimmed.trim()) return
    dbg(`processScan(len=${trimmed.length})`)
    setStatus("checking")
    const parsed = parseLicense(trimmed)
    setPerson(parsed)
    const hit = await findWatchlistHit(parsed.first_name, parsed.last_name, parsed.oln)
    if (hit) {
      setAlertPerson(hit)
      setStatus("barred")
      dbg(`status=BARRED hit=${hit.first_name} ${hit.last_name}`)
    } else {
      setStatus("clear")
      dbg(`status=CLEAR person=${parsed.first_name} ${parsed.last_name}`)
    }
    lastResultRef.current = Date.now()
  }

  function reset() {
    dbg(`reset()  status=${status}`)
    if (textareaRef.current) textareaRef.current.value = ""
    setPerson(null)
    setAlertPerson(null)
    setStatus("idle")
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return
    e.preventDefault()
    const val = textareaRef.current?.value || ""
    dbg(`Enter pressed  status=${status} domLen=${val.length}`)

    // While processing, ignore further Enters
    if (status === "checking") return

    // Result is showing — within grace, ignore (likely scanner trailing CR/LF).
    // Past grace, advance to next visitor.
    if (status === "clear" || status === "barred") {
      const since = Date.now() - lastResultRef.current
      if (since < RESET_GRACE_MS) { dbg(`Enter grace block ${since}ms`); return }
      reset()
      return
    }

    // Idle — scanner just finished sending. Process the textarea content.
    if (val.trim()) processScan(val)
  }

  // When new input arrives after a result is showing AND we're past the grace
  // window, immediately reset state so the new scan can populate cleanly.
  // Textarea value is uncontrolled — we don't touch it here.
  function handleInput() {
    if (status !== "clear" && status !== "barred") return
    const since = Date.now() - lastResultRef.current
    if (since < RESET_GRACE_MS) return
    dbg(`onInput NEW SCAN starting  since=${since}ms`)
    // Clear the textarea so the new scan doesn't append to the old one
    if (textareaRef.current) textareaRef.current.value = ""
    setPerson(null)
    setAlertPerson(null)
    setStatus("idle")
  }

  function continueEntry() {
    if (!person) return
    router.push(
      `/vms/manual?first=${encodeURIComponent(person.first_name)}` +
      `&last=${encodeURIComponent(person.last_name)}` +
      `&dob=${encodeURIComponent(person.dob)}` +
      `&oln=${encodeURIComponent(person.oln)}`
    )
  }

  const displayName = person ? `${person.first_name} ${person.last_name}`.trim() : ""

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <SecurityAlert person={alertPerson} onClose={() => setAlertPerson(null)} />

      <h2 className="text-2xl font-bold mb-1">📷 Scan Driver License</h2>
      <p className="text-sm text-gray-500 mb-4">
        Scan with the connected reader. Result auto-checks against the watchlist.
        The next scan auto-clears the previous result.
      </p>

      <textarea
        ref={textareaRef}
        autoFocus
        defaultValue=""
        placeholder="Awaiting scan…"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl h-28 p-3 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
      />

      {status === "checking" && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-gray-100 border border-gray-300 text-gray-700 text-sm">
          Checking watchlist…
        </div>
      )}

      {status === "clear" && (
        <div className="mt-4 px-5 py-4 rounded-xl bg-green-900 border-2 border-green-500 text-white">
          <div className="text-2xl font-bold">🟢 CLEAR — OK to proceed</div>
          {displayName && <div className="text-lg mt-1 font-semibold">{displayName}</div>}
          <div className="text-green-300 text-xs mt-2">Scan next visitor or press Enter to clear.</div>
        </div>
      )}

      {status === "barred" && (
        <div className="mt-4 px-5 py-4 rounded-xl bg-red-900 border-2 border-red-500 text-white">
          <div className="text-2xl font-bold">🚨 BARRED PERSON</div>
          {displayName && <div className="text-lg mt-1 font-semibold">{displayName}</div>}
          <div className="text-red-200 text-xs mt-2">Contact supervisor before proceeding.</div>
        </div>
      )}

      {/* DEBUG PANEL — remove once stable */}
      <div className="mt-4 max-w-xl bg-yellow-50 border border-yellow-300 rounded p-2 text-xs font-mono max-h-64 overflow-y-auto">
        <div className="font-bold mb-1 sticky top-0 bg-yellow-50">
          DEBUG  status={status}  sinceResult={lastResultRef.current ? Date.now() - lastResultRef.current + "ms" : "—"}
        </div>
        {debugLog.map((l, i) => (
          <div key={i} className="text-gray-700 leading-tight">{l}</div>
        ))}
      </div>

      {person && (status === "clear" || status === "barred") && (
        <div className="mt-4 max-w-xl bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">License Data</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-800">
            <div><span className="text-gray-500">Name:</span> {displayName || "—"}</div>
            <div><span className="text-gray-500">DOB:</span> {person.dob || "—"}</div>
            <div><span className="text-gray-500">License:</span> {person.oln || "—"}</div>
            <div><span className="text-gray-500">Sex:</span> {person.sex || "—"}</div>
            {person.address && <div className="sm:col-span-2"><span className="text-gray-500">Address:</span> {person.address}, {person.city}, {person.state} {person.zip}</div>}
          </div>
          {status === "clear" && (
            <button
              onClick={continueEntry}
              className="mt-3 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-md hover:bg-green-800 border-none cursor-pointer"
            >
              Continue → Visitor Entry
            </button>
          )}
        </div>
      )}
    </div>
  )
}

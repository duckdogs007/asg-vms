"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"
import SecurityAlert from "../../../components/SecurityAlert"

type Status = "idle" | "checking" | "clear" | "barred"

export default function ScanID(){

  const router = useRouter()

  const [barcode,    setBarcode]     = useState("")
  const [person,     setPerson]      = useState<any>(null)
  const [alertPerson,setAlertPerson] = useState<any>(null)
  const [status,     setStatus]      = useState<Status>("idle")

  const textareaRef     = useRef<HTMLTextAreaElement>(null)
  const lastResultRef   = useRef<number>(0)   // timestamp when status flipped to clear/barred
  const RESET_GRACE_MS  = 800                  // ignore Enter this long after result appears

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  /* DRIVER LICENSE PARSER (AAMVA) */
  // Uses an explicit known-code alternation in the lookahead so each field stops
  // at the next real AAMVA element code (not at any 3-cap pattern, which would
  // mis-match inside ALL-CAPS values like "LONGWOOD RD"). Also handles the
  // legacy DAA "LAST,FIRST,MIDDLE" combined-name field used by Virginia.
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

    // Virginia & older formats put the full name in DAA as "LAST,FIRST,MIDDLE"
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

  /* WATCHLIST CHECK — returns the matching row or null */
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

  /* PROCESS SCAN */
  async function processScan(scan: string) {
    if (!scan.trim()) return
    setStatus("checking")
    const parsed = parseLicense(scan)
    setPerson(parsed)
    const hit = await findWatchlistHit(parsed.first_name, parsed.last_name, parsed.oln)
    if (hit) {
      setAlertPerson(hit)
      setStatus("barred")
    } else {
      setStatus("clear")
    }
    lastResultRef.current = Date.now()
  }

  /* RESET — ready for next visitor */
  function reset() {
    setBarcode("")
    setPerson(null)
    setAlertPerson(null)
    setStatus("idle")
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  /* AUTO-DETECT ENTER FROM SCANNER + ENTER TO RESET */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return
    e.preventDefault()
    // Already processing — drop redundant Enter events from the scanner
    if (status === "checking") return
    // After a result is showing, Enter advances to next visitor — but only
    // after a brief grace period, otherwise the scanner's own trailing CR/LF
    // will instantly reset the result the guard never got to see.
    if (status === "clear" || status === "barred") {
      if (Date.now() - lastResultRef.current < RESET_GRACE_MS) return
      reset()
      return
    }
    // Idle — scanner just finished sending. Treat Enter as end-of-scan.
    if (barcode.trim()) processScan(barcode)
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
        Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">Enter</kbd> after a result to clear and accept the next visitor.
      </p>

      <textarea
        ref={textareaRef}
        autoFocus
        value={barcode}
        placeholder="Awaiting scan…"
        onChange={(e) => {
          const v = e.target.value
          // If a result is currently showing AND new scan data is arriving,
          // reset state and adopt the new tail. Guard against:
          //   - trailing scanner terminators (small additions): require >=10 new chars
          //   - reset within the grace window (catches scanner trailing CR/LF)
          if ((status === "clear" || status === "barred") && v !== barcode) {
            const fresh = barcode && v.startsWith(barcode) ? v.slice(barcode.length) : v
            const sinceResult = Date.now() - lastResultRef.current
            if (fresh.trim().length < 10 || sinceResult < RESET_GRACE_MS) {
              // Likely just terminator noise — ignore the change
              return
            }
            setPerson(null)
            setAlertPerson(null)
            setStatus("idle")
            setBarcode(fresh)
            return
          }
          setBarcode(v)
        }}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl h-28 p-3 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
      />

      {/* CHECKING */}
      {status === "checking" && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-gray-100 border border-gray-300 text-gray-700 text-sm">
          Checking watchlist…
        </div>
      )}

      {/* CLEAR — green banner */}
      {status === "clear" && (
        <div className="mt-4 px-5 py-4 rounded-xl bg-green-900 border-2 border-green-500 text-white">
          <div className="text-2xl font-bold">🟢 CLEAR — OK to proceed</div>
          {displayName && <div className="text-lg mt-1 font-semibold">{displayName}</div>}
          <div className="text-green-300 text-xs mt-2">
            Press <kbd className="px-1.5 py-0.5 bg-green-700 rounded">Enter</kbd> to clear and accept next visitor
          </div>
        </div>
      )}

      {/* BARRED — red banner */}
      {status === "barred" && (
        <div className="mt-4 px-5 py-4 rounded-xl bg-red-900 border-2 border-red-500 text-white">
          <div className="text-2xl font-bold">🚨 BARRED PERSON</div>
          {displayName && <div className="text-lg mt-1 font-semibold">{displayName}</div>}
          <div className="text-red-200 text-xs mt-2">
            Contact supervisor before proceeding. Press <kbd className="px-1.5 py-0.5 bg-red-700 rounded">Enter</kbd> to dismiss and reset.
          </div>
        </div>
      )}

      {/* PARSED LICENSE DATA */}
      {person && status !== "idle" && status !== "checking" && (
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

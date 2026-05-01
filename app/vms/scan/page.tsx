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

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  /* DRIVER LICENSE PARSER */
  // Stop at the next AAMVA element code (3 chars: 2 letters + 1 letter/digit) or
  // end-of-string. Handles both newline-delimited and concatenated barcode payloads.
  function parseLicense(data: string) {
    function get(field: string) {
      const match = data.match(new RegExp(field + "([\\s\\S]+?)(?=[A-Z]{2}[A-Z0-9]|$)"))
      return match ? match[1].trim() : ""
    }
    return {
      first_name:  get("DAC"),
      last_name:   get("DCS"),
      middle_name: get("DAD"),
      dob:         get("DBB"),
      oln:         get("DAQ"),
      address:     get("DAG"),
      city:        get("DAI"),
      state:       get("DAJ"),
      zip:         get("DAK"),
      sex:         get("DBC"),
      height:      get("DAU"),
      eye_color:   get("DAY"),
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
    // After a result is showing, Enter advances to next visitor
    if (status === "clear" || status === "barred") {
      reset()
      return
    }
    // Otherwise, treat as scanner end-of-data terminator
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
        onChange={(e) => setBarcode(e.target.value)}
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

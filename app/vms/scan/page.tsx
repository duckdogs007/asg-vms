"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"
import SecurityAlert from "../../../components/SecurityAlert"
import { fireAlert } from "@/lib/alerts"

// AAMVA DBB can be YYYYMMDD or MMDDYYYY (Virginia uses MMDDYYYY). Returns
// MM/DD/YYYY for display, or the raw value if it doesn't match either pattern.
function formatDOB(raw: string): string {
  if (!raw || !/^\d{8}$/.test(raw)) return raw || ""
  const yA = raw.slice(0, 4), mA = raw.slice(4, 6), dA = raw.slice(6, 8)
  if (+yA >= 1900 && +yA <= 2099 && +mA >= 1 && +mA <= 12 && +dA >= 1 && +dA <= 31) return `${mA}/${dA}/${yA}`
  const mB = raw.slice(0, 2), dB = raw.slice(2, 4), yB = raw.slice(4, 8)
  if (+yB >= 1900 && +yB <= 2099 && +mB >= 1 && +mB <= 12 && +dB >= 1 && +dB <= 31) return `${mB}/${dB}/${yB}`
  return raw
}

// Same parsing logic but returns YYYY-MM-DD for the DB date column
function parseDOBToISO(raw: string): string | null {
  if (!raw || !/^\d{8}$/.test(raw)) return null
  const yA = raw.slice(0, 4), mA = raw.slice(4, 6), dA = raw.slice(6, 8)
  if (+yA >= 1900 && +yA <= 2099 && +mA >= 1 && +mA <= 12 && +dA >= 1 && +dA <= 31) return `${yA}-${mA}-${dA}`
  const mB = raw.slice(0, 2), dB = raw.slice(2, 4), yB = raw.slice(4, 8)
  if (+yB >= 1900 && +yB <= 2099 && +mB >= 1 && +mB <= 12 && +dB >= 1 && +dB <= 31) return `${yB}-${mB}-${dB}`
  return null
}

type Status = "idle" | "checking" | "clear" | "barred"

export default function ScanID(){

  const router = useRouter()

  const [person,     setPerson]      = useState<any>(null)
  const [alertPerson,setAlertPerson] = useState<any>(null)
  const [status,     setStatus]      = useState<Status>("idle")

  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const lastResultRef     = useRef<number>(0)    // timestamp when status flipped to clear/barred
  const scanTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barredFiredRef    = useRef<boolean>(false) // dedupe: only fire alert/log once per BARRED result
  const lastProcessedRef  = useRef<string>("")   // exact text passed to processScan last
  const RESET_GRACE_MS    = 250                  // ignore input this long after result appears
  const SCAN_END_MS       = 200                  // pause this long => scan finished, process

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  /* DRIVER LICENSE PARSER (AAMVA) */
  // Global-match + longest-value dedup. AAMVA element order varies across
  // states, so we can't assume DAA→DAB→...→DDL. Instead:
  //   1. Find ALL occurrences of every known code (including duplicates and
  //      accidental matches like "DAI" inside the name "ADAIR")
  //   2. For each position, compute the "value length" it would have if kept
  //   3. For each code that appears more than once, keep the occurrence with
  //      the longest extracted value (this filters out the "DAI" embedded in
  //      a name field, where the value-to-next-code is 0–1 chars)
  //   4. Sort kept positions and extract values between them
  function parseLicense(data: string) {
    const codes = [
      "DAA","DAB","DAC","DAD","DAE","DAF","DAG","DAH","DAI","DAJ","DAK",
      "DAL","DAM","DAN","DAO","DAP","DAQ","DAR","DAS","DAT","DAU","DAV",
      "DAW","DAX","DAY","DAZ","DBA","DBB","DBC","DBD","DBE","DBH","DBI",
      "DBJ","DBL","DBM","DBN","DBO","DBP","DBQ","DCA","DCB","DCD","DCE",
      "DCF","DCG","DCH","DCI","DCJ","DCK","DCL","DCS","DCT","DCU",
      "DDA","DDB","DDC","DDD","DDE","DDF","DDG","DDH","DDI","DDJ","DDK","DDL",
    ]
    type Pos = { code: string; codeStart: number; valueStart: number; valLen: number }
    const all: Pos[] = []
    for (const code of codes) {
      let idx = data.indexOf(code)
      while (idx >= 0) {
        all.push({ code, codeStart: idx, valueStart: idx + code.length, valLen: 0 })
        idx = data.indexOf(code, idx + 1)
      }
    }
    all.sort((a, b) => a.codeStart - b.codeStart)
    // Hypothetical value length = distance to next position of a DIFFERENT code
    for (let i = 0; i < all.length; i++) {
      let next = data.length
      for (let j = i + 1; j < all.length; j++) {
        if (all[j].code !== all[i].code) { next = all[j].codeStart; break }
      }
      all[i].valLen = next - all[i].valueStart
    }
    // Keep one occurrence per code — the one with the longest hypothetical value
    const byCode = new Map<string, Pos>()
    for (const p of all) {
      const existing = byCode.get(p.code)
      if (!existing || p.valLen > existing.valLen) byCode.set(p.code, p)
    }
    const positions = [...byCode.values()].sort((a, b) => a.codeStart - b.codeStart)

    const fields: Record<string,string> = {}
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].valueStart
      const end   = i + 1 < positions.length ? positions[i + 1].codeStart : data.length
      fields[positions[i].code] = data.slice(start, end).replace(/[\r\n\t]/g, "").trim()
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
    lastProcessedRef.current = scan   // remember raw value so handleInput can strip the prefix when next scan starts
    setStatus("checking")
    const parsed = parseLicense(trimmed)
    setPerson(parsed)
    const hit = await findWatchlistHit(parsed.first_name, parsed.last_name, parsed.oln)
    if (hit) {
      setAlertPerson(hit)
      setStatus("barred")
      // Dedupe: write audit + fire alert once per BARRED scan result
      if (!barredFiredRef.current) {
        barredFiredRef.current = true
        const communityId   = (typeof window !== "undefined" && localStorage.getItem("asg-current-community-id")) || null
        const communityName = (typeof window !== "undefined" && localStorage.getItem("asg-current-community-name")) || "Unknown"
        const { data: { user } } = await supabase.auth.getUser()
        // Audit row in denied_entries
        supabase.from("denied_entries").insert({
          watchlist_id:   hit.id || null,
          first_name:     parsed.first_name,
          last_name:      parsed.last_name,
          dob:            parseDOBToISO(parsed.dob),
          oln:            parsed.oln || null,
          community_id:   communityId,
          community_name: communityName,
          unit_number:    null,
          resident_name:  null,
          guard_email:    user?.email || null,
          reason:         hit.reason || null,
          alert_sent:     true,
        }).then(({ error }) => {
          if (error) console.error("[denied_entries] insert failed:", error)
        })
        // Teams alert
        fireAlert({
          type:         "watchlist_hit",
          severity:     "critical",
          community_id: communityId,
          subject:      `🚨 BARRED PERSON CONFIRMED — ${communityName}`,
          body:         `A confirmed watchlist match has occurred at ${communityName} via license scan. The check-in was blocked.`,
          payload: {
            Community: communityName,
            Source:    "License scan",
            Visitor:   `${parsed.first_name} ${parsed.last_name}`.trim(),
            DOB:       formatDOB(parsed.dob),
            OLN:       parsed.oln || "",
            Reason:    hit.reason || "",
            Comments:  hit.comments || "",
            BannedBy:  hit.banned_by || "",
            BanDate:   hit.ban_date || "",
            Time:      new Date().toLocaleString("en-US"),
          },
        })
      }
    } else {
      setStatus("clear")
    }
    lastResultRef.current = Date.now()
  }

  function reset() {
    barredFiredRef.current = false
    lastProcessedRef.current = ""
    if (textareaRef.current) textareaRef.current.value = ""
    setPerson(null)
    setAlertPerson(null)
    setStatus("idle")
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  // Swallow Enter/Tab from the scanner — many scanners insert them BETWEEN
  // AAMVA elements, not just at the end. We use an inter-character timeout
  // (SCAN_END_MS) to detect the real end of a scan instead.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      // After grace, manual Enter advances to next visitor.
      if ((status === "clear" || status === "barred")
          && Date.now() - lastResultRef.current >= RESET_GRACE_MS) {
        reset()
      }
    }
  }

  function handleInput() {
    // After a result, the first new keystroke past the grace means the next
    // scan is starting. Strip the OLD barcode prefix from the textarea so we
    // keep the new char(s) and accumulate from there. Don't blindly wipe —
    // that would lose the first character of the new scan.
    if (status === "clear" || status === "barred") {
      const since = Date.now() - lastResultRef.current
      if (since < RESET_GRACE_MS) return
      const v = textareaRef.current?.value || ""
      const oldScan = lastProcessedRef.current
      const newPart = oldScan && v.startsWith(oldScan) ? v.slice(oldScan.length) : v
      if (textareaRef.current) textareaRef.current.value = newPart
      barredFiredRef.current = false
      lastProcessedRef.current = ""
      setPerson(null)
      setAlertPerson(null)
      setStatus("idle")
    }

    // (Re)start the scan-end timer. Each new keystroke pushes it back; when
    // the scanner finally pauses for SCAN_END_MS, we process the buffer.
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
    scanTimerRef.current = setTimeout(() => {
      const val = textareaRef.current?.value || ""
      if (val.trim().length >= 20) processScan(val)
    }, SCAN_END_MS)
  }

  function continueEntry() {
    if (!person) return
    // Strip any commas from first name (some DLs encode "FIRST,MIDDLE" without
    // the parser splitting them) and pass DOB in the ISO format the manual
    // page's date input expects.
    const cleanFirst = (person.first_name || "").split(",")[0].trim()
    const isoDob = parseDOBToISO(person.dob || "") || ""
    router.push(
      `/vms/manual?first=${encodeURIComponent(cleanFirst)}` +
      `&last=${encodeURIComponent(person.last_name)}` +
      `&dob=${encodeURIComponent(isoDob)}` +
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
          <div className="text-red-200 text-xs mt-2">Contact supervisor before proceeding. Alert sent and attempt logged.</div>
          <button
            onClick={reset}
            className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold rounded border-none cursor-pointer"
          >
            ✓ Acknowledge & Clear — Next Visitor
          </button>
        </div>
      )}

      {person && (status === "clear" || status === "barred") && (
        <div className="mt-4 max-w-xl bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">License Data</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-800">
            <div><span className="text-gray-500">Name:</span> {displayName || "—"}</div>
            <div><span className="text-gray-500">DOB:</span> {formatDOB(person.dob) || "—"}</div>
            <div><span className="text-gray-500">License:</span> {person.oln || "—"}</div>
            <div><span className="text-gray-500">Sex:</span> {person.sex || "—"}</div>
            {(person.address || person.city || person.state || person.zip) && (
              <div className="sm:col-span-2">
                <span className="text-gray-500">Address:</span>{" "}
                {[
                  person.address,
                  person.city,
                  [person.state, person.zip].filter(Boolean).join(" "),
                ].filter(Boolean).join(", ")}
              </div>
            )}
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

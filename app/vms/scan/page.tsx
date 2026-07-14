"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import SecurityAlert from "../../../components/SecurityAlert"
import { fireAlert } from "@/lib/alerts"
import { Community, Unit, Resident } from "@/lib/types"

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

function decodeSex(code: string): string {
  if (code === "1") return "M"
  if (code === "2") return "F"
  return code || "—"
}

function formatHeight(raw: string): string {
  const m = raw.match(/^0*(\d+)\s*in/i)
  if (m) {
    const total = parseInt(m[1], 10)
    return `${Math.floor(total / 12)}'${total % 12}"`
  }
  return raw || "—"
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

  const [person,     setPerson]      = useState<any>(null)
  const [alertPerson,setAlertPerson] = useState<any>(null)
  const [boloHit,    setBoloHit]     = useState<any>(null)  // active BOLO match (non-blocking)
  const [status,     setStatus]      = useState<Status>("idle")

  // Inline visitor-entry form (shown after a CLEAR scan)
  const [communities,   setCommunities]   = useState<Community[]>([])
  const [communityId,   setCommunityId]   = useState("")
  const [units,         setUnits]         = useState<Unit[]>([])
  const [unitId,        setUnitId]        = useState("")
  const [residents,     setResidents]     = useState<Resident[]>([])
  const [residentId,    setResidentId]    = useState("")
  const [personType,    setPersonType]    = useState("Visitor")
  const [destination,   setDestination]   = useState("")
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState("")
  const [logId,         setLogId]         = useState<string | null>(null) // id of the auto-logged visitor_logs row
  const [detailMsg,     setDetailMsg]     = useState("")  // subtle "saved" feedback on enrichment updates
  const autoSavedRef    = useRef(false)                   // dedupe auto-log per scan result

  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const lastResultRef     = useRef<number>(0)
  const scanTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barredFiredRef    = useRef<boolean>(false) // dedupe BARRED audit/alert
  const boloFiredRef      = useRef<boolean>(false) // dedupe BOLO alert
  const lastProcessedRef  = useRef<string>("")   // exact text passed to processScan last
  const RESET_GRACE_MS    = 250                  // ignore input this long after result appears
  const SCAN_END_MS       = 200                  // pause this long => scan finished, process

  useEffect(() => {
    // Load all communities for the dropdown, then pick the active one:
    // saved in localStorage if present, otherwise default to St Luke Apartments.
    supabase.from("communities").select("*").order("name").then(({ data }) => {
      const list = (data || []) as Community[]
      setCommunities(list)
      if (list.length === 0) return
      const savedId = (typeof window !== "undefined" && localStorage.getItem("asg-current-community-id")) || ""
      const savedMatch = list.find(c => c.id === savedId)
      const stLuke     = list.find(c => /st\.?\s*luke/i.test(c.name))
      const chosen     = savedMatch || stLuke || list[0]
      changeCommunity(chosen.id, chosen.name)
    })
    textareaRef.current?.focus()
  }, [])

  function changeCommunity(id: string, name: string) {
    setCommunityId(id)
    if (typeof window !== "undefined") {
      localStorage.setItem("asg-current-community-id",   id)
      localStorage.setItem("asg-current-community-name", name)
    }
    setUnitId("")
    setResidents([])
    setResidentId("")
    loadUnits(id)
  }

  async function loadUnits(commId: string) {
    if (!commId) { setUnits([]); return }
    const { data } = await supabase.from("units").select("*").eq("community_id", commId)
    setUnits(data || [])
  }

  async function loadResidents(rawUnit: string) {
    const unit = rawUnit.trim()
    setUnitId(unit)
    setResidents([])
    setResidentId("")
    if (!unit || !communityId) return
    const { data } = await supabase.from("residents").select("*")
      .eq("community_id", communityId).eq("unit_number", unit)
      .not("name", "is", null)
    setResidents(data || [])
  }

  // Auto-log the visitor the moment a scan comes back CLEAR — no click required,
  // so an entry is never missed. Unit/resident/type default now and can be
  // enriched afterward (see updateEntry), which patches this same row.
  async function autoLogEntry(p: any) {
    setSaving(true); setSaveError("")
    try {
      // Duplicate-scan guard: if the SAME license (OLN) was auto-logged within the
      // last 60s, reuse that row instead of creating a second entry. Enrichment
      // (unit/resident/type) then patches the original.
      if (p.oln) {
        const cutoff = new Date(Date.now() - 60_000).toISOString()
        const { data: recent } = await supabase.from("visitor_logs")
          .select("id").eq("dl_scanned", true).eq("oln", p.oln)
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false }).limit(1).maybeSingle()
        if (recent) {
          setLogId(recent.id)
          setDetailMsg("Already logged moments ago — not duplicated")
          setTimeout(() => setDetailMsg(""), 2500)
          return
        }
      }

      let visitorId: string | null = null
      const { data: existing } = await supabase
        .from("visitors").select("id")
        .ilike("first_name", p.first_name).ilike("last_name", p.last_name)
        .limit(1).maybeSingle()
      if (existing) {
        visitorId = existing.id
      } else {
        const { data: created, error: createErr } = await supabase
          .from("visitors")
          .insert({
            first_name:   p.first_name,
            last_name:    p.last_name,
            dob:          parseDOBToISO(p.dob),
            oln:          p.oln || null,
            community_id: communityId || null,
          })
          .select("id").single()
        if (createErr) { setSaveError("Auto-log failed to create visitor: " + createErr.message); return }
        visitorId = created!.id
      }
      const { data: logRow, error: logErr } = await supabase.from("visitor_logs").insert({
        visitor_id:     visitorId,
        first_name:     p.first_name,
        last_name:      p.last_name,
        middle_name:    p.middle_name || null,
        person_type:    personType,
        community_id:   communityId || null,
        unit_number:    unitId || null,
        resident_name:  null,
        entry_method:   "scan",
        watchlist_hit:  false,
        // DL scan fields — full AAMVA record
        dl_scanned:     true,
        dob:            parseDOBToISO(p.dob),
        oln:            p.oln || null,
        address:        p.address || null,
        city:           p.city || null,
        state_of_issue: p.state || null,
        zip:            p.zip || null,
        sex:            p.sex || null,
        height:         p.height || null,
        eye_color:      p.eye_color || null,
        created_at:     new Date().toISOString(),
      }).select("id").single()
      if (logErr) { setSaveError("Auto-log failed: " + logErr.message); return }
      setLogId(logRow!.id)
      const dlName = `${p.first_name} ${p.last_name}`.trim()
      supabase.auth.getUser().then(({ data: { user } }) => {
        supabase.from("audit_logs").insert({
          user_email: user?.email || "unknown",
          action: "created", resource_type: "Visitor Check-In (DL Scan)", resource_id: logRow!.id,
          detail: `${dlName} auto-logged on license scan — ${personType}${unitId ? ` · Unit ${unitId}` : ""}`,
          created_at: new Date().toISOString(),
        })
      })
    } finally {
      setSaving(false)
    }
  }

  // Patch the already-logged row as the guard fills in unit / resident / type.
  async function updateEntry(patch: Record<string, any>) {
    if (!logId) return
    setSaveError(""); setDetailMsg("Saving…")
    const { error } = await supabase.from("visitor_logs").update(patch).eq("id", logId)
    setDetailMsg(error ? "" : "✓ Saved")
    if (error) setSaveError("Update failed: " + error.message)
    else setTimeout(() => setDetailMsg(""), 1500)
  }

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

  // Active BOLO match (non-blocking). BOLO stores a single full-name field.
  async function findBoloHit(first: string, last: string, oln: string) {
    if (oln) {
      const { data } = await supabase.from("bolos").select("*").eq("active", true).ilike("oln", oln)
      if (data && data.length > 0) return data[0]
    }
    if (last) {
      const { data } = await supabase.from("bolos").select("*").eq("active", true).ilike("name", `%${last}%`)
      const hits = (data || []).filter((b: any) => {
        const n = (b.name || "").toLowerCase()
        return n.includes(last.toLowerCase()) && (!first || n.includes(first.toLowerCase()))
      })
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
    const [hit, bolo] = await Promise.all([
      findWatchlistHit(parsed.first_name, parsed.last_name, parsed.oln),
      findBoloHit(parsed.first_name, parsed.last_name, parsed.oln),
    ])
    setBoloHit(bolo || null)
    // Non-blocking BOLO alert (once per scan). Does not deny entry.
    if (bolo && !boloFiredRef.current) {
      boloFiredRef.current = true
      const communityName = (typeof window !== "undefined" && localStorage.getItem("asg-current-community-name")) || "Unknown"
      const communityId   = (typeof window !== "undefined" && localStorage.getItem("asg-current-community-id")) || null
      fireAlert({
        type:         "bolo_hit",
        severity:     "high",
        community_id: communityId,
        subject:      `⚠ BOLO MATCH — ${communityName}`,
        body:         `A person matching an active BOLO was scanned at ${communityName}. Entry is not automatically blocked — stay alert.`,
        payload: {
          Community: communityName,
          Source:    "License scan",
          Person:    `${parsed.first_name} ${parsed.last_name}`.trim(),
          "BOLO":    bolo.name || "",
          Reason:    bolo.reason || bolo.description || "",
          OLN:       parsed.oln || "",
          Time:      new Date().toLocaleString("en-US"),
        },
      })
    }
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
      // Auto-save the visitor entry immediately on a CLEAR result (once).
      if (!autoSavedRef.current) {
        autoSavedRef.current = true
        autoLogEntry(parsed)
      }
    }
    lastResultRef.current = Date.now()
  }

  function reset() {
    barredFiredRef.current = false
    boloFiredRef.current = false
    autoSavedRef.current = false
    lastProcessedRef.current = ""
    if (textareaRef.current) textareaRef.current.value = ""
    setPerson(null)
    setAlertPerson(null)
    setBoloHit(null)
    setStatus("idle")
    setUnitId("")
    setResidents([])
    setResidentId("")
    setPersonType("Visitor")
    setDestination("")
    setSaveError("")
    setLogId(null)
    setDetailMsg("")
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
      boloFiredRef.current = false
      autoSavedRef.current = false
      lastProcessedRef.current = ""
      setPerson(null)
      setAlertPerson(null)
      setBoloHit(null)
      setStatus("idle")
      setUnitId("")
      setResidents([])
      setResidentId("")
      setPersonType("Visitor")
      setDestination("")
      setSaveError("")
      setLogId(null)
      setDetailMsg("")
    }

    // (Re)start the scan-end timer. Each new keystroke pushes it back; when
    // the scanner finally pauses for SCAN_END_MS, we process the buffer.
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
    scanTimerRef.current = setTimeout(() => {
      const val = textareaRef.current?.value || ""
      if (val.trim().length >= 20) processScan(val)
    }, SCAN_END_MS)
  }

  const displayName   = person ? `${person.first_name} ${person.last_name}`.trim() : ""
  const communityName = communities.find(c => c.id === communityId)?.name || ""

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <SecurityAlert person={alertPerson} onClose={() => setAlertPerson(null)} />

      <h2 className="text-2xl font-bold mb-1">📷 Scan Driver License</h2>
      <p className="text-sm text-gray-500 mb-4">
        Scan with the connected reader. Result auto-checks against the watchlist and,
        when clear, the visitor entry is logged automatically. The next scan clears the previous result.
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

      <div className="mt-3 max-w-xl">
        <Link href="/vms">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md cursor-pointer transition-colors">
            ← Back to VMS Check-In
          </div>
        </Link>
      </div>

      {status === "checking" && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-gray-100 border border-gray-300 text-gray-700 text-sm">
          Checking watchlist…
        </div>
      )}

      {status === "clear" && (
        <div className="mt-4 px-5 py-4 rounded-xl bg-green-900 border-2 border-green-500 text-white">
          <div className="text-2xl font-bold">🟢 CLEAR — OK to proceed</div>
          {displayName && <div className="text-lg mt-1 font-semibold">{displayName}</div>}
          {communityName && <div className="text-green-300 text-xs mt-1">📍 {communityName}</div>}
          <div className="mt-2 text-sm font-semibold">
            {logId ? "✅ Entry auto-logged" : saving ? "Logging entry…" : ""}
          </div>
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

      {/* BOLO — non-blocking. Shown alongside a CLEAR or BARRED result. */}
      {boloHit && (status === "clear" || status === "barred") && (
        <div className="mt-4 px-5 py-4 rounded-xl bg-amber-500 border-2 border-amber-600 text-white">
          <div className="text-2xl font-bold">⚠ BOLO — Be On the Lookout</div>
          {boloHit.name && <div className="text-lg mt-1 font-semibold">{boloHit.name}</div>}
          {(boloHit.reason || boloHit.description) && (
            <div className="text-amber-50 text-sm mt-1">{boloHit.reason || boloHit.description}</div>
          )}
          {boloHit.firearm_flag && <div className="mt-2 inline-block px-2 py-0.5 bg-red-700 rounded text-xs font-bold">🔫 Firearm</div>}
          <div className="text-amber-100 text-xs mt-2">
            {status === "barred" ? "This person is also barred — entry denied above." : "Not barred — entry is allowed. Notify a supervisor and stay alert."}
          </div>
        </div>
      )}

      {/* Inline visitor-entry form — appears under CLEAR result so guard can capture
          unit + resident + type without leaving the scan page */}
      {status === "clear" && person && (
        <div className="mt-4 max-w-xl bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-baseline mb-1 flex-wrap gap-2">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Visitor Entry {logId ? "· auto-logged" : ""}</div>
            {communityName && (
              <div className="text-xs text-gray-600">📍 <span className="font-semibold">{communityName}</span></div>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">Entry is already saved. Add unit / resident / type below — changes save automatically.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Unit</label>
              <select
                value={unitId}
                onChange={e => { const u = e.target.value; loadResidents(u); updateEntry({ unit_number: u || null, resident_name: null }) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Select Unit</option>
                {units.map(u => (
                  <option key={u.id} value={u.unit_number.trim()}>{u.unit_number.trim()}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Resident Visiting</label>
              <select
                value={residentId}
                onChange={e => { setResidentId(e.target.value); const r = residents.find(x => x.id === e.target.value); updateEntry({ resident_name: r?.name || null }) }}
                disabled={residents.length === 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
              >
                <option value="">{residents.length === 0 ? "(select unit first)" : "Select Resident"}</option>
                {residents.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
              <select
                value={personType}
                onChange={e => { setPersonType(e.target.value); updateEntry({ person_type: e.target.value }) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option>Visitor</option>
                <option>Delivery</option>
                <option>Contractor</option>
                <option>Employee</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Destination <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={destination}
                onChange={e => setDestination(e.target.value)}
                onBlur={e => { if (e.target.value !== "") updateEntry({ destination: e.target.value || null }) }}
                placeholder="e.g. Leasing office, Pool, Unit 4B…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {saveError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{saveError}</div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-semibold text-green-700">
              {logId ? "✅ Entry logged" : saving ? "Logging…" : ""}
              {detailMsg && <span className="ml-2 text-gray-400 font-normal">{detailMsg}</span>}
            </div>
            <button
              onClick={reset}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-md border-none cursor-pointer"
            >
              ✓ Done — Next Visitor
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">License Data</div>
              <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                Full record stored
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-800">
              <div><span className="text-gray-500">Name:</span> {[person.first_name, person.middle_name, person.last_name].filter(Boolean).join(" ") || "—"}</div>
              <div><span className="text-gray-500">DOB:</span> {formatDOB(person.dob) || "—"}</div>
              <div><span className="text-gray-500">License #:</span> {person.oln || "—"}</div>
              <div><span className="text-gray-500">Sex:</span> {decodeSex(person.sex)}</div>
              {person.height   && <div><span className="text-gray-500">Height:</span> {formatHeight(person.height)}</div>}
              {person.eye_color && <div><span className="text-gray-500">Eyes:</span> {person.eye_color}</div>}
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
          </div>
        </div>
      )}

      {/* BARRED — show License Data on its own (no inline-save form) */}
      {status === "barred" && person && (
        <div className="mt-4 max-w-xl bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">License Data</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-800">
            <div><span className="text-gray-500">Name:</span> {[person.first_name, person.middle_name, person.last_name].filter(Boolean).join(" ") || "—"}</div>
            <div><span className="text-gray-500">DOB:</span> {formatDOB(person.dob) || "—"}</div>
            <div><span className="text-gray-500">License #:</span> {person.oln || "—"}</div>
            <div><span className="text-gray-500">Sex:</span> {decodeSex(person.sex)}</div>
            {person.height    && <div><span className="text-gray-500">Height:</span> {formatHeight(person.height)}</div>}
            {person.eye_color && <div><span className="text-gray-500">Eyes:</span> {person.eye_color}</div>}
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
        </div>
      )}
    </div>
  )
}

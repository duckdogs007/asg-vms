"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { generatePassNumber, printPass, PassData } from "@/lib/passPrint"

// Records a numbered pass to visitor_passes (audit-logged) and prints it. Used
// from the manual check-in and the scan page. Visitor info is prefilled; the
// officer confirms/adds vehicle details + validity for a temp parking pass.
export default function PassPrinterModal({
  open, onClose, communityId, communityName, visitorName, personType = "Visitor",
  unitNumber = null, residentName = null, visitorLogId = null, defaultPlate = "",
}: {
  open: boolean
  onClose: () => void
  communityId: string | null
  communityName: string
  visitorName: string
  personType?: string | null
  unitNumber?: string | null
  residentName?: string | null
  visitorLogId?: string | null
  defaultPlate?: string
}) {
  const [plate, setPlate]     = useState("")
  const [state, setState]     = useState("")
  const [vehicle, setVehicle] = useState("")
  const [days, setDays]       = useState(1)   // 1 = today only
  const [busy, setBusy]       = useState("")
  const [msg, setMsg]         = useState("")

  useEffect(() => { if (open) { setPlate(defaultPlate || ""); setState(""); setVehicle(""); setDays(1); setMsg("") } }, [open, defaultPlate])

  if (!open) return null

  function validRange() {
    const today = new Date()
    const to = new Date(today); to.setDate(to.getDate() + (days - 1))
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    return { from: iso(today), to: iso(to) }
  }

  async function issue(type: "visitor" | "vehicle") {
    if (type === "vehicle" && !plate.trim()) { setMsg("⚠ Enter a plate for the vehicle pass."); return }
    setBusy(type); setMsg("")
    const pass_number = generatePassNumber(type)
    const range = type === "vehicle" ? validRange() : null
    const { data: { user } } = await supabase.auth.getUser()
    const row = {
      pass_number, pass_type: type,
      community_id: communityId || null,
      visitor_log_id: visitorLogId || null,
      visitor_name: visitorName || null,
      person_type: personType || null,
      unit_number: unitNumber || null,
      resident_name: residentName || null,
      plate: type === "vehicle" ? plate.trim().toUpperCase() : null,
      plate_state: type === "vehicle" ? (state.trim().toUpperCase() || null) : null,
      vehicle: type === "vehicle" ? (vehicle.trim() || null) : null,
      valid_from: range?.from || null,
      valid_to: range?.to || null,
      issued_by: user?.email || null,
    }
    const { error } = await supabase.from("visitor_passes").insert(row)
    if (error) { setBusy(""); setMsg("⚠ " + error.message); return }
    supabase.from("audit_logs").insert({
      user_email: user?.email || "unknown",
      action: "created", resource_type: type === "vehicle" ? "Vehicle Temp Pass" : "Visitor Pass", resource_id: "",
      detail: `${type === "vehicle" ? "Temp parking" : "Visitor"} pass #${pass_number} — ${visitorName}${type === "vehicle" ? ` · ${row.plate}` : ""}`,
      created_at: new Date().toISOString(),
    })
    const pass: PassData = { ...row, community_name: communityName, issued_at: new Date().toISOString() } as PassData
    printPass(pass)
    setBusy(""); setMsg(`✅ Pass #${pass_number} issued & printing.`)
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
  const labelCls = "block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1"

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md my-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🖨 Print Passes</h2>
            <div className="text-xs text-gray-500 mt-0.5">{visitorName || "Visitor"}{unitNumber ? ` · Unit ${unitNumber}` : ""} · {communityName}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 bg-transparent border-none cursor-pointer text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Visitor pass */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-700">Visitor entry pass (name · destination)</div>
            <button onClick={() => issue("visitor")} disabled={busy === "visitor" || !visitorName}
              className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50 whitespace-nowrap">
              {busy === "visitor" ? "…" : "🖨 Visitor Pass"}
            </button>
          </div>

          {/* Vehicle temp pass */}
          <div className="border-t border-gray-100 pt-4">
            <div className="text-sm font-semibold text-gray-800 mb-2">Temporary Parking Pass</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Plate *</label>
                <input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} className={inputCls} /></div>
              <div><label className={labelCls}>State</label>
                <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2} className={inputCls} /></div>
              <div className="col-span-2"><label className={labelCls}>Vehicle (make / model / color)</label>
                <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="Silver Honda Accord" className={inputCls} /></div>
              <div className="col-span-2"><label className={labelCls}>Valid for</label>
                <select value={days} onChange={e => setDays(Number(e.target.value))} className={inputCls}>
                  <option value={1}>Today only</option>
                  <option value={2}>48 hours</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                </select></div>
            </div>
            <button onClick={() => issue("vehicle")} disabled={busy === "vehicle" || !plate.trim()}
              className="mt-3 w-full px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
              {busy === "vehicle" ? "…" : "🖨 Vehicle Temp Pass"}
            </button>
          </div>

          {msg && <div className={`text-sm ${msg.startsWith("✅") ? "text-green-700" : "text-red-600"}`}>{msg}</div>}
          <p className="text-[11px] text-gray-400">Each pass is numbered, saved, and audit-logged. Allow pop-ups so the print window can open.</p>
        </div>
      </div>
    </div>
  )
}

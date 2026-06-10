"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import Papa from "papaparse"

// St Luke is the default location, but the dropdown lists all communities so
// the checklist can be reused elsewhere if needed.
const ST_LUKE_ID = "c1f93a83-8f04-458a-b00c-1ff8cf46edd1"
const GATE_COUNT = 7

const INSTRUCTIONS = [
  "Access and check each numbered gate.",
  "Test the gate to ensure it operates as intended.",
  "Confirm the gate opens and closes properly.",
  "Confirm the lock/security mechanism locks as intended.",
  "Inspect both vehicle and pedestrian components for damage.",
  "Annotate any issues, observations, or actions taken.",
  "Report any issues immediately.",
]

// The three inspection categories, each evaluated for the Vehicle and
// Pedestrian gate. `bad` is the answer that signals a problem (used to flag
// rows in the saved-records list).
const INSPECTIONS = [
  { key: "operation", label: "Gate Operation — Opens as Intended", bad: "no" },
  { key: "locks",     label: "Locks / Secures as Intended",        bad: "no" },
  { key: "damage",    label: "Damage Observed",                    bad: "yes" },
] as const

type YN = "yes" | "no" | ""

interface GateRow {
  initials: string
  operation_vehicle: YN; operation_pedestrian: YN
  locks_vehicle: YN;     locks_pedestrian: YN
  damage_vehicle: YN;    damage_pedestrian: YN
  notes: string
  photos: File[]
}

function emptyGate(): GateRow {
  return {
    initials: "",
    operation_vehicle: "", operation_pedestrian: "",
    locks_vehicle: "",     locks_pedestrian: "",
    damage_vehicle: "",    damage_pedestrian: "",
    notes: "", photos: [],
  }
}

function gateHasIssue(g: any): boolean {
  return (
    g.operation_vehicle === "no" || g.operation_pedestrian === "no" ||
    g.locks_vehicle === "no"     || g.locks_pedestrian === "no" ||
    g.damage_vehicle === "yes"   || g.damage_pedestrian === "yes"
  )
}

const todayStr = () => new Date().toISOString().split("T")[0]

export default function GateChecklist({
  communities, officerName, isAdmin,
}: {
  communities: { id: string; name: string }[]
  officerName: string
  isAdmin: boolean
}) {
  const hasStLuke = communities.some(c => c.id === ST_LUKE_ID)

  const [locationId, setLocationId] = useState(hasStLuke ? ST_LUKE_ID : "")
  const [date,       setDate]       = useState(todayStr())
  const [guardName,  setGuardName]  = useState(officerName || "")
  const [shift,      setShift]      = useState("Day")
  const [startTime,  setStartTime]  = useState("")
  const [endTime,    setEndTime]    = useState("")
  const [gates,      setGates]      = useState<GateRow[]>(() => Array.from({ length: GATE_COUNT }, emptyGate))
  const [addlNotes,  setAddlNotes]  = useState("")
  const [genPhotos,  setGenPhotos]  = useState<File[]>([])
  const [signature,  setSignature]  = useState("")

  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")
  const [message, setMessage] = useState("")

  const [list,       setList]       = useState<any[]>([])
  const [listLoading,setListLoading]= useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => { setGuardName(prev => prev || officerName || "") }, [officerName])
  useEffect(() => { if (locationId) loadList() }, [locationId])

  async function loadList() {
    setListLoading(true)
    const { data } = await supabase
      .from("gate_checklists")
      .select("*")
      .eq("community_id", locationId)
      .order("created_at", { ascending: false })
      .limit(30)
    setList(data || [])
    setListLoading(false)
  }

  function updateGate(i: number, field: keyof GateRow, value: any) {
    setGates(prev => prev.map((g, idx) => idx === i ? { ...g, [field]: value } : g))
  }

  async function uploadPhotos(files: File[], prefix: string): Promise<string[]> {
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f    = files[i]
      const ext  = f.name.split(".").pop() || "jpg"
      const path = `${prefix}_${Date.now()}_${i}.${ext}`
      const { data: up, error: upErr } = await supabase.storage.from("photos").upload(path, f, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(up.path)
        urls.push(publicUrl)
      }
    }
    return urls
  }

  async function logActivity(detail: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from("audit_logs").insert({
      user_email: user?.email || "unknown",
      action: "created", resource_type: "Gate Checklist", resource_id: "",
      detail, created_at: new Date().toISOString(),
    })
  }

  async function save() {
    setError(""); setMessage("")
    if (!locationId)        { setError("Location is required."); return }
    if (!guardName.trim())  { setError("Guard name is required."); return }
    if (!signature.trim())  { setError("Guard signature (type your full name) is required."); return }
    setSaving(true)
    try {
      // Upload all photos: per-gate, then general.
      const gatesOut: any[] = []
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i]
        const photoUrls = g.photos.length ? await uploadPhotos(g.photos, `gatecheck_g${i + 1}`) : []
        gatesOut.push({
          gate_number: i + 1,
          initials: g.initials || "",
          operation_vehicle: g.operation_vehicle, operation_pedestrian: g.operation_pedestrian,
          locks_vehicle: g.locks_vehicle,         locks_pedestrian: g.locks_pedestrian,
          damage_vehicle: g.damage_vehicle,       damage_pedestrian: g.damage_pedestrian,
          notes: g.notes || "",
          photo_urls: photoUrls,
        })
      }
      const generalPhotoUrls = genPhotos.length ? await uploadPhotos(genPhotos, "gatecheck_general") : []

      const now = new Date()
      const { error: insErr } = await supabase.from("gate_checklists").insert({
        community_id: locationId,
        checklist_date: date || todayStr(),
        guard_name: guardName.trim(),
        shift,
        start_time: startTime || null,
        end_time: endTime || null,
        gates: gatesOut,
        additional_notes: addlNotes || null,
        general_photo_urls: generalPhotoUrls.length ? generalPhotoUrls : null,
        guard_signature: signature.trim(),
        signature_date: todayStr(),
        signature_time: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        officer_name: officerName || null,
        created_at: now.toISOString(),
      })
      if (insErr) { setError(insErr.message); setSaving(false); return }

      await logActivity(`Gate checklist submitted — ${date}`)
      setMessage("✅ Gate checklist submitted.")
      // Reset the fillable fields; keep location/guard/shift for the next tour.
      setGates(Array.from({ length: GATE_COUNT }, emptyGate))
      setStartTime(""); setEndTime(""); setAddlNotes(""); setGenPhotos([]); setSignature("")
      await loadList()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1"
  const communityName = (id: string) => communities.find(c => c.id === id)?.name || "—"

  return (
    <div className="space-y-6">
      {/* HEADER CARD */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-center mb-4">
          <h3 className="text-xl font-bold text-gray-900 tracking-wide">SECURITY GATE CHECKLIST</h3>
          <p className="text-xs text-gray-500 mt-1">All numbered gates on the property must be checked during each tour.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Location *</label>
            <select value={locationId} onChange={e => setLocationId(e.target.value)} className={inputCls}>
              <option value="">— Select a location —</option>
              {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Guard Name *</label>
            <input value={guardName} onChange={e => setGuardName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Shift</label>
            <select value={shift} onChange={e => setShift(e.target.value)} className={inputCls}>
              <option>Day</option><option>Evening</option><option>Night</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Start Time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>End Time</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* INSTRUCTIONS */}
        <div className="mt-4 bg-blue-50/50 border border-blue-100 rounded-lg p-3">
          <div className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1.5">Instructions</div>
          <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
            {INSTRUCTIONS.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      </div>

      {/* GATES */}
      <div className="space-y-3">
        {gates.map((g, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 flex items-center justify-center bg-gray-900 text-white font-bold rounded-full text-sm">{i + 1}</span>
                <span className="font-semibold text-gray-800 text-sm">Gate {i + 1}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Initials</label>
                <input value={g.initials} onChange={e => updateGate(i, "initials", e.target.value)}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center uppercase" maxLength={5} />
              </div>
            </div>

            <div className="space-y-2">
              {INSPECTIONS.map(insp => (
                <div key={insp.key} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:items-center py-1.5 border-t border-gray-100 first:border-t-0">
                  <span className="text-xs font-medium text-gray-700">{insp.label}</span>
                  <YesNoPair label="Vehicle" value={(g as any)[`${insp.key}_vehicle`]}
                    onChange={v => updateGate(i, `${insp.key}_vehicle` as keyof GateRow, v)} bad={insp.bad} />
                  <YesNoPair label="Pedestrian" value={(g as any)[`${insp.key}_pedestrian`]}
                    onChange={v => updateGate(i, `${insp.key}_pedestrian` as keyof GateRow, v)} bad={insp.bad} />
                </div>
              ))}
            </div>

            <div className="mt-3">
              <label className={labelCls}>Notes / Action Taken</label>
              <input value={g.notes} onChange={e => updateGate(i, "notes", e.target.value)}
                placeholder="Describe any issue, location details, and action taken" className={inputCls} />
            </div>

            <div className="mt-2">
              <label className="text-xs text-gray-500">Photos (damage/issue)</label>
              <input type="file" accept="image/*" multiple
                onChange={e => updateGate(i, "photos", Array.from(e.target.files || []))}
                className="block text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-white hover:file:bg-gray-800 cursor-pointer mt-1" />
              {g.photos.length > 0 && <span className="text-xs text-gray-400">{g.photos.length} photo(s) attached</span>}
            </div>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className={labelCls}>Additional Notes / Observations</label>
          <textarea value={addlNotes} onChange={e => setAddlNotes(e.target.value)} rows={3} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-500">General Photos</label>
          <input type="file" accept="image/*" multiple
            onChange={e => setGenPhotos(Array.from(e.target.files || []))}
            className="block text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-white hover:file:bg-gray-800 cursor-pointer mt-1" />
          {genPhotos.length > 0 && <span className="text-xs text-gray-400">{genPhotos.length} photo(s) attached</span>}
        </div>
        <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          ⚠️ Report any issues immediately to supervisor / management.
        </div>
        <div>
          <label className={labelCls}>Guard Signature * <span className="font-normal text-gray-400">(type your full name to attest)</span></label>
          <input value={signature} onChange={e => setSignature(e.target.value)} placeholder="Full name" className={inputCls} />
          <p className="text-xs text-gray-400 mt-1">Date &amp; time are recorded automatically on submit.</p>
        </div>

        {error   && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-md">{message}</div>}

        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg border-none cursor-pointer disabled:opacity-50">
          {saving ? "Submitting…" : "Submit Gate Checklist"}
        </button>
      </div>

      {/* SAVED RECORDS */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-gray-900">Recent Checklists — {communityName(locationId)}</h4>
          <button onClick={loadList} className="text-xs text-blue-700 hover:underline border-none bg-transparent cursor-pointer">↻ Refresh</button>
        </div>
        {listLoading ? (
          <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center">No checklists submitted yet for this location.</div>
        ) : (
          <div className="space-y-2">
            {list.map(rec => {
              const recGates = Array.isArray(rec.gates) ? rec.gates : []
              const issues = recGates.filter(gateHasIssue).length
              const open = expandedId === rec.id
              return (
                <div key={rec.id} className="border border-gray-200 rounded-lg">
                  <button onClick={() => setExpandedId(open ? null : rec.id)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-transparent border-none cursor-pointer hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-800">{rec.checklist_date || "—"}</span>
                      <span className="text-xs text-gray-500">{rec.shift || "—"}</span>
                      <span className="text-xs text-gray-500">{rec.guard_name || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {issues > 0
                        ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded">{issues} issue{issues > 1 ? "s" : ""}</span>
                        : <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded">All clear</span>}
                      <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {open && (
                    <div className="px-4 pb-4 border-t border-gray-100 text-sm">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-600 mt-3 mb-3">
                        <div><span className="text-gray-400">Start:</span> {rec.start_time || "—"}</div>
                        <div><span className="text-gray-400">End:</span> {rec.end_time || "—"}</div>
                        <div><span className="text-gray-400">Signed:</span> {rec.guard_signature || "—"} {rec.signature_time ? `· ${rec.signature_time}` : ""}</div>
                      </div>
                      <table className="w-full text-xs border border-gray-200">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            <th className="px-2 py-1 text-left">Gate</th>
                            <th className="px-2 py-1 text-left">Init.</th>
                            <th className="px-2 py-1 text-left">Operation V/P</th>
                            <th className="px-2 py-1 text-left">Locks V/P</th>
                            <th className="px-2 py-1 text-left">Damage V/P</th>
                            <th className="px-2 py-1 text-left">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recGates.map((g: any) => (
                            <tr key={g.gate_number} className={`border-t border-gray-100 ${gateHasIssue(g) ? "bg-red-50" : ""}`}>
                              <td className="px-2 py-1 font-semibold">{g.gate_number}</td>
                              <td className="px-2 py-1 uppercase">{g.initials || "—"}</td>
                              <td className="px-2 py-1">{ynShort(g.operation_vehicle)}/{ynShort(g.operation_pedestrian)}</td>
                              <td className="px-2 py-1">{ynShort(g.locks_vehicle)}/{ynShort(g.locks_pedestrian)}</td>
                              <td className="px-2 py-1">{ynShort(g.damage_vehicle)}/{ynShort(g.damage_pedestrian)}</td>
                              <td className="px-2 py-1">
                                {g.notes || "—"}
                                {Array.isArray(g.photo_urls) && g.photo_urls.map((u: string, k: number) => (
                                  <a key={k} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">📷</a>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {rec.additional_notes && <div className="mt-2 text-xs text-gray-600"><span className="text-gray-400">Additional:</span> {rec.additional_notes}</div>}
                      {Array.isArray(rec.general_photo_urls) && rec.general_photo_urls.length > 0 && (
                        <div className="mt-1 flex gap-2">
                          {rec.general_photo_urls.map((u: string, k: number) => (
                            <a key={k} href={u} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">📷 Photo {k + 1}</a>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => printRecord(rec)} className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded border-none cursor-pointer">⬇ PDF Report</button>
                        <button onClick={() => exportRecordCsv(rec)} className="px-2.5 py-1 bg-gray-700 hover:bg-gray-800 text-white text-xs font-semibold rounded border-none cursor-pointer">⬇ CSV</button>
                        {isAdmin && (
                          <button onClick={() => deleteRecord(rec)} className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded border-none cursor-pointer">🗑 Delete</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  async function deleteRecord(rec: any) {
    if (!window.confirm("Delete this gate checklist? This cannot be undone.")) return
    const { error } = await supabase.from("gate_checklists").delete().eq("id", rec.id)
    if (error) { window.alert("Delete failed: " + error.message); return }
    setExpandedId(null)
    await loadList()
  }

  // CSV — one row per gate, with the header fields repeated for context.
  function exportRecordCsv(rec: any) {
    const recGates = Array.isArray(rec.gates) ? rec.gates : []
    const rows = recGates.map((g: any) => ({
      Date: rec.checklist_date || "", Location: communityName(rec.community_id),
      Guard: rec.guard_name || "", Shift: rec.shift || "",
      "Start Time": rec.start_time || "", "End Time": rec.end_time || "",
      Gate: g.gate_number, Initials: g.initials || "",
      "Operation — Vehicle": ynLong(g.operation_vehicle), "Operation — Pedestrian": ynLong(g.operation_pedestrian),
      "Locks — Vehicle": ynLong(g.locks_vehicle), "Locks — Pedestrian": ynLong(g.locks_pedestrian),
      "Damage — Vehicle": ynLong(g.damage_vehicle), "Damage — Pedestrian": ynLong(g.damage_pedestrian),
      Notes: g.notes || "", Photos: Array.isArray(g.photo_urls) ? g.photo_urls.join(" ") : "",
      "Additional Notes": rec.additional_notes || "", Signature: rec.guard_signature || "",
    }))
    const csv  = Papa.unparse(rows)
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `gate-checklist-${communityName(rec.community_id).replace(/\s+/g, "-").toLowerCase()}-${rec.checklist_date || "record"}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // PDF — opens a print-friendly report; the browser's print dialog saves to PDF.
  function printRecord(rec: any) {
    const recGates = Array.isArray(rec.gates) ? rec.gates : []
    const gateRows = recGates.map((g: any) => {
      const issue = gateHasIssue(g)
      return `<tr${issue ? ' class="issue"' : ""}>
        <td class="c">${escHtml(g.gate_number)}</td>
        <td class="c">${escHtml(g.initials || "")}</td>
        <td class="c">${ynLong(g.operation_vehicle)}</td><td class="c">${ynLong(g.operation_pedestrian)}</td>
        <td class="c">${ynLong(g.locks_vehicle)}</td><td class="c">${ynLong(g.locks_pedestrian)}</td>
        <td class="c">${ynLong(g.damage_vehicle)}</td><td class="c">${ynLong(g.damage_pedestrian)}</td>
        <td>${escHtml(g.notes || "")}</td>
      </tr>`
    }).join("")

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>Gate Checklist — ${escHtml(communityName(rec.community_id))} — ${escHtml(rec.checklist_date || "")}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 28px; font-size: 12px; }
        h1 { text-align: center; font-size: 18px; margin: 0 0 2px; }
        .sub { text-align: center; color: #555; font-size: 11px; margin-bottom: 16px; }
        .meta { display: flex; flex-wrap: wrap; gap: 6px 28px; margin-bottom: 14px; }
        .meta div { font-size: 12px; }
        .meta .k { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { border: 1px solid #999; padding: 4px 6px; font-size: 11px; vertical-align: top; }
        th { background: #f0f0f0; text-align: center; font-size: 10px; }
        td.c { text-align: center; }
        tr.issue td { background: #fde8e8; }
        .grp { font-size: 9px; color: #444; }
        .foot { margin-top: 16px; font-size: 11px; }
        .sig { margin-top: 18px; display: flex; justify-content: space-between; gap: 24px; }
        .warn { margin-top: 14px; color: #b00; font-weight: bold; font-size: 11px; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>Security Gate Checklist</h1>
      <div class="sub">${escHtml(communityName(rec.community_id))} · All numbered gates must be checked during each tour.</div>
      <div class="meta">
        <div><span class="k">Date:</span> ${escHtml(rec.checklist_date || "—")}</div>
        <div><span class="k">Guard:</span> ${escHtml(rec.guard_name || "—")}</div>
        <div><span class="k">Shift:</span> ${escHtml(rec.shift || "—")}</div>
        <div><span class="k">Start:</span> ${escHtml(rec.start_time || "—")}</div>
        <div><span class="k">End:</span> ${escHtml(rec.end_time || "—")}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th rowspan="2">Gate</th><th rowspan="2">Init.</th>
            <th colspan="2">Gate Operation</th><th colspan="2">Locks / Secures</th><th colspan="2">Damage Observed</th>
            <th rowspan="2">Notes / Action Taken</th>
          </tr>
          <tr>
            <th class="grp">Vehicle</th><th class="grp">Pedestrian</th>
            <th class="grp">Vehicle</th><th class="grp">Pedestrian</th>
            <th class="grp">Vehicle</th><th class="grp">Pedestrian</th>
          </tr>
        </thead>
        <tbody>${gateRows}</tbody>
      </table>
      ${rec.additional_notes ? `<div class="foot"><b>Additional Notes / Observations:</b><br>${escHtml(rec.additional_notes)}</div>` : ""}
      <div class="warn">Report any issues immediately to supervisor / management.</div>
      <div class="sig">
        <div><b>Guard Signature:</b> ${escHtml(rec.guard_signature || "—")}</div>
        <div><b>Date:</b> ${escHtml(rec.signature_date || rec.checklist_date || "—")}</div>
        <div><b>Time:</b> ${escHtml(rec.signature_time || "—")}</div>
      </div>
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`

    const w = window.open("", "_blank")
    if (!w) { window.alert("Pop-up blocked — allow pop-ups to export the PDF report."); return }
    w.document.write(html)
    w.document.close()
  }
}

function ynShort(v: string): string {
  return v === "yes" ? "Y" : v === "no" ? "N" : "—"
}

function ynLong(v: string): string {
  return v === "yes" ? "Yes" : v === "no" ? "No" : "—"
}

function escHtml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function YesNoPair({ label, value, onChange, bad }: {
  label: string; value: YN; onChange: (v: YN) => void; bad: string
}) {
  const btn = (v: "yes" | "no") => {
    const selected = value === v
    const isBad = selected && v === bad
    const base = "px-2.5 py-1 text-xs font-semibold rounded border cursor-pointer transition-colors"
    const cls = selected
      ? (isBad ? "bg-red-600 text-white border-red-600" : "bg-green-600 text-white border-green-600")
      : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
    return (
      <button type="button" onClick={() => onChange(selected ? "" : v)} className={`${base} ${cls}`}>
        {v === "yes" ? "Yes" : "No"}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-gray-400 w-16 sm:w-auto sm:mr-1">{label}</span>
      {btn("yes")}{btn("no")}
    </div>
  )
}

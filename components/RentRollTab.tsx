"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"

// Rent Roll lives in the Property Hub: per-community resident/unit reference
// data. Read/search is open to all signed-in users (visitor verification);
// the destructive .xlsx import is admin-only. The hub's shared location
// dropdown drives `communityId`.
export default function RentRollTab({
  communityId,
  communityName,
  isAdmin,
}: {
  communityId: string
  communityName?: string
  isAdmin: boolean
}) {
  const [rentRoll,      setRentRoll]      = useState<any[]>([])
  const [loading,       setLoading]       = useState(false)
  const [search,        setSearch]        = useState("")
  const [showImport,    setShowImport]    = useState(false)
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importUnits,   setImportUnits]   = useState<string[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importStatus,  setImportStatus]  = useState("")
  const [importError,   setImportError]   = useState("")

  useEffect(() => {
    setShowImport(false); setImportPreview([]); setImportStatus(""); setImportError("")
    if (communityId) loadRentRoll()
    else { setRentRoll([]); setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId])

  async function loadRentRoll() {
    setLoading(true)
    let all: any[] = [], page = 0
    while (true) {
      const { data } = await supabase.from("residents").select("*")
        .eq("community_id", communityId)
        .order("unit_number", { ascending: true })
        .range(page * 1000, (page + 1) * 1000 - 1)
      if (!data || data.length === 0) break
      all = all.concat(data)
      if (data.length < 1000) break
      page++
    }
    setRentRoll(all)
    setLoading(false)
  }

  function excelDateToISO(serial: any): string | null {
    if (!serial || typeof serial !== "number") return null
    return new Date((serial - 25569) * 86400 * 1000).toISOString().split("T")[0]
  }

  async function handleImportFileSelect(file: File) {
    setImportPreview([]); setImportError(""); setImportStatus("")
    try {
      const XLSX = await import("xlsx")
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: "array" })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
      const residents: any[] = []
      const allUnits = new Set<string>()
      let currentUnit: string | null = null
      for (const row of rows) {
        const col0 = row[0]
        if (!col0 && !row[3]) continue
        if (typeof col0 === "string" && col0.startsWith("   ")) {
          currentUnit = col0.trim()
          allUnits.add(currentUnit)
          if (row[3]) residents.push({ unit_number: currentUnit, name: String(row[3]), relationship: String(row[4] || ""), move_in: excelDateToISO(row[7]) })
          else residents.push({ unit_number: currentUnit, name: null, relationship: null, move_in: null })
        } else if (!col0 && row[3] && currentUnit) {
          residents.push({ unit_number: currentUnit, name: String(row[3]), relationship: String(row[4] || ""), move_in: null })
        }
      }
      if (!residents.length) { setImportError("No resident data found."); return }
      setImportUnits([...allUnits])
      setImportPreview(residents)
    } catch (e: any) { setImportError("Could not read file: " + e.message) }
  }

  // Archive-on-change (item 27): the rent roll overwrites the HOH on turnover, so
  // before replacing residents we snapshot the prior tenancy of any unit whose HOH
  // changed into tenancy_history. This preserves the occupancy timeline that powers
  // the unit-activity move-in/eviction markers and back-dated HOH attribution.
  const HOH_RELS = new Set(["primary resident", "hoh", "head", "head of household"])
  const isHohRel = (rel?: string | null) => HOH_RELS.has((rel || "").trim().toLowerCase())
  const hohOf = (members: any[]) =>
    (members.find(m => isHohRel(m.relationship))?.name || "").trim().toLowerCase()

  const groupByUnit = (arr: any[]) => {
    const m = new Map<string, any[]>()
    for (const r of arr) {
      const u = (r.unit_number || "").trim()
      if (!m.has(u)) m.set(u, [])
      m.get(u)!.push(r)
    }
    return m
  }

  async function confirmImport() {
    if (!communityId) { setImportError("No location selected."); return }
    setImportLoading(true); setImportError(""); setImportStatus("")

    // 1) Load the CURRENT residents for this community (fresh, paginated).
    let current: any[] = []
    for (let page = 0; ; page++) {
      const { data, error } = await supabase.from("residents").select("*")
        .eq("community_id", communityId).range(page * 1000, (page + 1) * 1000 - 1)
      if (error) { setImportError("Load current failed: " + error.message); setImportLoading(false); return }
      if (!data || data.length === 0) break
      current = current.concat(data)
      if (data.length < 1000) break
    }

    // 2) Diff per unit; archive the prior household wherever the HOH changed (turnover).
    const today      = new Date().toISOString().split("T")[0]
    const curByUnit  = groupByUnit(current)
    const incByUnit  = groupByUnit(importPreview)
    const toArchive: any[] = []
    for (const [unit, curMembers] of curByUnit) {
      const incMembers = incByUnit.get(unit) || []
      if (hohOf(curMembers) === hohOf(incMembers)) continue   // same HOH → not a turnover
      for (const m of curMembers) {
        if (!m.name) continue                                  // skip vacant placeholders
        toArchive.push({
          resident_id: m.id, community_id: communityId, unit_number: unit,
          name: m.name, relationship: m.relationship, is_hoh: isHohRel(m.relationship),
          move_in: m.move_in, lease_from: m.lease_from, lease_to: m.lease_to ?? null,
          move_out: m.move_out ?? today,   // actual move-out isn't in the file → import date
          archived_reason: "rent_roll_import",
        })
      }
    }

    // 3) Archive prior tenancies BEFORE overwriting.
    for (let i = 0; i < toArchive.length; i += 200) {
      const { error } = await supabase.from("tenancy_history").insert(toArchive.slice(i, i + 200))
      if (error) { setImportError("Archive failed: " + error.message); setImportLoading(false); return }
    }

    // 4) Replace residents with the incoming roll, setting lifecycle fields.
    const { error: delErr } = await supabase.from("residents").delete().eq("community_id", communityId)
    if (delErr) { setImportError("Delete failed: " + delErr.message); setImportLoading(false); return }
    const rows = importPreview.map(r => ({
      ...r, community_id: communityId,
      is_hoh: isHohRel(r.relationship), status: "active",
    }))
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("residents").insert(rows.slice(i, i + 200))
      if (error) { setImportError("Insert failed: " + error.message); setImportLoading(false); return }
    }

    // 5) Units (unchanged).
    await supabase.from("units").delete().eq("community_id", communityId)
    const uniqueUnits = importUnits.map(u => ({ unit_number: u.trim(), community_id: communityId }))
    for (let i = 0; i < uniqueUnits.length; i += 200) {
      await supabase.from("units").insert(uniqueUnits.slice(i, i + 200))
    }

    setImportLoading(false)
    const archivedUnits = new Set(toArchive.map(a => a.unit_number)).size
    setImportStatus(`✅ ${rows.length} residents across ${uniqueUnits.length} units imported.` +
      (archivedUnits ? ` ${archivedUnits} prior tenanc${archivedUnits === 1 ? "y" : "ies"} archived to history.` : ""))
    setImportPreview([]); setShowImport(false)
    loadRentRoll()
  }

  const filtered = rentRoll.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.name?.toLowerCase().includes(q) || r.unit_number?.toLowerCase().includes(q)
  })

  const labelCls = "block text-xs font-semibold text-gray-600 mb-1"
  const dates    = filtered.map(r => r.created_at).filter(Boolean)
  const lastImport = dates.length ? new Date(dates.reduce((a, b) => a > b ? a : b)) : null

  return (
    <div>
      {isAdmin && (
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => { setShowImport(!showImport); setImportPreview([]); setImportError(""); setImportStatus("") }}
            className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer">
            {showImport ? "✕ Cancel Import" : "⬆ Import Rent Roll"}
          </button>
          {importStatus && <span className="text-green-600 text-sm font-medium">{importStatus}</span>}
        </div>
      )}

      {isAdmin && showImport && (
        <div className="border border-blue-200 rounded-xl bg-blue-50 p-5 mb-5">
          <h3 className="font-bold text-gray-800 mb-1">Import Rent Roll (.xlsx from Yardi)</h3>
          <p className="text-sm text-gray-600 mb-3">
            Importing to <strong>{communityName || "the selected location"}</strong>.
            <span className="text-orange-600"> ⚠ Replaces the current residents/units; any unit whose Head of Household changed is archived to tenancy history first.</span>
          </p>
          <label className={labelCls}>Select File</label>
          <input type="file" accept=".xlsx,.xls,.csv"
            onChange={e => { if (e.target.files?.[0]) handleImportFileSelect(e.target.files[0]) }}
            className="text-sm text-gray-600 w-full file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 mb-3" />
          {importError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-3">{importError}</div>}
          {importPreview.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-700">
                  <strong>{importPreview.length}</strong> residents across <strong>{new Set(importPreview.map(r => r.unit_number)).size}</strong> units ready.
                </div>
                <button onClick={confirmImport} disabled={importLoading}
                  className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer disabled:opacity-50">
                  {importLoading ? "Importing..." : "✓ Confirm Import"}
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Unit</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Name</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Relationship</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Move-In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 8).map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-3 py-1.5 font-mono text-blue-700">{r.unit_number}</td>
                        <td className="px-3 py-1.5">{r.name ?? <span className="text-gray-400 italic">Vacant</span>}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.relationship}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.move_in || "—"}</td>
                      </tr>
                    ))}
                    {importPreview.length > 8 && (
                      <tr><td colSpan={4} className="px-3 py-1.5 text-gray-400 text-center">…and {importPreview.length - 8} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{filtered.length} residents</span>
          {lastImport && <span className="text-xs text-gray-400">· Last imported {lastImport.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or unit..."
          className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600" />
      </div>

      {loading && <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>}
      {!loading && filtered.length === 0 && (
        <div className="text-gray-500 text-sm py-8 text-center">
          {communityId ? "No residents found for this location." : "Select a location to view residents."}
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Unit</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Relationship</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Move-In</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id || i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  <td className="px-4 py-3 font-mono font-medium text-blue-700">{r.unit_number || "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.name ? r.name : <span className="text-gray-400 italic">Vacant</span>}</td>
                  <td className="px-4 py-3 text-gray-500">{r.relationship || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{r.move_in ? new Date(r.move_in).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

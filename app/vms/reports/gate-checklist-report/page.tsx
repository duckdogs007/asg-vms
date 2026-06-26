"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthBounds(ym: string) {
  const [year, month] = ym.split("-").map(Number)
  const from = `${ym}-01`
  const lastDay = new Date(year, month, 0).getDate()
  return { from, to: `${ym}-${String(lastDay).padStart(2, "0")}` }
}

function gateFlags(g: any): boolean {
  return (
    g.operation_vehicle   === "no"  ||
    g.operation_pedestrian=== "no"  ||
    g.locks_vehicle       === "no"  ||
    g.locks_pedestrian    === "no"  ||
    g.damage_vehicle      === "yes" ||
    g.damage_pedestrian   === "yes"
  )
}

export default function GateChecklistReportPage() {
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  const [community,   setCommunity]   = useState("")
  const [month,       setMonth]       = useState(thisMonth())
  const [checklists,  setChecklists]  = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)
  const [ran,         setRan]         = useState(false)

  useEffect(() => {
    supabase.from("communities").select("id,name").order("name").then(({ data }) => {
      const list = data || []
      setCommunities(list)
      const saved = typeof window !== "undefined" ? localStorage.getItem("asg-current-community-id") || "" : ""
      const match = list.find((c: any) => c.id === saved)
      const first = match || list[0]
      if (first) setCommunity(first.id)
    })
  }, [])

  async function generate() {
    if (!community || !month) return
    setLoading(true); setRan(false); setChecklists([])
    const { from, to } = monthBounds(month)
    const { data } = await supabase.from("gate_checklists")
      .select("*")
      .eq("community_id", community)
      .gte("checklist_date", from)
      .lte("checklist_date", to)
      .order("checklist_date", { ascending: true })
      .order("shift", { ascending: true })
    setChecklists(data || [])
    setLoading(false); setRan(true)
  }

  const communityName = communities.find(c => c.id === community)?.name || ""
  const [yr, mo]  = month.split("-")
  const monthLabel = new Date(Number(yr), Number(mo) - 1, 1)
    .toLocaleString("en-US", { month: "long", year: "numeric" })

  const allGates        = checklists.flatMap(c => Array.isArray(c.gates) ? c.gates : [])
  const flaggedGates    = allGates.filter(gateFlags)
  const flaggedShifts   = checklists.filter(c => (c.gates || []).some(gateFlags))
  const officers        = [...new Set(checklists.map(c => c.guard_name || c.officer_name).filter(Boolean))]

  function printReport() {
    const shiftRows = checklists.map(c => {
      const gates: any[] = c.gates || []
      const nFlags = gates.filter(gateFlags).length
      const cell = (val: string, badIs: "yes" | "no") => {
        if (!val) return `<td style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center;color:#9ca3af">—</td>`
        const bad = val === badIs
        return `<td style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center;color:${bad ? "#dc2626" : "#16a34a"};font-weight:${bad ? "bold" : "normal"}">${val === "yes" ? "✓" : "✗"}</td>`
      }
      const gateTable = gates.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px">
          <thead><tr style="background:#f1f5f9">
            <th style="border:1px solid #e2e8f0;padding:4px 8px;text-align:center">Gate</th>
            <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center">Op V</th>
            <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center">Op P</th>
            <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center">Locks V</th>
            <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center">Locks P</th>
            <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center">Dmg V</th>
            <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center">Dmg P</th>
            <th style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center">Init</th>
            <th style="border:1px solid #e2e8f0;padding:4px 6px">Notes</th>
          </tr></thead>
          <tbody>${gates.map((g: any) => `
            <tr style="${gateFlags(g) ? "background:#fff7f7" : ""}">
              <td style="border:1px solid #e2e8f0;padding:4px 8px;text-align:center;font-weight:700">${g.gate_number ?? "—"}</td>
              ${cell(g.operation_vehicle,    "no")}
              ${cell(g.operation_pedestrian, "no")}
              ${cell(g.locks_vehicle,        "no")}
              ${cell(g.locks_pedestrian,     "no")}
              ${cell(g.damage_vehicle,       "yes")}
              ${cell(g.damage_pedestrian,    "yes")}
              <td style="border:1px solid #e2e8f0;padding:4px 6px;text-align:center">${g.initials || "—"}</td>
              <td style="border:1px solid #e2e8f0;padding:4px 6px">${g.notes || ""}</td>
            </tr>`).join("")}
          </tbody>
        </table>` : `<div style="color:#9ca3af;font-size:11px;margin-top:4px">No gate data recorded.</div>`

      return `
        <div style="margin-bottom:20px;page-break-inside:avoid">
          <div style="background:${nFlags > 0 ? "#fff7f7" : "#f8fafc"};border:1px solid ${nFlags > 0 ? "#fecaca" : "#e2e8f0"};border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:12px">
              <strong>${c.checklist_date || "—"}</strong> &nbsp;·&nbsp; ${c.shift || "—"} Shift &nbsp;·&nbsp; ${c.guard_name || c.officer_name || "—"}
              ${c.start_time ? ` &nbsp;·&nbsp; ${c.start_time}${c.end_time ? " – " + c.end_time : ""}` : ""}
            </div>
            <div style="font-size:11px;font-weight:bold;color:${nFlags > 0 ? "#dc2626" : "#16a34a"}">
              ${nFlags > 0 ? `⚠ ${nFlags} FLAG${nFlags > 1 ? "S" : ""}` : "✓ CLEAR"}
            </div>
          </div>
          ${gateTable}
          ${c.additional_notes ? `<div style="margin-top:4px;font-size:11px;color:#4b5563"><strong>Notes:</strong> ${c.additional_notes}</div>` : ""}
        </div>`
    }).join("")

    const html = `<!DOCTYPE html><html><head>
<title>Gate Checklist Report — ${communityName} — ${monthLabel}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:28px;color:#111}
  h1{font-size:18px;margin:0 0 4px}
  .meta{color:#6b7280;font-size:11px;margin-bottom:14px}
  .stats{display:flex;gap:28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 18px;margin-bottom:22px}
  .sl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
  .sv{font-size:24px;font-weight:700;line-height:1.2}
  .warn{color:#dc2626}
  @media print{@page{margin:18mm}}
</style></head><body>
<h1>Gate Checklist Report</h1>
<div class="meta">${communityName} &nbsp;·&nbsp; ${monthLabel} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
<div class="stats">
  <div><div class="sl">Total Shifts</div><div class="sv">${checklists.length}</div></div>
  <div><div class="sl">Officers</div><div class="sv">${officers.length}</div><div style="font-size:10px;color:#6b7280">${officers.join(", ")}</div></div>
  <div><div class="sl">Gate Checks</div><div class="sv">${allGates.length}</div></div>
  <div><div class="sl">Flagged Items</div><div class="sv ${flaggedGates.length > 0 ? "warn" : ""}">${flaggedGates.length}</div>${flaggedShifts.length > 0 ? `<div style="font-size:10px;color:#dc2626">${flaggedShifts.length} shift${flaggedShifts.length > 1 ? "s" : ""} affected</div>` : ""}</div>
</div>
${shiftRows}
<div style="margin-top:20px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px">
  Op V/P = Gate Operation (Vehicle/Pedestrian) &nbsp;·&nbsp; Locks V/P = Locks/Secures as Intended &nbsp;·&nbsp; Dmg V/P = Damage Observed<br>
  ✓ = Yes (satisfactory) &nbsp;·&nbsp; ✗ = No (requires attention) &nbsp;·&nbsp; Red = flagged item &nbsp;·&nbsp; American Security Group — Property Solutions Platform
</div>
</body></html>`
    const w = window.open("", "_blank")
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  return (
    <main className="p-5 max-w-5xl">
      <div className="mb-5">
        <Link href="/vms/reports" className="text-xs text-blue-700 hover:underline">← Reports & Analytics</Link>
        <h1 className="text-2xl font-bold mt-1">Gate Checklist Monthly Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">Full gate-by-gate inspection detail by location and month.</p>
      </div>

      {/* Controls */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 w-64">
          <label className="text-xs font-semibold text-gray-500">Location</label>
          <select value={community} onChange={e => { setCommunity(e.target.value); setRan(false) }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
            <option value="">Select a location…</option>
            {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Month</label>
          <input type="month" value={month} onChange={e => { setMonth(e.target.value); setRan(false) }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
        </div>
        <button onClick={generate} disabled={!community || loading}
          className="px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 border-none cursor-pointer disabled:opacity-40">
          {loading ? "Loading…" : "▶ Generate Report"}
        </button>
        {ran && checklists.length > 0 && (
          <button onClick={printReport}
            className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 border-none cursor-pointer">
            🖨 Print / PDF
          </button>
        )}
      </div>

      {loading && <div className="text-gray-400 text-sm animate-pulse py-10 text-center">Loading checklists…</div>}

      {ran && !loading && checklists.length === 0 && (
        <div className="text-gray-400 text-sm py-14 text-center bg-white border border-gray-200 rounded-xl">
          No gate checklists on record for this location and month.
        </div>
      )}

      {ran && !loading && checklists.length > 0 && (
        <>
          {/* Summary banner */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
            <div className="text-lg font-bold text-gray-900">{communityName} — {monthLabel}</div>
            <div className="flex flex-wrap gap-8 mt-3">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Shifts</div>
                <div className="text-3xl font-bold text-gray-900">{checklists.length}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Officers</div>
                <div className="text-3xl font-bold text-gray-900">{officers.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">{officers.join(", ")}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Gate Checks</div>
                <div className="text-3xl font-bold text-gray-900">{allGates.length}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Flagged Items</div>
                <div className={`text-3xl font-bold ${flaggedGates.length > 0 ? "text-red-600" : "text-green-700"}`}>
                  {flaggedGates.length}
                </div>
                {flaggedShifts.length > 0 && (
                  <div className="text-xs text-red-500 mt-0.5">{flaggedShifts.length} shift{flaggedShifts.length > 1 ? "s" : ""} affected</div>
                )}
              </div>
            </div>
          </div>

          {/* Per-checklist detail */}
          <div className="space-y-3">
            {checklists.map(c => {
              const gates: any[] = c.gates || []
              const nFlags = gates.filter(gateFlags).length
              return (
                <div key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className={`px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap ${nFlags > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
                    <div className="flex items-center gap-3 flex-wrap text-sm">
                      <span className="font-bold text-gray-900">{c.checklist_date}</span>
                      <span className="text-gray-500">{c.shift || "—"} Shift</span>
                      <span className="font-medium text-gray-700">{c.guard_name || c.officer_name || "—"}</span>
                      {(c.start_time || c.end_time) && (
                        <span className="text-gray-400 text-xs">{[c.start_time, c.end_time].filter(Boolean).join(" – ")}</span>
                      )}
                      <Link href={`/vms/reports/gate-checklist/${c.id}`}
                        className="text-xs text-blue-700 hover:underline font-medium">View →</Link>
                    </div>
                    {nFlags > 0
                      ? <span className="text-xs font-bold text-red-600">⚠ {nFlags} flag{nFlags > 1 ? "s" : ""}</span>
                      : <span className="text-xs font-semibold text-green-700">✓ Clear</span>
                    }
                  </div>

                  {/* Gates table */}
                  {gates.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500">
                            {["Gate","Op V","Op P","Locks V","Locks P","Dmg V","Dmg P","Init","Notes"].map(h => (
                              <th key={h} className="border-b border-r last:border-r-0 border-gray-100 px-2 py-2 text-center font-semibold whitespace-nowrap last:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {gates.map((g: any, gi: number) => {
                            const rowFlag = gateFlags(g)
                            const cell = (val: string, badIs: "yes" | "no") => (
                              <td key={val} className={`border-b border-r border-gray-100 px-2 py-2 text-center font-semibold ${!val ? "text-gray-300" : val === badIs ? "text-red-600 bg-red-50" : "text-green-700"}`}>
                                {!val ? "—" : val === "yes" ? "✓" : "✗"}
                              </td>
                            )
                            return (
                              <tr key={gi} className={rowFlag ? "bg-red-50/30" : ""}>
                                <td className="border-b border-r border-gray-100 px-2 py-2 text-center font-bold text-gray-800">{g.gate_number ?? "—"}</td>
                                {cell(g.operation_vehicle,    "no")}
                                {cell(g.operation_pedestrian, "no")}
                                {cell(g.locks_vehicle,        "no")}
                                {cell(g.locks_pedestrian,     "no")}
                                {cell(g.damage_vehicle,       "yes")}
                                {cell(g.damage_pedestrian,    "yes")}
                                <td className="border-b border-r border-gray-100 px-2 py-2 text-center text-gray-500">{g.initials || "—"}</td>
                                <td className="border-b border-gray-100 px-3 py-2 text-gray-600">{g.notes || ""}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-xs text-gray-400">No gate data recorded.</div>
                  )}

                  {c.additional_notes && (
                    <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
                      <span className="font-semibold text-gray-600">Notes:</span> {c.additional_notes}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 text-[10px] text-gray-400">
            Op V/P = Gate Operation (Vehicle/Pedestrian) · Locks V/P = Locks/Secures as Intended · Dmg V/P = Damage Observed · ✓ = Yes · ✗ = No · Red = flagged
          </div>
        </>
      )}
    </main>
  )
}

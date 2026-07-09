"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"

// Property maintenance ticketing. Any signed-in staff member (Property
// Management, Security, Maintenance, etc.) can log a ticket; RLS blocks guests.
// Admins can delete. Distinct from officer "maintenance reports" (DAR flow).

interface Ticket {
  id: string
  community_id: string
  title: string
  category: string | null
  priority: string
  status: string
  location: string | null
  description: string | null
  reported_by: string | null
  reporter_role: string | null
  assigned_to: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string | null
  resolved_at: string | null
  is_sample: boolean | null
}

const CATEGORIES = [
  "Plumbing", "Electrical", "HVAC", "Appliance", "Structural", "Lighting",
  "Landscaping/Grounds", "Pest Control", "Access/Gate", "Common Area",
  "Safety/Security", "Other",
]
const PRIORITIES = ["Low", "Medium", "High", "Urgent"]
const STATUSES   = ["Open", "In Progress", "Resolved", "Closed"]
const ROLES      = ["Property Management", "Security", "Maintenance", "Resident", "Vendor", "Other"]

const PRIORITY_BADGE: Record<string, string> = {
  Urgent: "bg-red-100 text-red-700 border border-red-200",
  High:   "bg-orange-100 text-orange-800 border border-orange-200",
  Medium: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  Low:    "bg-gray-100 text-gray-600 border border-gray-200",
}
const STATUS_BADGE: Record<string, string> = {
  "Open":        "bg-blue-100 text-blue-700 border border-blue-200",
  "In Progress": "bg-amber-100 text-amber-800 border border-amber-200",
  "Resolved":    "bg-green-100 text-green-700 border border-green-200",
  "Closed":      "bg-gray-100 text-gray-500 border border-gray-200",
}

const inputCls   = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
const labelCls   = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary = "px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50"
const btnGhost   = "px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 border-none cursor-pointer"

function fmtDate(ts: string | null): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function fmtDateTime(ts: string | null): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

const BLANK = { title: "", category: CATEGORIES[0], priority: "Medium", location: "", reporter_role: ROLES[0], description: "" }

export default function MaintenanceTicketsTab({
  communityId, communityName, userEmail, canDelete,
}: {
  communityId: string
  communityName?: string
  userEmail: string
  canDelete: boolean
}) {
  const [tickets,   setTickets]   = useState<Ticket[]>([])
  const [loading,   setLoading]   = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>("Open")
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState({ ...BLANK })
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState("")
  const [busyId,    setBusyId]    = useState("")
  const [viewing,   setViewing]   = useState<Ticket | null>(null)

  const load = useCallback(async () => {
    if (!communityId) { setTickets([]); return }
    setLoading(true)
    const { data } = await supabase.from("maintenance_tickets").select("*")
      .eq("community_id", communityId)
      .order("created_at", { ascending: false })
    setTickets((data as Ticket[]) || [])
    setLoading(false)
  }, [communityId])

  useEffect(() => { setShowForm(false); setMsg(""); load() }, [load])

  async function addTicket() {
    if (!form.title.trim()) { setMsg("⚠ A title is required."); return }
    setSaving(true); setMsg("")
    const { error } = await supabase.from("maintenance_tickets").insert({
      community_id:  communityId,
      title:         form.title.trim(),
      category:      form.category,
      priority:      form.priority,
      status:        "Open",
      location:      form.location.trim() || null,
      description:   form.description.trim() || null,
      reporter_role: form.reporter_role,
      reported_by:   userEmail || null,
    })
    setSaving(false)
    if (error) { setMsg("⚠ " + error.message); return }
    setForm({ ...BLANK }); setShowForm(false); setMsg("✅ Ticket created.")
    load()
  }

  async function changeStatus(t: Ticket, status: string) {
    setBusyId(t.id)
    const patch: Record<string, any> = { status, updated_at: new Date().toISOString() }
    if (status === "Resolved" || status === "Closed") {
      if (!t.resolved_at) patch.resolved_at = new Date().toISOString()
      if (!t.resolution_notes) {
        const note = window.prompt("Resolution notes (optional):", "")
        if (note && note.trim()) patch.resolution_notes = note.trim()
      }
    } else {
      patch.resolved_at = null
    }
    const { error } = await supabase.from("maintenance_tickets").update(patch).eq("id", t.id)
    setBusyId("")
    if (error) { setMsg("⚠ " + error.message); return }
    load()
  }

  async function deleteTicket(t: Ticket) {
    if (!confirm(`Delete ticket "${t.title}"? This cannot be undone.`)) return
    setBusyId(t.id)
    const { error } = await supabase.from("maintenance_tickets").delete().eq("id", t.id)
    setBusyId("")
    if (error) { setMsg("⚠ " + error.message); return }
    setTickets(prev => prev.filter(x => x.id !== t.id))
  }

  const counts: Record<string, number> = { All: tickets.length }
  for (const s of STATUSES) counts[s] = tickets.filter(t => t.status === s).length
  const openCount = counts["Open"] + counts["In Progress"]

  const visible = statusFilter === "All" ? tickets : tickets.filter(t => t.status === statusFilter)

  // Full field list for the detail view / print / export.
  function ticketRows(t: Ticket): [string, string][] {
    return [
      ["Title",              t.title || ""],
      ["Status",             t.status || ""],
      ["Priority",           t.priority || ""],
      ["Category",           t.category || ""],
      ["Location",           t.location || ""],
      ["Community",          communityName || ""],
      ["Reported by (role)", t.reporter_role || ""],
      ["Reported by",        t.reported_by || ""],
      ["Assigned to",        t.assigned_to || ""],
      ["Opened",             fmtDateTime(t.created_at)],
      ["Last updated",       fmtDateTime(t.updated_at)],
      ["Resolved",           t.resolved_at ? fmtDateTime(t.resolved_at) : ""],
      ["Description",        t.description || ""],
      ["Resolution notes",   t.resolution_notes || ""],
    ]
  }

  function exportTicketCSV(t: Ticket) {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = ["Field,Value", ...ticketRows(t).map(([k, v]) => `${esc(k)},${esc(v)}`)]
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `maintenance-ticket-${(t.title || "ticket").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printTicket(t: Ticket) {
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const body = ticketRows(t).filter(([, v]) => v).map(([k, v]) =>
      `<tr><th>${esc(k)}</th><td>${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("")
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Maintenance Ticket — ${esc(t.title)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;}
        h1{font-size:18px;margin:0 0 2px;} .sub{color:#666;font-size:12px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th,td{border:1px solid #d1d5db;padding:7px 10px;text-align:left;vertical-align:top;}
        th{background:#f3f4f6;width:180px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#374151;}
        @media print{@page{margin:14mm;}}
      </style></head><body>
      <h1>Maintenance Ticket — ${esc(t.title)}</h1>
      <div class="sub">${esc(communityName || "")} · ${t.priority} priority · ${t.status} · Printed ${new Date().toLocaleString("en-US")}</div>
      <table><tbody>${body}</tbody></table>
      </body></html>`
    const w = window.open("", "_blank", "width=900,height=720")
    if (!w) { alert("Please allow pop-ups to print."); return }
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 250)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-sm text-gray-500">
          {communityName ? <>Maintenance tickets for <span className="font-semibold text-gray-700">{communityName}</span> · </> : null}
          <span className="font-semibold text-gray-700">{openCount}</span> open
        </div>
        <button className={btnPrimary} onClick={() => { setShowForm(v => !v); setMsg("") }} disabled={!communityId}>
          {showForm ? "✕ Cancel" : "+ New Ticket"}
        </button>
      </div>

      {msg && <div className="mb-4 text-sm px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-700">{msg}</div>}

      {/* New ticket form */}
      {showForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 mb-5">
          <h3 className="font-bold text-gray-800 mb-3">New Maintenance Ticket</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className={labelCls}>Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Exterior light out at Building 3 entrance" className={inputCls} /></div>
            <div><label className={labelCls}>Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inputCls}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select></div>
            <div><label className={labelCls}>Location (building / unit / area)</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Bldg 3 · Front entrance" className={inputCls} /></div>
            <div><label className={labelCls}>Reported By (role)</label>
              <select value={form.reporter_role} onChange={e => setForm(f => ({ ...f, reporter_role: e.target.value }))} className={inputCls}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select></div>
            <div className="sm:col-span-2"><label className={labelCls}>Description</label>
              <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What's the issue? Include details a technician would need." className={inputCls} /></div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className={btnPrimary} onClick={addTicket} disabled={saving}>{saving ? "Saving…" : "Create Ticket"}</button>
            <button className={btnGhost} onClick={() => { setShowForm(false); setForm({ ...BLANK }) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(["All", ...STATUSES]).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs font-semibold rounded-md border-none cursor-pointer transition-colors ${
              statusFilter === s ? "bg-blue-700 text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
            }`}>
            {s} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Loading tickets…</div>
      ) : visible.length === 0 ? (
        <div className="text-gray-400 text-sm py-10 text-center bg-white border border-gray-200 rounded-xl">
          {communityId ? `No ${statusFilter === "All" ? "" : statusFilter.toLowerCase() + " "}tickets.` : "Select a location."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {t.is_sample && (
                      <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-300">SAMPLE TICKET</span>
                    )}
                    <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.Medium}`}>{t.priority}</span>
                    <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${STATUS_BADGE[t.status] || STATUS_BADGE.Open}`}>{t.status}</span>
                    {t.category && <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{t.category}</span>}
                  </div>
                  <div className="text-sm font-bold text-gray-900">{t.title}</div>
                  {t.location && <div className="text-xs text-gray-500 mt-0.5">📍 {t.location}</div>}
                  {t.description && <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{t.description}</div>}
                  {t.resolution_notes && (
                    <div className="text-xs text-green-700 mt-1.5 bg-green-50 border border-green-200 rounded px-2 py-1">
                      ✓ Resolution: {t.resolution_notes}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1.5">
                    {t.reporter_role ? `${t.reporter_role}` : "—"}
                    {t.reported_by ? ` · ${t.reported_by}` : ""}
                    {` · opened ${fmtDate(t.created_at)}`}
                    {t.resolved_at ? ` · resolved ${fmtDate(t.resolved_at)}` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button onClick={() => setViewing(t)}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md border-none cursor-pointer whitespace-nowrap">
                    🔍 View
                  </button>
                  <select
                    value={t.status}
                    disabled={busyId === t.id}
                    onChange={e => changeStatus(t, e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    title="Change status"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {canDelete && (
                    <button onClick={() => deleteTicket(t)} disabled={busyId === t.id}
                      className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-semibold rounded border border-red-200 cursor-pointer disabled:opacity-50">
                      🗑 Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {viewing.is_sample && <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-300">SAMPLE TICKET</span>}
                  <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${PRIORITY_BADGE[viewing.priority] || PRIORITY_BADGE.Medium}`}>{viewing.priority}</span>
                  <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${STATUS_BADGE[viewing.status] || STATUS_BADGE.Open}`}>{viewing.status}</span>
                  {viewing.category && <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{viewing.category}</span>}
                </div>
                <h2 className="text-lg font-bold text-gray-900">{viewing.title}</h2>
              </div>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-700 bg-transparent border-none cursor-pointer text-xl leading-none">✕</button>
            </div>

            {/* Body — full detail */}
            <div className="p-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {ticketRows(viewing)
                  .filter(([k]) => k !== "Title" && k !== "Description" && k !== "Resolution notes")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{k}</dt>
                      <dd className="text-sm text-gray-800">{v || "—"}</dd>
                    </div>
                  ))}
              </dl>
              {viewing.description && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description</div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{viewing.description}</div>
                </div>
              )}
              {viewing.resolution_notes && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Resolution Notes</div>
                  <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-md px-3 py-2 whitespace-pre-wrap">{viewing.resolution_notes}</div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 flex-wrap">
              <button onClick={() => exportTicketCSV(viewing)}
                className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-md hover:bg-gray-700 border-none cursor-pointer">⬇ Export CSV</button>
              <button onClick={() => printTicket(viewing)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-50 cursor-pointer">🖨 Print</button>
              <button onClick={() => setViewing(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-200 border-none cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

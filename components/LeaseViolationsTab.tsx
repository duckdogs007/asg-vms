"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import LeaseViolationForm from "@/components/LeaseViolationForm"
import { SignedLink } from "@/components/SignedImage"

// Property Hub "Lease Violations" tab: issue a violation (admin/supervisor) and
// review the violations on file for the hub's selected community. Scoped to the
// community already chosen by the hub's location dropdown. The cross-community
// analytics + CSV export live in /vms/reports.
export default function LeaseViolationsTab({
  communityId,
  communityName,
  isAdmin,
  canDelete = false,
}: {
  communityId: string
  communityName?: string
  isAdmin: boolean
  canDelete?: boolean
}) {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShow]   = useState(false)

  async function load() {
    if (!communityId) { setRows([]); return }
    setLoading(true)
    const { data } = await supabase.from("incident_reports").select("*")
      .eq("community_id", communityId).eq("lvl_issued", true)
      .order("date", { ascending: false })
    const list = data || []
    const ids = list.map((r: any) => r.id)
    const offMap: Record<string, any[]> = {}
    if (ids.length) {
      const { data: offs } = await supabase.from("violation_offenders").select("*").in("report_id", ids)
      for (const o of offs || []) (offMap[o.report_id] ||= []).push(o)
    }
    setRows(list.map((r: any) => ({ ...r, _offenders: offMap[r.id] || [] })))
    setLoading(false)
  }

  useEffect(() => { setShow(false); load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [communityId])

  // Admin-only delete. Deleting the incident_reports row cascade-removes its
  // violation_offenders. Writes a Lease Violation "deleted" audit entry.
  async function deleteViolation(r: any) {
    const unit = [r.building, r.apartment].filter(Boolean).join("-") || r.location || "—"
    if (!confirm(`Delete this lease violation?\n\n${r.violation_type || "Violation"} @ ${unit}\n\nThis permanently removes the record and its offenders and cannot be undone.`)) return
    const { error } = await supabase.from("incident_reports").delete().eq("id", r.id)
    if (error) { alert("Delete failed: " + error.message); return }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from("audit_logs").insert({
        user_email:    user?.email || "unknown",
        action:        "deleted",
        resource_type: "Lease Violation",
        resource_id:   r.id,
        detail:        `Lease violation deleted — ${r.violation_type || "—"} @ ${unit}`,
        created_at:    new Date().toISOString(),
      })
    } catch { /* audit is best-effort */ }
    load()
  }

  const communities = communityId ? [{ id: communityId, name: communityName || "This location" }] : []

  // Flatten each violation to a printable/exportable record.
  function tableRows() {
    return rows.map(r => ({
      date:      r.lvl_posted_date || r.date || "",
      unit:      [r.building, r.apartment].filter(Boolean).join("-") || r.location || "—",
      type:      r.violation_type || "",
      notice:    r.notice_level || "",
      category:  r.violation_category === "lease_compliance" ? "Lease compliance" : "Security/community",
      hoh:       r.hoh_name || "",
      offenders: (r._offenders || []).map((o: any) => o.name).filter(Boolean).join("; "),
      ban:       (r._offenders || []).some((o: any) => o.ban_match) ? "Yes" : "",
      issuedBy:  r.issued_by || "",
      source:    r.record_source || "",
    }))
  }

  const COLS = ["Date", "Unit", "Violation Type", "Notice Level", "Category", "HOH", "Offenders", "Ban Match", "Issued By", "Source"]

  function exportCSV() {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = [COLS.map(esc).join(",")]
    for (const r of tableRows()) {
      lines.push([r.date, r.unit, r.type, r.notice, r.category, r.hoh, r.offenders, r.ban, r.issuedBy, r.source].map(esc).join(","))
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `lease-violations-${(communityName || "community").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const body = tableRows().map(r => `<tr>
      <td>${esc(r.date)}</td><td>${esc(r.unit)}</td><td>${esc(r.type)}</td><td>${esc(r.notice)}</td>
      <td>${esc(r.category)}</td><td>${esc(r.hoh)}</td><td>${esc(r.offenders)}</td>
      <td style="text-align:center;">${r.ban ? "⛔ Yes" : ""}</td><td>${esc(r.issuedBy)}</td><td>${esc(r.source)}</td></tr>`).join("")
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lease Violations — ${esc(communityName || "")}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;}
        h1{font-size:18px;margin:0 0 2px;} .sub{color:#666;font-size:12px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left;vertical-align:top;}
        th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.03em;}
        tr:nth-child(even) td{background:#fafafa;}
        @media print{@page{margin:14mm;}}
      </style></head><body>
      <h1>Lease Violations — ${esc(communityName || "This location")}</h1>
      <div class="sub">${tableRows().length} record${tableRows().length === 1 ? "" : "s"} · Generated ${new Date().toLocaleString("en-US")}</div>
      <table><thead><tr>${COLS.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
      </body></html>`
    const w = window.open("", "_blank", "width=1000,height=720")
    if (!w) { alert("Please allow pop-ups to print."); return }
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 250)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        {isAdmin ? (
          <button onClick={() => setShow(s => !s)}
            className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer">
            {showForm ? "✕ Close" : "⚖️ Issue Lease Violation"}
          </button>
        ) : <span />}
        {rows.length > 0 && (
          <div className="flex gap-2">
            <button onClick={exportCSV}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 border-none cursor-pointer">
              ⬇ Export CSV
            </button>
            <button onClick={printReport}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 cursor-pointer">
              🖨 Print
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="border border-amber-300 bg-amber-50 rounded-xl p-5 mb-5">
          <LeaseViolationForm
            communities={communities}
            defaultCommunityId={communityId}
            isAdmin={isAdmin}
            onSaved={() => { setShow(false); load() }}
          />
        </div>
      )}

      {loading && <div className="text-gray-500 text-sm py-8 text-center">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="text-gray-500 text-sm py-8 text-center">
          {communityId ? "No lease violations on file for this location." : "Select a location."}
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {rows.map((r, i) => {
            const ban  = (r._offenders || []).some((o: any) => o.ban_match)
            const unit = [r.building, r.apartment].filter(Boolean).join("-") || r.location || "—"
            const sub  = [
              r.hoh_name && `HOH: ${r.hoh_name}`,
              r.violation_category === "lease_compliance" ? "Lease compliance" : "Security/community",
              (r._offenders || []).map((o: any) => o.name).filter(Boolean).join(", "),
            ].filter(Boolean).join(" · ")
            return (
              <div key={r.id} className={`flex items-center gap-4 px-4 py-3 ${i < rows.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="w-24 flex-shrink-0 font-mono text-sm font-semibold text-gray-800">{unit}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">
                    {r.violation_type || "—"}{r.notice_level ? ` · ${r.notice_level}` : ""}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{sub || "—"}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Link href={`/vms/reports/incident/${r.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md">
                      🔍 View Report
                    </Link>
                    {(r.attachment_urls as string[] | null || []).map((u, idx) => (
                      <SignedLink key={idx} href={u} bucket="community-docs"
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-md border border-blue-200">
                        📎 {(r.attachment_urls as string[]).length > 1 ? `Document ${idx + 1}` : "Document"}
                      </SignedLink>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {ban && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">⛔ Ban</span>}
                  {r.record_source && r.record_source !== "officer" && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">{r.record_source}</span>
                  )}
                </div>
                <div className="text-right text-xs text-gray-400 w-24 flex-shrink-0">
                  <div>{r.lvl_posted_date || r.date || "—"}</div>
                  <div className="truncate">{r.issued_by || "—"}</div>
                </div>
                {canDelete && (
                  <button onClick={() => deleteViolation(r)} title="Delete lease violation (admin only)"
                    className="flex-shrink-0 px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded border-none cursor-pointer">
                    🗑
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

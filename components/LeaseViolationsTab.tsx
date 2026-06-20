"use client"

import { useEffect, useState } from "react"
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
}: {
  communityId: string
  communityName?: string
  isAdmin: boolean
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

  const communities = communityId ? [{ id: communityId, name: communityName || "This location" }] : []

  return (
    <div>
      {isAdmin && (
        <div className="mb-4">
          <button onClick={() => setShow(s => !s)}
            className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer">
            {showForm ? "✕ Close" : "⚖️ Issue Lease Violation"}
          </button>
        </div>
      )}

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
                  {(r.attachment_urls || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(r.attachment_urls as string[]).map((u, i) => (
                        <SignedLink key={i} href={u} bucket="community-docs"
                          className="text-xs text-blue-700 hover:text-blue-900 font-medium">📎 Attachment {i + 1}</SignedLink>
                      ))}
                    </div>
                  )}
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

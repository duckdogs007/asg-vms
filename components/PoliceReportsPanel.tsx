"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { checkIsAdmin } from "@/lib/admin"
import { sanitizeFilterTerm } from "@/lib/searchSanitize"
import { SignedLink } from "@/components/SignedImage"

// Police reports attached to a person. Reports link by watchlist_id when the
// person is in the registry, and always by person_name so a person of interest
// who isn't barred can still have reports attached. Files live in the private
// community-docs bucket and are opened via short-lived signed URLs.
interface Report {
  id: string
  community_id: string | null
  watchlist_id: string | null
  person_name: string
  agency: string | null
  case_number: string | null
  incident_date: string | null
  title: string | null
  notes: string | null
  file_url: string
  uploaded_by: string | null
  created_at: string
}

const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

function fmtDate(d: string | null): string {
  if (!d) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : d
}

export default function PoliceReportsPanel({
  personName, watchlistId = null, communityId = null,
}: {
  personName: string
  watchlistId?: string | null
  communityId?: string | null
}) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState("")
  const [file, setFile]       = useState<File | null>(null)
  const [form, setForm]       = useState({ agency: "", case_number: "", incident_date: "", title: "", notes: "" })

  useEffect(() => { checkIsAdmin().then(setIsAdmin).catch(() => setIsAdmin(false)) }, [])

  const load = useCallback(async () => {
    const name = sanitizeFilterTerm(personName)
    if (!name) { setReports([]); return }
    setLoading(true)
    let q = supabase.from("police_reports").select("*").order("created_at", { ascending: false })
    q = watchlistId
      ? q.or(`watchlist_id.eq.${watchlistId},person_name.ilike.${name}`)
      : q.ilike("person_name", name)
    const { data } = await q
    setReports((data as Report[]) || [])
    setLoading(false)
  }, [personName, watchlistId])

  useEffect(() => { load() }, [load])

  async function upload() {
    if (!file) { setMsg("⚠ Choose a file to upload."); return }
    if (file.size > MAX_BYTES) { setMsg(`⚠ File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 15 MB.`); return }
    setSaving(true); setMsg("")
    try {
      const ext  = file.name.split(".").pop() || "pdf"
      const path = `police-reports/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data: up, error: upErr } = await supabase.storage.from("community-docs").upload(path, file, { upsert: false })
      if (upErr || !up) { setMsg("⚠ Upload failed: " + (upErr?.message || "")); return }
      const { data: { publicUrl } } = supabase.storage.from("community-docs").getPublicUrl(up.path)
      const { data: { user } } = await supabase.auth.getUser()
      // Fall back to the officer's current location so the report is scoped to a
      // site — an unscoped report would be invisible to non-supervisors.
      const comm = communityId
        || (typeof window !== "undefined" ? localStorage.getItem("asg-current-community-id") : null)
        || null
      const { error } = await supabase.from("police_reports").insert({
        community_id:  comm,
        watchlist_id:  watchlistId || null,
        person_name:   personName.trim(),
        agency:        form.agency.trim() || null,
        case_number:   form.case_number.trim() || null,
        incident_date: form.incident_date || null,
        title:         form.title.trim() || null,
        notes:         form.notes.trim() || null,
        file_url:      publicUrl,
        uploaded_by:   user?.email || null,
      })
      if (error) { setMsg("⚠ " + error.message); return }
      supabase.from("audit_logs").insert({
        user_email: user?.email || "unknown",
        action: "created", resource_type: "Police Report", resource_id: "",
        detail: `Police report attached to ${personName}${form.case_number ? ` — case ${form.case_number}` : ""}`,
        created_at: new Date().toISOString(),
      })
      setForm({ agency: "", case_number: "", incident_date: "", title: "", notes: "" })
      setFile(null); setShowForm(false); setMsg("✅ Police report attached.")
      load()
    } finally { setSaving(false) }
  }

  async function remove(r: Report) {
    if (!confirm(`Delete this police report${r.case_number ? ` (case ${r.case_number})` : ""}? This cannot be undone.`)) return
    const { error } = await supabase.from("police_reports").delete().eq("id", r.id)
    if (error) { setMsg("⚠ " + error.message); return }
    setReports(prev => prev.filter(x => x.id !== r.id))
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
  const labelCls = "block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1"

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-800">🚔 Police Reports <span className="text-gray-400 font-normal">({reports.length})</span></h3>
        <button onClick={() => { setShowForm(v => !v); setMsg("") }}
          className="px-3 py-1.5 bg-blue-800 text-white text-xs font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer">
          {showForm ? "✕ Cancel" : "+ Attach Report"}
        </button>
      </div>

      {msg && <div className="mb-3 text-xs px-3 py-2 rounded-md bg-gray-50 border border-gray-200 text-gray-700">{msg}</div>}

      {showForm && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div><label className={labelCls}>Agency</label>
              <input value={form.agency} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))} placeholder="e.g. Henrico PD" className={inputCls} /></div>
            <div><label className={labelCls}>Case / Report #</label>
              <input value={form.case_number} onChange={e => setForm(f => ({ ...f, case_number: e.target.value }))} placeholder="2026-04471" className={inputCls} /></div>
            <div><label className={labelCls}>Incident Date</label>
              <input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} className={inputCls} /></div>
            <div className="sm:col-span-3"><label className={labelCls}>Title / Summary</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Trespass arrest at Bldg 4" className={inputCls} /></div>
            <div className="sm:col-span-3"><label className={labelCls}>Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} /></div>
            <div className="sm:col-span-3"><label className={labelCls}>File (PDF or image) *</label>
              <input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)}
                className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 cursor-pointer" /></div>
          </div>
          <button onClick={upload} disabled={saving}
            className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
            {saving ? "Uploading…" : "Attach Police Report"}
          </button>
          <p className="text-[11px] text-gray-500 mt-2">Attached to <span className="font-semibold">{personName}</span>. Visible to staff at this location (and supervisors/admin). Not visible to guest accounts.</p>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-sm py-4">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="text-gray-400 text-sm py-3">No police reports attached to this person.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map(r => (
            <div key={r.id} className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">🚔 Police Report</span>
                    {r.agency && <span className="text-xs font-semibold text-gray-700">{r.agency}</span>}
                    {r.case_number && <span className="text-xs font-mono text-gray-600">#{r.case_number}</span>}
                    {r.incident_date && <span className="text-xs text-gray-500">{fmtDate(r.incident_date)}</span>}
                  </div>
                  {r.title && <div className="text-sm font-semibold text-gray-900 mt-1">{r.title}</div>}
                  {r.notes && <div className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{r.notes}</div>}
                  <div className="text-[11px] text-gray-400 mt-1">
                    Uploaded {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {r.uploaded_by ? ` · ${r.uploaded_by}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <SignedLink href={r.file_url} bucket="community-docs"
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md whitespace-nowrap">
                    👁 View
                  </SignedLink>
                  {isAdmin && (
                    <button onClick={() => remove(r)}
                      className="px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-md border border-red-200 cursor-pointer">🗑</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

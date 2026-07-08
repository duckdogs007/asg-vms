"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { checkIsAdmin } from "@/lib/admin"
import { Community } from "@/lib/types"

export default function CommunityPoliciesPage() {
  const [isAdmin,      setIsAdmin]      = useState<boolean | null>(null)
  const [userEmail,    setUserEmail]    = useState("")
  const [communities,  setCommunities]  = useState<Community[]>([])
  const [communityId,  setCommunityId]  = useState("")

  // Policy (community_settings)
  const [enabled,      setEnabled]      = useState(false)
  const [sendDay,      setSendDay]      = useState(1)
  const [recipients,   setRecipients]   = useState<string[]>([])
  const [newRecipient, setNewRecipient] = useState("")
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState("")
  const [genBusy,      setGenBusy]      = useState(false)

  // Review queue
  const [pending,      setPending]      = useState<any[]>([])
  const [busyId,       setBusyId]       = useState("")

  // Full review / edit modal
  const [editing,      setEditing]      = useState<any>(null)
  const [draft,        setDraft]        = useState<any>({})
  const [savingEdit,   setSavingEdit]   = useState(false)
  const [editMsg,      setEditMsg]      = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || ""))
    checkIsAdmin().then(ok => { setIsAdmin(ok); if (ok) init() })
  }, [])

  async function init() {
    const { data } = await supabase.from("communities").select("id, name").order("name")
    const list = (data as Community[]) || []
    setCommunities(list)
    if (list[0]) selectCommunity(list[0].id)
    loadPending()
  }

  function selectCommunity(id: string) {
    setCommunityId(id); setMsg("")
    supabase.from("community_settings").select("*").eq("community_id", id).maybeSingle()
      .then(({ data }) => {
        setEnabled(!!(data as any)?.summary_enabled)
        setSendDay((data as any)?.summary_send_day || 1)
        setRecipients((data as any)?.summary_recipients || [])
      })
  }

  async function saveSettings() {
    if (!communityId) return
    setSaving(true); setMsg("")
    const { error } = await supabase.from("community_settings").upsert({
      community_id: communityId, summary_enabled: enabled, summary_frequency: "monthly",
      summary_send_day: sendDay, summary_recipients: recipients,
      updated_at: new Date().toISOString(), updated_by: userEmail,
    }, { onConflict: "community_id" })
    setSaving(false)
    setMsg(error ? "⚠ " + error.message : "✅ Policy saved.")
  }

  function prevMonth() {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const to   = new Date(now.getFullYear(), now.getMonth(), 0)
    const iso  = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    return { from: iso(from), to: iso(to) }
  }

  async function generateNow() {
    if (!communityId) return
    setGenBusy(true); setMsg("")
    const { from, to } = prevMonth()
    const res = await fetch("/api/admin/generate-summary", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId, from, to }),
    })
    const data = await res.json()
    setGenBusy(false)
    if (!res.ok) { setMsg("⚠ " + (data.error || "Generate failed")); return }
    setMsg(`✅ Summary for ${from} → ${to} generated and queued for review.`)
    loadPending()
  }

  async function loadPending() {
    const { data } = await supabase.from("summary_review_queue").select("*")
      .eq("status", "pending").order("generated_at", { ascending: false })
    setPending(data || [])
  }

  async function sendSummary(id: string, skipConfirm = false) {
    if (!skipConfirm && !confirm("Approve and email this summary to the configured recipients?")) return
    setBusyId(id)
    const res = await fetch("/api/admin/send-summary", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueId: id }),
    })
    const data = await res.json()
    setBusyId("")
    if (!res.ok) { alert("Send failed: " + (data.error || "unknown")); return }
    alert(`Sent to ${data.recipients?.join(", ") || "recipients"}.`)
    loadPending()
  }

  async function dismiss(id: string) {
    if (!confirm("Dismiss this summary without sending?")) return
    setBusyId(id)
    await supabase.from("summary_review_queue").update({
      status: "dismissed", reviewed_by: userEmail, reviewed_at: new Date().toISOString(),
    }).eq("id", id)
    setBusyId("")
    loadPending()
  }

  // ---- Full review / edit ----
  function openReview(q: any) {
    // Deep-clone so edits don't mutate the list until saved.
    setDraft(JSON.parse(JSON.stringify(q.summary || {})))
    setEditMsg(""); setEditing(q)
  }

  const setExec = (v: string) => setDraft((d: any) => ({ ...d, executive_summary: v }))
  const patchItem = (key: string, i: number, field: string, v: any) =>
    setDraft((d: any) => { const a = [...(d[key] || [])]; a[i] = { ...a[i], [field]: v }; return { ...d, [key]: a } })
  const addItem = (key: string, blank: any) =>
    setDraft((d: any) => ({ ...d, [key]: [...(d[key] || []), blank] }))
  const removeItem = (key: string, i: number) =>
    setDraft((d: any) => ({ ...d, [key]: (d[key] || []).filter((_: any, idx: number) => idx !== i) }))
  const setRec = (i: number, v: string) =>
    setDraft((d: any) => { const a = [...(d.recommendations || [])]; a[i] = v; return { ...d, recommendations: a } })

  async function persistDraft(id: string): Promise<boolean> {
    const { error } = await supabase.from("summary_review_queue").update({
      summary: draft, edited_by: userEmail, edited_at: new Date().toISOString(),
    }).eq("id", id)
    if (error) { alert("Save failed: " + error.message); return false }
    setPending(p => p.map(x => x.id === id ? { ...x, summary: draft } : x))
    return true
  }

  async function saveEdits(close: boolean) {
    if (!editing) return
    setSavingEdit(true)
    const ok = await persistDraft(editing.id)
    setSavingEdit(false)
    if (!ok) return
    if (close) setEditing(null)
    else setEditMsg("✅ Revisions saved.")
  }

  async function saveAndSend() {
    if (!editing) return
    const q = editing
    if ((q.recipients || []).length === 0) { alert("No recipients configured for this community — set them above and Save the policy first."); return }
    if (!confirm("Save revisions and email this summary to the configured recipients?")) return
    setSavingEdit(true)
    const ok = await persistDraft(q.id)
    setSavingEdit(false)
    if (!ok) return
    setEditing(null)
    await sendSummary(q.id, true)
  }

  if (isAdmin === null) return <div className="p-8 text-gray-400 text-sm animate-pulse">Loading…</div>
  if (!isAdmin) return <div className="p-8 text-gray-500 text-sm">Admin access required.</div>

  const commName = (id: string) => communities.find(c => c.id === id)?.name || "—"
  const inputCls = "px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="mb-4"><Link href="/admin/system" className="text-sm text-blue-700 hover:underline">← Admin</Link></div>
      <h1 className="text-2xl font-bold mb-1">Community Policies</h1>
      <p className="text-sm text-gray-500 mb-5">Per-community notification controls. Monthly AI operations summaries are generated on schedule and <strong>queued for supervisor review</strong> before any client delivery.</p>

      {/* Policy config */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-xs font-semibold text-gray-500">Community</label>
          <select value={communityId} onChange={e => selectCommunity(e.target.value)} className={inputCls + " w-64"}>
            {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4" />
          <span className="text-sm font-medium text-gray-800">Enable monthly operations summary for this community</span>
        </label>

        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Send day of month</label>
            <select value={sendDay} onChange={e => setSendDay(Number(e.target.value))} className={inputCls + " w-24"}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="text-xs text-gray-400 pb-2">Generates last month&apos;s summary on this day and queues it for review.</div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 block mb-1">Recipients (client emails, once approved)</label>
          <div className="flex gap-2 mb-2">
            <input value={newRecipient} onChange={e => setNewRecipient(e.target.value)} placeholder="recipient@client.com" className={inputCls + " flex-1"} />
            <button type="button" onClick={() => { const v = newRecipient.trim(); if (v && !recipients.includes(v)) { setRecipients([...recipients, v]); setNewRecipient("") } }}
              className="px-3 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-700 border-none cursor-pointer">+ Add</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recipients.length === 0 && <span className="text-xs text-gray-400">No recipients yet.</span>}
            {recipients.map(r => (
              <span key={r} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-full">
                {r}
                <button type="button" onClick={() => setRecipients(recipients.filter(x => x !== r))} className="text-blue-500 hover:text-blue-800 bg-transparent border-none cursor-pointer">✕</button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={saveSettings} disabled={saving} className="px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-md hover:bg-blue-800 border-none cursor-pointer disabled:opacity-50">{saving ? "Saving…" : "💾 Save Policy"}</button>
          <button onClick={generateNow} disabled={genBusy} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50 cursor-pointer disabled:opacity-50">{genBusy ? "Generating…" : "🧠 Generate last month now (queue for review)"}</button>
          {msg && <span className="text-xs text-gray-600">{msg}</span>}
        </div>
      </div>

      {/* Review queue */}
      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Pending Summaries — Review &amp; Send ({pending.length})</div>
      {pending.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center bg-white border border-gray-200 rounded-xl">No summaries awaiting review.</div>
      ) : (
        <div className="space-y-3">
          {pending.map(q => {
            const s = q.summary || {}
            const concerns = s.concerns?.length || 0
            const high = (s.concerns || []).filter((c: any) => c.severity === "high").length
            return (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-sm font-bold text-gray-900">{commName(q.community_id)}</div>
                    <div className="text-xs text-gray-500">{q.period_from} to {q.period_to} · {q.total_records} records · {concerns} concern{concerns !== 1 ? "s" : ""}{high ? ` (${high} high)` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openReview(q)} disabled={busyId === q.id}
                      title="Read the full summary and revise before sending"
                      className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 border-none cursor-pointer disabled:opacity-40">
                      📝 Review &amp; Edit
                    </button>
                    <button onClick={() => sendSummary(q.id)} disabled={busyId === q.id || (q.recipients || []).length === 0}
                      title={(q.recipients || []).length === 0 ? "No recipients configured for this community" : "Approve & send to client"}
                      className="px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 border-none cursor-pointer disabled:opacity-40">
                      {busyId === q.id ? "…" : "✅ Approve & Send"}
                    </button>
                    <button onClick={() => dismiss(q.id)} disabled={busyId === q.id}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 border-none cursor-pointer disabled:opacity-40">Dismiss</button>
                  </div>
                </div>
                {s.executive_summary && <p className="text-sm text-gray-700 mb-2">{s.executive_summary}</p>}
                {(q.recipients || []).length > 0
                  ? <div className="text-[11px] text-gray-400">Recipients: {q.recipients.join(", ")}</div>
                  : <div className="text-[11px] text-amber-700">⚠ No recipients configured — set them above and Save before sending.</div>}
                <div className="text-[11px] text-gray-400 mt-1">⚠ AI-generated — verify against source reports before releasing to the client.</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full review / edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl w-full max-w-3xl my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{commName(editing.community_id)}</h2>
                <div className="text-xs text-gray-500">{editing.period_from} to {editing.period_to} · {editing.total_records} records · reviewing before client delivery</div>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700 bg-transparent border-none cursor-pointer text-xl leading-none">✕</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Executive summary */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Executive Summary</label>
                <textarea value={draft.executive_summary || ""} onChange={e => setExec(e.target.value)} rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>

              {/* Concerns */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Concerns ({(draft.concerns || []).length})</label>
                  <button onClick={() => addItem("concerns", { title: "", severity: "medium", location: "", detail: "" })}
                    className="text-xs text-blue-700 hover:underline bg-transparent border-none cursor-pointer">+ Add concern</button>
                </div>
                <div className="space-y-2">
                  {(draft.concerns || []).map((c: any, i: number) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50/50">
                      <div className="flex gap-2 mb-1.5">
                        <select value={c.severity || "medium"} onChange={e => patchItem("concerns", i, "severity", e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-xs bg-white">
                          <option value="high">high</option><option value="medium">medium</option><option value="low">low</option>
                        </select>
                        <input value={c.title || ""} onChange={e => patchItem("concerns", i, "title", e.target.value)} placeholder="Title"
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                        <button onClick={() => removeItem("concerns", i)} className="text-red-400 hover:text-red-700 bg-transparent border-none cursor-pointer text-sm px-1" title="Remove">🗑</button>
                      </div>
                      <input value={c.location || ""} onChange={e => patchItem("concerns", i, "location", e.target.value)} placeholder="Location (optional)"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs mb-1.5 bg-white" />
                      <textarea value={c.detail || ""} onChange={e => patchItem("concerns", i, "detail", e.target.value)} placeholder="Detail" rows={2}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white" />
                      {(c.sources || []).length > 0 && <div className="text-[10px] text-gray-400 mt-1">Sources: {c.sources.join(", ")}</div>}
                    </div>
                  ))}
                  {(draft.concerns || []).length === 0 && <div className="text-xs text-gray-400">None.</div>}
                </div>
              </div>

              {/* Follow-ups */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Follow-ups ({(draft.follow_ups || []).length})</label>
                  <button onClick={() => addItem("follow_ups", { title: "", location: "", detail: "" })}
                    className="text-xs text-blue-700 hover:underline bg-transparent border-none cursor-pointer">+ Add follow-up</button>
                </div>
                <div className="space-y-2">
                  {(draft.follow_ups || []).map((f: any, i: number) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50/50">
                      <div className="flex gap-2 mb-1.5">
                        <input value={f.title || ""} onChange={e => patchItem("follow_ups", i, "title", e.target.value)} placeholder="Title"
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                        <button onClick={() => removeItem("follow_ups", i)} className="text-red-400 hover:text-red-700 bg-transparent border-none cursor-pointer text-sm px-1" title="Remove">🗑</button>
                      </div>
                      <input value={f.location || ""} onChange={e => patchItem("follow_ups", i, "location", e.target.value)} placeholder="Location (optional)"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs mb-1.5 bg-white" />
                      <textarea value={f.detail || ""} onChange={e => patchItem("follow_ups", i, "detail", e.target.value)} placeholder="Detail" rows={2}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white" />
                      {(f.sources || []).length > 0 && <div className="text-[10px] text-gray-400 mt-1">Sources: {f.sources.join(", ")}</div>}
                    </div>
                  ))}
                  {(draft.follow_ups || []).length === 0 && <div className="text-xs text-gray-400">None.</div>}
                </div>
              </div>

              {/* Patterns */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Patterns ({(draft.patterns || []).length})</label>
                  <button onClick={() => addItem("patterns", { title: "", detail: "" })}
                    className="text-xs text-blue-700 hover:underline bg-transparent border-none cursor-pointer">+ Add pattern</button>
                </div>
                <div className="space-y-2">
                  {(draft.patterns || []).map((p: any, i: number) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50/50">
                      <div className="flex gap-2 mb-1.5">
                        <input value={p.title || ""} onChange={e => patchItem("patterns", i, "title", e.target.value)} placeholder="Title"
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                        <button onClick={() => removeItem("patterns", i)} className="text-red-400 hover:text-red-700 bg-transparent border-none cursor-pointer text-sm px-1" title="Remove">🗑</button>
                      </div>
                      <textarea value={p.detail || ""} onChange={e => patchItem("patterns", i, "detail", e.target.value)} placeholder="Detail" rows={2}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white" />
                      {(p.sources || []).length > 0 && <div className="text-[10px] text-gray-400 mt-1">Sources: {p.sources.join(", ")}</div>}
                    </div>
                  ))}
                  {(draft.patterns || []).length === 0 && <div className="text-xs text-gray-400">None.</div>}
                </div>
              </div>

              {/* Recommendations */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recommendations ({(draft.recommendations || []).length})</label>
                  <button onClick={() => addItem("recommendations", "")}
                    className="text-xs text-blue-700 hover:underline bg-transparent border-none cursor-pointer">+ Add recommendation</button>
                </div>
                <div className="space-y-2">
                  {(draft.recommendations || []).map((r: string, i: number) => (
                    <div key={i} className="flex gap-2">
                      <textarea value={r || ""} onChange={e => setRec(i, e.target.value)} rows={2}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                      <button onClick={() => removeItem("recommendations", i)} className="text-red-400 hover:text-red-700 bg-transparent border-none cursor-pointer text-sm px-1" title="Remove">🗑</button>
                    </div>
                  ))}
                  {(draft.recommendations || []).length === 0 && <div className="text-xs text-gray-400">None.</div>}
                </div>
              </div>

              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                ⚠ AI-generated — verify every item against the source reports before releasing to the client. Your edits here become the exact content emailed.
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-xl flex-wrap">
              <div className="text-xs text-gray-500">
                {(editing.recipients || []).length > 0
                  ? <>Recipients: {editing.recipients.join(", ")}</>
                  : <span className="text-amber-700">⚠ No recipients configured — set them above and Save the policy before sending.</span>}
                {editMsg && <span className="ml-2 text-green-700">{editMsg}</span>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setEditing(null)} disabled={savingEdit}
                  className="px-3 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-200 border-none cursor-pointer disabled:opacity-50">Close</button>
                <button onClick={() => saveEdits(false)} disabled={savingEdit}
                  className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-md hover:bg-blue-800 border-none cursor-pointer disabled:opacity-50">{savingEdit ? "Saving…" : "💾 Save Revisions"}</button>
                <button onClick={saveAndSend} disabled={savingEdit || (editing.recipients || []).length === 0}
                  title={(editing.recipients || []).length === 0 ? "No recipients configured" : "Save revisions and email to client"}
                  className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-md hover:bg-green-800 border-none cursor-pointer disabled:opacity-40">✅ Save &amp; Send</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

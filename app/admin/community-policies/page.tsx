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

  async function sendSummary(id: string) {
    if (!confirm("Approve and email this summary to the configured recipients?")) return
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
    </div>
  )
}

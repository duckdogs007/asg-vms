"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Community } from "@/lib/types"
import { checkIsAdmin } from "@/lib/admin"
import {
  PostOrders,
  PostOrderContact,
  PostOrderProcedure,
  PostOrderReportExample,
  EMPTY_POST_ORDERS,
  loadPostOrders,
  savePostOrders,
} from "@/lib/postOrders"

const EMPTY_CONTACT:   PostOrderContact       = { role: "", name: "", contact: "" }
const EMPTY_PROCEDURE: PostOrderProcedure     = { title: "", icon: "📌", items: [] }
const EMPTY_EXAMPLE:   PostOrderReportExample = { title: "", body: "" }

export default function PostOrdersEditorPage() {

  const [communities, setCommunities] = useState<Community[]>([])
  const [communityId, setCommunityId] = useState("")
  const [orders,      setOrders]      = useState<PostOrders>(EMPTY_POST_ORDERS)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [savedAt,     setSavedAt]     = useState("")
  const [error,       setError]       = useState("")
  const [isAdmin,     setIsAdmin]     = useState<boolean | null>(null)
  const [userEmail,   setUserEmail]   = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || ""))
    checkIsAdmin().then(ok => {
      setIsAdmin(ok)
      if (ok) initCommunities()
      else    setLoading(false)
    })
  }, [])

  async function initCommunities() {
    const { data } = await supabase.from("communities").select("id, name").order("name")
    if (!data) { setLoading(false); return }
    setCommunities(data)
    const saved = typeof window !== "undefined"
      ? localStorage.getItem("asg-current-community-id") || ""
      : ""
    const initial = data.find(c => c.id === saved) || data[0]
    if (initial) {
      setCommunityId(initial.id)
      void loadFor(initial.id)
    } else {
      setLoading(false)
    }
  }

  async function loadFor(id: string) {
    setLoading(true)
    setError("")
    setSavedAt("")
    const result = await loadPostOrders(id)
    setOrders(result || { ...EMPTY_POST_ORDERS, lastUpdated: new Date().toISOString().slice(0, 10) })
    setLoading(false)
  }

  function selectCommunity(id: string) {
    setCommunityId(id)
    void loadFor(id)
  }

  async function save() {
    setSaving(true)
    setError("")
    const { error: err } = await savePostOrders(communityId, orders)
    setSaving(false)
    if (err) {
      setError("Save failed: " + err)
      return
    }
    const communityName = communities.find(c => c.id === communityId)?.name || communityId
    supabase.from("audit_logs").insert({
      user_email:    userEmail,
      action:        "updated",
      resource_type: "Post Orders",
      resource_id:   communityId,
      detail:        `Updated post orders for ${communityName}`,
      created_at:    new Date().toISOString(),
    }).then(({ error: ae }) => { if (ae) console.error("[audit]", ae) })
    setSavedAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))
  }

  // ── Contact handlers ──
  const setContact = (i: number, patch: Partial<PostOrderContact>) =>
    setOrders(o => ({ ...o, contacts: o.contacts.map((c, idx) => idx === i ? { ...c, ...patch } : c) }))
  const addContact    = () => setOrders(o => ({ ...o, contacts: [...o.contacts, { ...EMPTY_CONTACT }] }))
  const removeContact = (i: number) => setOrders(o => ({ ...o, contacts: o.contacts.filter((_, idx) => idx !== i) }))

  // ── Procedure handlers ──
  const setProcedure = (i: number, patch: Partial<PostOrderProcedure>) =>
    setOrders(o => ({ ...o, procedures: o.procedures.map((p, idx) => idx === i ? { ...p, ...patch } : p) }))
  const setProcedureItems = (i: number, raw: string) => {
    setProcedure(i, { items: raw.split("\n") })
  }
  const addProcedure    = () => setOrders(o => ({ ...o, procedures: [...o.procedures, { ...EMPTY_PROCEDURE, items: [] }] }))
  const removeProcedure = (i: number) => setOrders(o => ({ ...o, procedures: o.procedures.filter((_, idx) => idx !== i) }))

  // ── Example handlers ──
  const setExample = (i: number, patch: Partial<PostOrderReportExample>) =>
    setOrders(o => ({ ...o, reportExamples: o.reportExamples.map((e, idx) => idx === i ? { ...e, ...patch } : e) }))
  const addExample    = () => setOrders(o => ({ ...o, reportExamples: [...o.reportExamples, { ...EMPTY_EXAMPLE }] }))
  const removeExample = (i: number) => setOrders(o => ({ ...o, reportExamples: o.reportExamples.filter((_, idx) => idx !== i) }))

  const inputCls    = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
  const textareaCls = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white font-mono"
  const labelCls    = "block text-xs font-semibold text-gray-600 mb-1"
  const sectionCls  = "bg-white border border-gray-200 rounded-xl p-4 mb-5"
  const cardCls     = "border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50"
  const removeCls   = "px-2.5 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded cursor-pointer"
  const addCls      = "px-3 py-2 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded font-medium cursor-pointer"

  return (
    <div className="p-5 max-w-5xl">

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="text-2xl font-bold">📋 Edit Post Orders</h2>
        <Link href="/admin/system" className="text-sm text-blue-700 hover:text-blue-900">← Back to Admin Dashboard</Link>
      </div>
      <p className="text-sm text-gray-500 mb-5">Edit the post orders displayed at <code>/vms/post-orders</code>. Changes are visible to all officers immediately upon save.</p>

      {isAdmin === null && (
        <div className="text-gray-500 text-sm py-8 text-center">Checking permissions…</div>
      )}

      {isAdmin === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-6 text-sm">
          <div className="font-bold mb-1">🔒 Admin access required</div>
          <div>Post orders editing is restricted to admin users. Contact an administrator if you need access.</div>
          <Link href="/admin/system" className="inline-block mt-3 text-blue-700 hover:text-blue-900 text-sm">← Back to Admin Dashboard</Link>
        </div>
      )}

      {isAdmin === true && <>

      {/* Location + last-updated */}
      <div className={sectionCls}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Location</label>
            <select value={communityId} onChange={e => selectCommunity(e.target.value)} className={inputCls}>
              {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Last Updated</label>
            <input
              type="date"
              value={orders.lastUpdated}
              onChange={e => setOrders(o => ({ ...o, lastUpdated: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={save}
              disabled={saving || loading || !communityId}
              className="w-full px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-md hover:bg-blue-800 border-none cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving…" : "💾 Save"}
            </button>
          </div>
        </div>
        {savedAt && <div className="text-green-700 text-xs mt-2">✓ Saved at {savedAt}</div>}
        {error   && <div className="text-red-700   text-xs mt-2">{error}</div>}
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm py-8 text-center">Loading…</div>
      ) : (
        <>

          {/* CONTACTS */}
          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Points of Contact</h3>
            {orders.contacts.length === 0 && (
              <div className="text-gray-500 text-sm mb-3">No contacts yet.</div>
            )}
            {orders.contacts.map((c, i) => (
              <div key={i} className={cardCls}>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-4">
                    <label className={labelCls}>Role</label>
                    <input value={c.role} onChange={e => setContact(i, { role: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={labelCls}>Name</label>
                    <input value={c.name} onChange={e => setContact(i, { name: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-4">
                    <label className={labelCls}>Contact</label>
                    <input value={c.contact} onChange={e => setContact(i, { contact: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-1">
                    <button type="button" onClick={() => removeContact(i)} className={removeCls}>✕</button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addContact} className={addCls}>+ Add Contact</button>
          </div>

          {/* PROCEDURES */}
          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Post Procedures</h3>
            {orders.procedures.length === 0 && (
              <div className="text-gray-500 text-sm mb-3">No procedures yet.</div>
            )}
            {orders.procedures.map((p, i) => (
              <div key={i} className={cardCls}>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Icon</label>
                    <input value={p.icon} onChange={e => setProcedure(i, { icon: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-9">
                    <label className={labelCls}>Title</label>
                    <input value={p.title} onChange={e => setProcedure(i, { title: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-1 flex items-end">
                    <button type="button" onClick={() => removeProcedure(i)} className={removeCls}>✕</button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Items <span className="font-normal text-gray-400">(one per line)</span></label>
                  <textarea
                    rows={Math.max(p.items.length + 1, 4)}
                    value={p.items.join("\n")}
                    onChange={e => setProcedureItems(i, e.target.value)}
                    className={textareaCls}
                    placeholder="One bullet per line"
                  />
                </div>
              </div>
            ))}
            <button type="button" onClick={addProcedure} className={addCls}>+ Add Procedure</button>
          </div>

          {/* EXAMPLES */}
          <div className={sectionCls}>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Sample Report Templates</h3>
            {orders.reportExamples.length === 0 && (
              <div className="text-gray-500 text-sm mb-3">No report templates yet.</div>
            )}
            {orders.reportExamples.map((ex, i) => (
              <div key={i} className={cardCls}>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-2">
                  <div className="sm:col-span-11">
                    <label className={labelCls}>Title</label>
                    <input value={ex.title} onChange={e => setExample(i, { title: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-1 flex items-end">
                    <button type="button" onClick={() => removeExample(i)} className={removeCls}>✕</button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Body</label>
                  <textarea
                    rows={6}
                    value={ex.body}
                    onChange={e => setExample(i, { body: e.target.value })}
                    className={textareaCls}
                    placeholder="Use [BRACKETED FIELDS] for placeholders. Officers fill these in before submitting."
                  />
                </div>
              </div>
            ))}
            <button type="button" onClick={addExample} className={addCls}>+ Add Report Template</button>
          </div>

          {/* Sticky save */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 py-3 -mx-5 px-5 flex justify-end gap-2">
            {savedAt && <span className="text-green-700 text-sm self-center">✓ Saved at {savedAt}</span>}
            {error   && <span className="text-red-700   text-sm self-center">{error}</span>}
            <button
              onClick={save}
              disabled={saving || loading || !communityId}
              className="px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-md hover:bg-blue-800 border-none cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving…" : "💾 Save Changes"}
            </button>
          </div>
        </>
      )}

      </>}
    </div>
  )
}

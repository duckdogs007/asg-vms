"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import pkg from "../../../package.json"

type Tab = "communities" | "recipients" | "users" | "settings" | "audit"

interface Community { id: string; name: string }
interface Recipient {
  id:          string
  email:       string
  name:        string | null
  role:        string | null
  communities: string[] | null
  active:      boolean
  created_at:  string
}
interface UserRow {
  id:                 string
  email:              string | null
  created_at:         string
  last_sign_in_at:    string | null
  updated_at:         string | null
  last_login:         string | null
  last_logout:        string | null
  email_confirmed_at: string | null
  is_admin?:          boolean
  community_id?:      string | null
  community?:         string | null
  role?:              string | null
}

// updated_at is bumped on every token refresh, last_sign_in_at only on
// fresh sign-in — take whichever is newer. Used for sorting the user list
// by recency of activity.
const lastActiveOf = (u: { updated_at?: string | null; last_sign_in_at?: string | null }) => {
  const a = u.updated_at || ""
  const b = u.last_sign_in_at || ""
  return a > b ? a : b
}

// Compact "Jun 11, 3:42 PM" / "never" timestamp cell for login activity.
const fmtStamp = (ts: string | null | undefined) =>
  ts
    ? new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null

export default function AdminSystemPage() {

  const [activeTab, setActiveTab] = useState<Tab>("communities")
  const [message,   setMessage]   = useState("")

  // ── COMMUNITIES ──
  const [communities,  setCommunities]  = useState<Community[]>([])
  const [newCommunity, setNewCommunity] = useState("")
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editingName,  setEditingName]  = useState("")

  // ── RECIPIENTS ──
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [newEmail,   setNewEmail]   = useState("")
  const [newName,    setNewName]    = useState("")
  const [newRole,    setNewRole]    = useState("admin")

  // ── USERS ──
  const [users,      setUsers]      = useState<UserRow[]>([])
  const [usersError, setUsersError] = useState("")
  // Add User form
  const [showAddUser, setShowAddUser] = useState(false)
  const [auEmail,     setAuEmail]     = useState("")
  const [auPassword,  setAuPassword]  = useState("")
  const [auName,      setAuName]      = useState("")
  const [auCommunity, setAuCommunity] = useState("")
  const [auIsAdmin,   setAuIsAdmin]   = useState(false)
  const [auSaving,    setAuSaving]    = useState(false)
  const [auError,     setAuError]     = useState("")
  const [auMessage,   setAuMessage]   = useState("")

  async function refreshUsers() {
    const r = await fetch("/api/admin/users", { cache: "no-store" })
    const json = await r.json().catch(() => ({}))
    if (r.ok) {
      setUsers((json.users as UserRow[]).sort((a, b) => lastActiveOf(b).localeCompare(lastActiveOf(a))))
    }
  }

  async function addUser() {
    setAuError(""); setAuMessage("")
    if (!auEmail.trim())          { setAuError("Email is required."); return }
    if (auPassword.length < 8)    { setAuError("Password must be at least 8 characters."); return }
    setAuSaving(true)
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:        auEmail.trim(),
          password:     auPassword,
          full_name:    auName.trim() || undefined,
          community_id: auCommunity || null,
          is_admin:     auIsAdmin,
        }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) { setAuError(json.error || `HTTP ${r.status}`); setAuSaving(false); return }
      setAuMessage(`✅ User created: ${auEmail.trim()}`)
      setAuEmail(""); setAuPassword(""); setAuName(""); setAuCommunity(""); setAuIsAdmin(false)
      setShowAddUser(false)
      await refreshUsers()
    } catch (e: any) {
      setAuError(e?.message || String(e))
    } finally {
      setAuSaving(false)
    }
  }

  // ── AUDIT LOG ──
  const [auditLogs,    setAuditLogs]    = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLimit,   setAuditLimit]   = useState(20)
  const [auditFilter,  setAuditFilter]  = useState<string>("all")

  // ── SETTINGS ──
  const [tableCounts,     setTableCounts]     = useState<Record<string, number> | null>(null)
  const [bucketStatus,    setBucketStatus]    = useState<Record<string, { ok: boolean; sample: number; error?: string }> | null>(null)
  const [webhookTesting,  setWebhookTesting]  = useState(false)
  const [webhookResult,   setWebhookResult]   = useState<"" | "ok" | "fail">("")
  const [webhookError,    setWebhookError]    = useState("")
  const [adminList,       setAdminList]       = useState<{ email: string; last_active_at: string | null }[]>([])
  const [auditStats,      setAuditStats]      = useState<{ count: number; oldest: string | null; newest: string | null } | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)

  useEffect(() => {
    load()
  }, [activeTab])

  async function load() {
    if (activeTab === "communities") {
      const { data } = await supabase.from("communities").select("id,name").order("name")
      setCommunities(data || [])
    } else if (activeTab === "recipients") {
      const { data } = await supabase.from("notification_recipients")
        .select("*").order("created_at", { ascending: false })
      setRecipients(data || [])
    } else if (activeTab === "users") {
      setUsersError("")
      try {
        // Communities power the Location dropdown on each row
        const { data: c } = await supabase.from("communities").select("id,name").order("name")
        setCommunities(c || [])

        const r = await fetch("/api/admin/users", { cache: "no-store" })
        const json = await r.json()
        if (!r.ok) {
          setUsersError(json.error || `HTTP ${r.status}`)
          setUsers([])
        } else {
          const rows = (json.users as UserRow[]).sort(
            (a, b) => lastActiveOf(b).localeCompare(lastActiveOf(a))
          )
          setUsers(rows)
        }
      } catch (e: any) {
        setUsersError(e?.message || String(e))
        setUsers([])
      }
    } else if (activeTab === "settings") {
      void loadSettings()
    } else if (activeTab === "audit") {
      void loadAuditLog()
    }
  }

  // silent=true skips the loading spinner so the interval poll doesn't flicker
  // the table (the render hides the table while auditLoading is true).
  async function loadAuditLog(silent = false) {
    if (!silent) { setAuditLoading(true); setAuditLimit(20) }
    const { data } = await supabase.from("audit_logs")
      .select("*").order("created_at", { ascending: false }).limit(500)
    setAuditLogs(data || [])
    if (!silent) setAuditLoading(false)
  }

  // Live updates: while the Audit Log tab is open, re-poll every 10s. New
  // entries appear within the interval without a manual refresh.
  useEffect(() => {
    if (activeTab !== "audit") return
    const t = setInterval(() => loadAuditLog(true), 10000)
    return () => clearInterval(t)
  }, [activeTab])

  // ── SETTINGS loaders ──
  async function loadSettings() {
    setSettingsLoading(true)
    setTableCounts(null); setBucketStatus(null); setAdminList([]); setAuditStats(null)
    await Promise.all([loadTableCounts(), loadBucketStatus(), loadAdminList(), loadAuditStats()])
    setSettingsLoading(false)
  }

  async function loadTableCounts() {
    const tables = [
      "communities", "units", "residents",
      "watchlist", "visitors", "visitor_logs",
      "bolos", "alerts", "denied_entries",
      "post_orders", "admin_users", "audit_logs",
    ]
    const counts: Record<string, number> = {}
    await Promise.all(tables.map(async (t) => {
      const { count } = await supabase.from(t).select("*", { count: "exact", head: true })
      counts[t] = count || 0
    }))
    setTableCounts(counts)
  }

  async function loadBucketStatus() {
    const status: Record<string, { ok: boolean; sample: number; error?: string }> = {}
    for (const bucket of ["photos", "contact-photos"]) {
      const { data, error } = await supabase.storage.from(bucket).list("", { limit: 1 })
      if (error) status[bucket] = { ok: false, sample: 0, error: error.message }
      else       status[bucket] = { ok: true,  sample: data?.length || 0 }
    }
    setBucketStatus(status)
  }

  async function saveRole(userId: string, role: string | null) {
    setUsers(prev => prev.map(u => u.id !== userId ? u : ({ ...u, role })))
    // When setting admin_super clear community; when clearing role, also clear community
    const community_id = (role === "admin_super" || role === null) ? null : undefined
    const body: any = { user_id: userId, role }
    if (community_id !== undefined) body.community_id = community_id
    const r = await fetch("/api/admin/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const json = await r.json().catch(() => ({}))
      setUsersError(json.error || `HTTP ${r.status}`)
    }
  }

  async function saveCommunity(userId: string, communityId: string | null) {
    setUsers(prev => prev.map(u => u.id !== userId ? u : ({
      ...u,
      community_id: communityId,
      community:    communityId ? (communities.find(c => c.id === communityId)?.name || null) : null,
    })))
    const r = await fetch("/api/admin/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, community_id: communityId }),
    })
    if (!r.ok) {
      const json = await r.json().catch(() => ({}))
      setUsersError(json.error || `HTTP ${r.status}`)
    }
  }

  async function loadAdminList() {
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" })
      if (!r.ok) return
      const { users } = await r.json()
      const admins = (users || [])
        .filter((u: any) => u.is_admin)
        .map((u: any) => ({ email: u.email || "—", last_active_at: lastActiveOf(u) || null }))
        .sort((a: any, b: any) => (b.last_active_at || "").localeCompare(a.last_active_at || ""))
      setAdminList(admins)
    } catch {
      setAdminList([])
    }
  }

  async function loadAuditStats() {
    const { count } = await supabase.from("audit_logs").select("*", { count: "exact", head: true })
    const [{ data: oldest }, { data: newest }] = await Promise.all([
      supabase.from("audit_logs").select("created_at").order("created_at", { ascending: true  }).limit(1).maybeSingle(),
      supabase.from("audit_logs").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    const o = oldest as { created_at: string } | null
    const n = newest as { created_at: string } | null
    setAuditStats({
      count:  count || 0,
      oldest: o?.created_at || null,
      newest: n?.created_at || null,
    })
  }

  async function testWebhook() {
    setWebhookTesting(true); setWebhookResult(""); setWebhookError("")
    try {
      const r = await fetch("/api/admin/test-webhook", { method: "POST" })
      const json = await r.json().catch(() => ({}))
      if (r.ok) {
        setWebhookResult("ok")
      } else {
        setWebhookResult("fail")
        setWebhookError(json.error || `HTTP ${r.status}`)
      }
    } catch (e: any) {
      setWebhookResult("fail")
      setWebhookError(e?.message || String(e))
    }
    setWebhookTesting(false)
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return "never"
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  }

  function flash(msg: string) {
    setMessage(msg)
    setTimeout(() => setMessage(""), 2500)
  }

  // ── COMMUNITIES handlers ──
  async function addCommunity() {
    const name = newCommunity.trim()
    if (!name) return
    const { error } = await supabase.from("communities").insert({ name })
    if (error) { flash("Add failed: " + error.message); return }
    setNewCommunity("")
    flash("Location added")
    load()
  }

  async function saveCommunityRename(id: string) {
    const name = editingName.trim()
    if (!name) return
    const { error } = await supabase.from("communities").update({ name }).eq("id", id)
    if (error) { flash("Rename failed: " + error.message); return }
    setEditingId(null); setEditingName("")
    flash("Renamed")
    load()
  }

  async function deleteCommunity(id: string) {
    if (!confirm("Delete this location? Units and residents linked to it must be moved or deleted first.")) return
    const { error } = await supabase.from("communities").delete().eq("id", id)
    if (error) { flash("Delete failed: " + error.message); return }
    flash("Location deleted")
    load()
  }

  // ── RECIPIENTS handlers ──
  async function addRecipient() {
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    const { error } = await supabase.from("notification_recipients").insert({
      email,
      name:   newName.trim() || null,
      role:   newRole,
      active: true,
    })
    if (error) { flash("Add failed: " + error.message); return }
    setNewEmail(""); setNewName(""); setNewRole("admin")
    flash("Recipient added")
    load()
  }

  async function toggleActive(r: Recipient) {
    const { error } = await supabase.from("notification_recipients")
      .update({ active: !r.active }).eq("id", r.id)
    if (error) { flash("Update failed: " + error.message); return }
    load()
  }

  async function deleteRecipient(id: string) {
    if (!confirm("Remove this recipient?")) return
    const { error } = await supabase.from("notification_recipients").delete().eq("id", id)
    if (error) { flash("Delete failed: " + error.message); return }
    flash("Removed")
    load()
  }

  const tabBtnCls = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold border-none cursor-pointer rounded-t-md transition-colors ${
      activeTab === t ? "bg-blue-800 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`

  const inputCls = "px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">⚙️ Admin Dashboard</h1>
      <p className="text-sm text-gray-500 mb-5">System-wide configuration. Admin-only.</p>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-md mb-4">{message}</div>
      )}

      <div className="flex gap-1 border-b border-gray-300 mb-4 overflow-x-auto">
        <button onClick={() => setActiveTab("communities")} className={tabBtnCls("communities")}>🏘️ Locations</button>
        <button onClick={() => setActiveTab("recipients")}  className={tabBtnCls("recipients")}>🔔 Notification Recipients</button>
        <button onClick={() => setActiveTab("users")}       className={tabBtnCls("users")}>👥 Users</button>
        <button onClick={() => setActiveTab("settings")}    className={tabBtnCls("settings")}>🛠 Settings</button>
        <button onClick={() => setActiveTab("audit")}       className={tabBtnCls("audit")}>🔒 Audit Log</button>
        <Link href="/admin/post-orders" className="px-4 py-2 text-sm font-semibold rounded-t-md transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200">📋 Post Orders</Link>
        <Link href="/admin/community-policies" className="px-4 py-2 text-sm font-semibold rounded-t-md transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap">⚙️ Community Policies</Link>
      </div>

      {/* COMMUNITIES */}
      {activeTab === "communities" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex gap-2 mb-4">
            <input
              value={newCommunity}
              onChange={e => setNewCommunity(e.target.value)}
              placeholder="New location name"
              className={`${inputCls} flex-1`}
              onKeyDown={e => e.key === "Enter" && addCommunity()}
            />
            <button onClick={addCommunity} className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer">+ Add</button>
          </div>
          {communities.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">No locations yet.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {communities.map(c => (
                <li key={c.id} className="flex justify-between items-center py-2.5 gap-3">
                  {editingId === c.id ? (
                    <>
                      <input
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        className={`${inputCls} flex-1`}
                        autoFocus
                        onKeyDown={e => e.key === "Enter" && saveCommunityRename(c.id)}
                      />
                      <button onClick={() => saveCommunityRename(c.id)} className="px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded border-none cursor-pointer">Save</button>
                      <button onClick={() => { setEditingId(null); setEditingName("") }} className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 text-xs font-semibold rounded border-none cursor-pointer">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingId(c.id); setEditingName(c.name) }} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-semibold rounded border-none cursor-pointer">✎ Rename</button>
                        <button onClick={() => deleteCommunity(c.id)} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded border-none cursor-pointer">🗑 Delete</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* RECIPIENTS */}
      {activeTab === "recipients" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@teamasg.com" className={inputCls} />
            <input value={newName}  onChange={e => setNewName(e.target.value)}  placeholder="Name (optional)"   className={inputCls} />
            <select value={newRole} onChange={e => setNewRole(e.target.value)}  className={inputCls}>
              <option value="admin">admin</option>
              <option value="supervisor">supervisor</option>
              <option value="ops">ops</option>
            </select>
            <button onClick={addRecipient} className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer">+ Add Recipient</button>
          </div>
          <p className="text-xs text-gray-500 mb-3">Recipients are an audit list — Tier 1 alerts broadcast to a Teams channel via webhook. Use this for future per-location routing.</p>
          {recipients.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">No recipients.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Active</th>
                  <th className="px-3 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map(r => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                    <td className="px-3 py-2">{r.name || "—"}</td>
                    <td className="px-3 py-2">{r.role || "—"}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleActive(r)} className={`px-2 py-0.5 text-xs font-semibold rounded border-none cursor-pointer ${r.active ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>
                        {r.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => deleteRecipient(r.id)} className="px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded border-none cursor-pointer">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* USERS */}
      {activeTab === "users" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">
              Live from Supabase Authentication via service-role key.
            </p>
            <button
              onClick={() => { setShowAddUser(v => !v); setAuError(""); setAuMessage("") }}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded border-none cursor-pointer"
            >
              {showAddUser ? "✕ Cancel" : "+ Add User"}
            </button>
          </div>

          {auMessage && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-md mb-3">{auMessage}</div>
          )}

          {showAddUser && (
            <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
                  <input type="email" value={auEmail} onChange={e => setAuEmail(e.target.value)} placeholder="officer@teamasg.com"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Temporary Password *</label>
                  <input type="text" value={auPassword} onChange={e => setAuPassword(e.target.value)} placeholder="min 8 characters"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
                  <input type="text" value={auName} onChange={e => setAuName(e.target.value)} placeholder="optional"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
                  <select value={auCommunity} onChange={e => setAuCommunity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white">
                    <option value="">— Unassigned —</option>
                    {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={auIsAdmin} onChange={e => setAuIsAdmin(e.target.checked)} className="w-4 h-4 accent-blue-700" />
                <span className="text-sm text-gray-700">Grant admin access</span>
              </label>
              {auError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md mt-3">{auError}</div>}
              <div className="mt-3">
                <button onClick={addUser} disabled={auSaving}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded border-none cursor-pointer disabled:opacity-50">
                  {auSaving ? "Creating…" : "Create User"}
                </button>
                <span className="text-xs text-gray-500 ml-3">Email is pre-confirmed; the user can sign in immediately with this password.</span>
              </div>
            </div>
          )}

          {usersError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md mb-3">
              {usersError}
              {usersError.includes("SUPABASE_SERVICE_ROLE_KEY") && (
                <div className="text-xs mt-1 text-red-600">
                  Add the env var in Vercel: Settings → Environment Variables → SUPABASE_SERVICE_ROLE_KEY (from Supabase → Project Settings → API → service_role).
                </div>
              )}
            </div>
          )}
          {users.length === 0 && !usersError ? (
            <div className="text-sm text-gray-500 py-6 text-center">No users.</div>
          ) : users.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Access Level</th>
                  <th className="px-3 py-2 text-left">Community</th>
                  <th className="px-3 py-2 text-left">Confirmed</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Last Login</th>
                  <th className="px-3 py-2 text-left">Last Logout</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{u.email || "—"}</td>
                    <td className="px-3 py-2">
                      <select
                        value={u.role === "admin_super" ? "admin_super" : u.role === "supervisor" ? "supervisor" : u.role === "guest" ? "guest" : "officer"}
                        onChange={e => {
                          const v = e.target.value
                          saveRole(u.id, v === "officer" ? null : v)
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                      >
                        <option value="officer">Officer</option>
                        <option value="guest">Guest (view-only)</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="admin_super">Admin</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {u.role === "admin_super" ? (
                        <span className="text-xs text-gray-400">— all —</span>
                      ) : (
                        <select
                          value={u.community_id || ""}
                          onChange={e => saveCommunity(u.id, e.target.value || null)}
                          className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                        >
                          <option value="">— Unassigned —</option>
                          {communities.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {u.email_confirmed_at
                        ? <span className="text-green-700 text-xs font-semibold">✓</span>
                        : <span className="text-gray-400 text-xs">pending</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {new Date(u.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {fmtStamp(u.last_login) || <span className="text-gray-400">never</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {fmtStamp(u.last_logout) || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      )}

      {/* SETTINGS */}
      {activeTab === "settings" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5 text-sm">

          {/* SYSTEM HEALTH */}
          <Section title="💚 System Health">
            <Row k="Build version" v={`v${pkg.version}${process.env.NEXT_PUBLIC_BUILD_DATE ? ` · ${process.env.NEXT_PUBLIC_BUILD_DATE}` : ""}`} />
            <Row k="Supabase status" v={settingsLoading ? "Checking…" : (tableCounts ? "🟢 Online" : "🔴 Unreachable")} />
            <Row k="Total DB records" v={tableCounts ? Object.values(tableCounts).reduce((a, b) => a + b, 0).toLocaleString() : "—"} />
            {tableCounts && (
              <div className="px-3 py-2.5 bg-white">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(tableCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                    <div key={t} className="flex justify-between">
                      <span className="text-gray-500">{t}</span>
                      <span className="text-gray-900 font-mono">{n.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* STORAGE BUCKETS */}
          <Section title="🪣 Storage Buckets">
            {!bucketStatus && <Row k="Status" v="Checking…" />}
            {bucketStatus && Object.entries(bucketStatus).map(([name, s]) => (
              <Row key={name} k={name} v={s.ok ? `🟢 OK (${s.sample === 0 ? "empty" : `${s.sample}+ files`})` : `🔴 ${s.error || "unreachable"}`} />
            ))}
          </Section>

          {/* ALERTS TRANSPORT + TEST WEBHOOK */}
          <Section title="🔔 Alerts Transport">
            <Row k="Channel" v="Microsoft Teams (Workflows webhook)" />
            <Row k="Webhook URL" v="TEAMS_WEBHOOK_URL (server-only env var)" />
            <Row k="Audit log" v="public.alerts (auth read + insert)" />
            <div className="flex justify-between items-center gap-3 px-3 py-2 text-sm bg-white">
              <span className="text-gray-500 font-medium">Test connection</span>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {webhookResult === "ok"   && <span className="text-green-700 text-xs font-semibold">✓ Sent — check the Teams channel</span>}
                {webhookResult === "fail" && <span className="text-red-700   text-xs font-semibold max-w-xs truncate" title={webhookError}>✕ {webhookError || "Failed"}</span>}
                <button
                  onClick={testWebhook}
                  disabled={webhookTesting}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md border-none cursor-pointer disabled:opacity-50"
                >
                  {webhookTesting ? "Sending…" : "🧪 Test Webhook"}
                </button>
              </div>
            </div>
          </Section>

          {/* ADMIN ACCESS */}
          <Section title="🔐 Admin Access">
            <Row k="Source of truth" v="public.admin_users table" />
            <Row k="Admin routes" v="/admin, /admin/system, /admin/post-orders" />
            {adminList.length === 0 && <Row k="Active admins" v={settingsLoading ? "Loading…" : "—"} />}
            {adminList.map(a => (
              <Row key={a.email} k={a.email} v={a.last_active_at ? `Last seen ${fmtDate(a.last_active_at)}` : "Never signed in"} />
            ))}
          </Section>

          {/* AUDIT & RETENTION */}
          <Section title="📜 Audit & Retention">
            <Row k="Audit log entries" v={auditStats ? auditStats.count.toLocaleString() : "—"} />
            <Row k="Oldest entry"      v={fmtDate(auditStats?.oldest || null)} />
            <Row k="Newest entry"      v={fmtDate(auditStats?.newest || null)} />
            <Row k="Retention policy"  v="No auto-purge (forensic integrity). Manual cleanup via Supabase Studio." />
            <Row k="Database backups"  v="Supabase managed (daily snapshots / point-in-time restore)" />
          </Section>

        </div>
      )}

      {/* AUDIT LOG */}
      {activeTab === "audit" && (
        <div>
          <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Activity Audit Log</h3>
              <p className="text-xs text-gray-500 mt-0.5">Read only — actions logged system-wide</p>
            </div>
            <button onClick={() => loadAuditLog()}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 border-none cursor-pointer">
              ↻ Refresh
            </button>
          </div>
          {/* Filter bar */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {([
              { key: "auth",       label: "Login / Logout" },
              { key: "checkin",    label: "Check-ins" },
              { key: "watchlist",  label: "Watchlist" },
              { key: "bolo",       label: "BOLO" },
              { key: "alert",      label: "Alerts" },
              { key: "search",     label: "Searches" },
              { key: "delete",     label: "Deletions" },
              { key: "report",     label: "Reports" },
              { key: "all",        label: "All Activity" },
            ] as { key: string; label: string }[]).map(f => (
              <button
                key={f.key}
                onClick={() => { setAuditFilter(f.key); setAuditLimit(20) }}
                className={`px-3 py-1 text-xs font-semibold rounded-full border-none cursor-pointer transition-colors ${
                  auditFilter === f.key
                    ? "bg-blue-800 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {(() => {
            const filtered = auditLogs.filter(log => {
              if (auditFilter === "all")       return true
              if (auditFilter === "auth")      return log.resource_type === "Auth"
              if (auditFilter === "checkin")   return (log.resource_type as string).includes("Check-In")
              if (auditFilter === "watchlist") return log.resource_type === "Watchlist"
              if (auditFilter === "bolo")      return log.resource_type === "BOLO"
              if (auditFilter === "alert")     return log.resource_type === "Alert"
              if (auditFilter === "search")    return log.action === "searched"
              if (auditFilter === "delete")    return log.action === "deleted"
              if (auditFilter === "report")    return log.resource_type === "Report Queue" || log.resource_type === "Report"
              return true
            })
            const visible = filtered.slice(0, auditLimit)
            return (
              <>
                {auditLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>}
                {!auditLoading && filtered.length === 0 && (
                  <div className="text-gray-500 text-sm py-8 text-center">No entries for this filter.</div>
                )}
                {!auditLoading && filtered.length > 0 && (
                  <>
                    <div className="text-xs text-gray-400 mb-2">{Math.min(auditLimit, filtered.length)} of {filtered.length} entries</div>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Timestamp</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">User</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Action</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Type</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((log, i) => {
                            const actionColor =
                              log.action === "login"        ? "text-blue-700 font-semibold" :
                              log.action === "logout"       ? "text-gray-500 font-semibold" :
                              log.action === "deleted"      ? "text-red-600 font-semibold" :
                              log.action === "edited"       ? "text-blue-600 font-semibold" :
                              log.action === "resolved"     ? "text-orange-500 font-semibold" :
                              log.action === "reactivated"  ? "text-purple-600 font-semibold" :
                              log.action === "email_failed" ? "text-red-600 font-semibold" :
                              log.action === "email_sent"   ? "text-emerald-600 font-semibold" :
                                                              "text-green-600 font-semibold"
                            return (
                              <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                                  {new Date(log.created_at.endsWith("Z") || log.created_at.includes("+") ? log.created_at : log.created_at + "Z")
                                    .toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-700">{log.user_email}</td>
                                <td className={`px-4 py-2.5 text-xs ${actionColor}`}>{log.action}</td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{log.resource_type}</td>
                                <td className="px-4 py-2.5 text-xs text-gray-500">{log.detail}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {auditLimit < filtered.length && (
                      <div className="mt-3 text-center">
                        <button
                          onClick={() => setAuditLimit(prev => prev + 20)}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg border-none cursor-pointer"
                        >
                          Load more ({filtered.length - auditLimit} remaining)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{title}</div>
      <div className="bg-gray-50 border border-gray-200 rounded-md divide-y divide-gray-200">
        {children}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between items-start gap-3 px-3 py-2 text-sm">
      <span className="text-gray-500 font-medium">{k}</span>
      <span className="text-gray-900 text-right">{v}</span>
    </div>
  )
}

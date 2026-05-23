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
  email_confirmed_at: string | null
  is_admin?:          boolean
}

// updated_at is bumped on every token refresh, last_sign_in_at only on
// fresh sign-in — take whichever is newer.
const lastActiveOf = (u: { updated_at?: string | null; last_sign_in_at?: string | null }) => {
  const a = u.updated_at || ""
  const b = u.last_sign_in_at || ""
  return a > b ? a : b
}

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

  // ── AUDIT LOG ──
  const [auditLogs,    setAuditLogs]    = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

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

  async function loadAuditLog() {
    setAuditLoading(true)
    const { data } = await supabase.from("audit_logs")
      .select("*").order("created_at", { ascending: false }).limit(100)
    setAuditLogs(data || [])
    setAuditLoading(false)
  }

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
          <p className="text-xs text-gray-500 mb-3">
            Live from Supabase Authentication via service-role key.
          </p>
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
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Confirmed</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{u.email || "—"}</td>
                    <td className="px-3 py-2">
                      {u.is_admin
                        ? <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded">Admin</span>
                        : <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded">User</span>}
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
                      {(() => {
                        const ts = lastActiveOf(u)
                        return ts
                          ? new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                          : <span className="text-gray-400">never</span>
                      })()}
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
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Activity Audit Log</h3>
              <p className="text-xs text-gray-500 mt-0.5">All system actions logged chronologically — read only</p>
            </div>
            <button onClick={loadAuditLog}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 border-none cursor-pointer">
              ↻ Refresh
            </button>
          </div>
          {auditLoading && <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>}
          {!auditLoading && auditLogs.length === 0 && (
            <div className="text-gray-500 text-sm py-8 text-center">No activity recorded yet.</div>
          )}
          {!auditLoading && auditLogs.length > 0 && (
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
                  {auditLogs.map((log, i) => {
                    const actionColor =
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
          )}
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

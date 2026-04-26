"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"

type Tab = "communities" | "recipients" | "users" | "settings"

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
  email_confirmed_at: string | null
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
          const rows = (json.users as UserRow[]).sort((a, b) => {
            const al = a.last_sign_in_at || ""
            const bl = b.last_sign_in_at || ""
            return bl.localeCompare(al)
          })
          setUsers(rows)
        }
      } catch (e: any) {
        setUsersError(e?.message || String(e))
        setUsers([])
      }
    }
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
    flash("Community added")
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
    if (!confirm("Delete this community? Units and residents linked to it must be moved or deleted first.")) return
    const { error } = await supabase.from("communities").delete().eq("id", id)
    if (error) { flash("Delete failed: " + error.message); return }
    flash("Community deleted")
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
        <button onClick={() => setActiveTab("communities")} className={tabBtnCls("communities")}>🏘️ Communities</button>
        <button onClick={() => setActiveTab("recipients")}  className={tabBtnCls("recipients")}>🔔 Notification Recipients</button>
        <button onClick={() => setActiveTab("users")}       className={tabBtnCls("users")}>👥 Users</button>
        <button onClick={() => setActiveTab("settings")}    className={tabBtnCls("settings")}>🛠 Settings</button>
      </div>

      {/* COMMUNITIES */}
      {activeTab === "communities" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex gap-2 mb-4">
            <input
              value={newCommunity}
              onChange={e => setNewCommunity(e.target.value)}
              placeholder="New community name"
              className={`${inputCls} flex-1`}
              onKeyDown={e => e.key === "Enter" && addCommunity()}
            />
            <button onClick={addCommunity} className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer">+ Add</button>
          </div>
          {communities.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">No communities yet.</div>
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
          <p className="text-xs text-gray-500 mb-3">Recipients are an audit list — Tier 1 alerts broadcast to a Teams channel via webhook. Use this for future per-community routing.</p>
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
                  <th className="px-3 py-2 text-left">Confirmed</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Last Sign-In</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{u.email || "—"}</td>
                    <td className="px-3 py-2">
                      {u.email_confirmed_at
                        ? <span className="text-green-700 text-xs font-semibold">✓</span>
                        : <span className="text-gray-400 text-xs">pending</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {new Date(u.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                        : <span className="text-gray-400">never</span>}
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
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 text-sm">
          <Section title="Alerts Transport">
            <Row k="Channel" v="Microsoft Teams (Workflows webhook)" />
            <Row k="Env var"  v="TEAMS_WEBHOOK_URL (set in Vercel)" />
            <Row k="Audit log" v="public.alerts (auth read + insert)" />
          </Section>
          <Section title="Admin Access">
            <Row k="Admin emails" v="Configured in middleware (proxy.ts)" />
            <Row k="Admin routes" v="/admin and /admin/system" />
          </Section>
          <Section title="Storage Buckets">
            <Row k="photos"          v="visitor profile photos (public)" />
            <Row k="contact-photos"  v="field contact + BOLO + Vehicle FI photos (public)" />
          </Section>
          <p className="text-xs text-gray-500">Read-only summary. Live config knobs come in a future pass.</p>
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

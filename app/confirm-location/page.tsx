"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"

interface Community { id: string; name: string }

export default function ConfirmLocationPage() {
  const router = useRouter()

  const [communities, setCommunities] = useState<Community[]>([])
  const [selected,    setSelected]    = useState<string>("") // "" | community_id
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState("")

  useEffect(() => {
    (async () => {
      try {
        // Communities for the dropdown
        const { data: c } = await supabase
          .from("communities")
          .select("id, name")
          .order("name")
        setCommunities(c || [])

        // Pre-fill with current assignment if any. (We don't pre-select
        // role=admin_super here — that label is admin-set only and lives
        // in /admin/system → Users tab, not in this self-confirm flow.)
        const r = await fetch("/api/me/assignment", { cache: "no-store" })
        const json = await r.json()
        if (r.ok && json.assignment?.community_id) {
          setSelected(json.assignment.community_id)
        }
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) {
      setError("Please pick a location to continue.")
      return
    }
    setSaving(true); setError("")

    try {
      const r = await fetch("/api/me/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_id: selected }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(json.error || `HTTP ${r.status}`)
        setSaving(false)
        return
      }

      // Mirror to localStorage so every page-level community selector
      // defaults to the assignment without an extra round-trip.
      const c = communities.find(x => x.id === selected)
      localStorage.setItem("asg-current-community-id",   selected)
      if (c) localStorage.setItem("asg-current-community-name", c.name)

      // Everyone lands on the Home page after confirming their post.
      // Home is open to all signed-in users; admin-only pages stay gated
      // separately. Previously non-admins were sent to /vms (Check-In) here,
      // which was the #13 routing bug.
      router.replace("/")
    } catch (err: any) {
      setError(err?.message || "Unexpected error")
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-[460px]">

        <div className="text-2xl font-bold text-blue-800 leading-tight text-center">
          American Security Group
        </div>
        <div className="text-[11px] text-gray-500 uppercase tracking-widest mt-1 mb-5 text-center">
          Integrated Property Solutions
        </div>

        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Confirm Your Post for This Shift
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Pick the location you're working at today. This becomes the default
          for all community selectors during your session.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Location
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={loading || saving}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
            >
              <option value="">— Select a location —</option>
              {communities.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || saving || !selected}
            className="py-3 bg-blue-800 hover:bg-blue-900 text-white font-bold rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : loading ? "Loading…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  )
}

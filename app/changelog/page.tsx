"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"

interface ChangelogEntry {
  id: string
  title: string
  blurb: string
  posted_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  })
}

function monthKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string) {
  const [y, m] = key.split("-")
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export default function ChangelogPage() {
  const router = useRouter()
  const [entries, setEntries]   = useState<ChangelogEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [authed,  setAuthed]    = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/login"); return }
      setAuthed(true)
      supabase
        .from("changelog")
        .select("id, title, blurb, posted_at")
        .eq("is_published", true)
        .order("posted_at", { ascending: false })
        .then(({ data }) => {
          setEntries(data || [])
          setLoading(false)
        })
    })
  }, [router])

  if (!authed) return null

  // Group by month
  const groups: { key: string; label: string; items: ChangelogEntry[] }[] = []
  for (const e of entries) {
    const key = monthKey(e.posted_at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.items.push(e)
    } else {
      groups.push({ key, label: monthLabel(key), items: [e] })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <Link href="/vms" className="text-sm text-blue-700 hover:text-blue-900 mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">📣 Latest Developments</h1>
          <p className="text-gray-500 text-sm mt-1">All updates to the ASG VMS platform, newest first.</p>
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm animate-pulse py-16 text-center">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="text-gray-400 text-sm py-16 text-center">No updates posted yet.</div>
        ) : (
          <div className="space-y-10">
            {groups.map(group => (
              <div key={group.key}>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 border-b border-gray-200 pb-2">
                  {group.label}
                </div>
                <div className="space-y-4">
                  {group.items.map((entry, i) => (
                    <div key={entry.id} className="flex gap-4">
                      {/* Timeline spine */}
                      <div className="flex flex-col items-center pt-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                        {i < group.items.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 mt-1" />
                        )}
                      </div>
                      {/* Entry */}
                      <div className="pb-6 flex-1">
                        <div className="text-[11px] text-gray-400 mb-1">{formatDate(entry.posted_at)}</div>
                        <div className="text-base font-semibold text-gray-900 mb-1">{entry.title}</div>
                        <div className="text-sm text-gray-600 leading-relaxed">{entry.blurb}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { ADMIN_EMAILS, checkIsGuest } from "@/lib/admin"
import type { RealtimeChannel } from "@supabase/supabase-js"

interface AlertRow {
  id:           string
  type:         string
  severity:     string
  community_id: string | null
  payload:      Record<string, unknown>
  recipients:   string[]
  triggered_by: string | null
  sent_at:      string
  status:       string
  ack_at:       string | null
  ack_by:       string | null
  ack_note:     string | null
  error:        string | null
}

interface DeniedRow {
  id:             string
  first_name:     string
  last_name:      string
  dob:            string | null
  community_name: string | null
  unit_number:    string | null
  resident_name:  string | null
  guard_email:    string | null
  reason:         string | null
  attempted_at:   string
}

const TYPE_LABEL: Record<string, string> = {
  watchlist_hit:          "🚨 Watchlist Hit",
  incident_high_priority: "⚠️ Incident",
  panic_sos:              "🆘 Panic / SOS",
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-700 text-white",
  high:     "bg-orange-700 text-white",
  medium:   "bg-yellow-700 text-white",
}

const CLEANUP_DAYS = 30

function normTs(ts: string): string {
  return ts.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + "Z"
}

function tsMs(ts: string | null): number {
  return ts ? new Date(normTs(ts)).getTime() : 0
}

function fmt(ts: string | null): string {
  if (!ts) return "—"
  return new Date(normTs(ts)).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
}

function playAlertSound(urgency: "critical" | "high" | "medium") {
  try {
    const ctx   = new AudioContext()
    const beeps = urgency === "critical" ? 3 : urgency === "high" ? 2 : 1
    const freq  = urgency === "critical" ? 960 : 720
    for (let i = 0; i < beeps; i++) {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = "sine"
      const t = ctx.currentTime + i * 0.32
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.35, t + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26)
      osc.start(t)
      osc.stop(t + 0.26)
    }
  } catch { /* AudioContext blocked until user gesture — silently ignore */ }
}

function fireNotification(a: AlertRow) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return
  const p = a.payload as Record<string, string>
  new Notification(TYPE_LABEL[a.type] || a.type, {
    body: [p?.Name, p?.Community].filter(Boolean).join(" · ") || a.severity,
    icon: "/asg-logo.gif",
  })
}

export default function AlertsPage() {
  const [alerts,      setAlerts]      = useState<AlertRow[]>([])
  const [denied,      setDenied]      = useState<DeniedRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState<"open" | "all" | "watchlist" | "incident" | "sos">("open")
  const [userEmail,   setUserEmail]   = useState("")
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [isGuest,     setIsGuest]     = useState(false)
  const [ackingId,    setAckingId]    = useState<string | null>(null)
  const [ackNote,     setAckNote]     = useState("")
  const [resending,   setResending]   = useState<string | null>(null)
  const [showChart,   setShowChart]   = useState(false)
  const [rtConnected, setRtConnected] = useState(false)
  const [notifOk,     setNotifOk]     = useState(false)

  const rtRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || "")
      setIsAdmin(ADMIN_EMAILS.includes(user?.email || ""))
    })
    checkIsGuest().then(setIsGuest).catch(() => setIsGuest(false))
    loadAll()

    if (typeof Notification !== "undefined") {
      if (Notification.permission === "default") {
        Notification.requestPermission().then(p => setNotifOk(p === "granted"))
      } else {
        setNotifOk(Notification.permission === "granted")
      }
    }

    const ch = supabase
      .channel("alerts-page-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, payload => {
        const a = payload.new as AlertRow
        setAlerts(prev => [a, ...prev])
        const urgency: "critical" | "high" | "medium" =
          a.type === "panic_sos" || a.severity === "critical" ? "critical"
          : a.severity === "high" ? "high" : "medium"
        playAlertSound(urgency)
        fireNotification(a)
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alerts" }, payload => {
        const a = payload.new as AlertRow
        setAlerts(prev => prev.map(r => r.id === a.id ? a : r))
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "denied_entries" }, payload => {
        setDenied(prev => [payload.new as DeniedRow, ...prev].slice(0, 50))
      })
      .subscribe(status => setRtConnected(status === "SUBSCRIBED"))

    rtRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [])

  const openCount = alerts.filter(a => !a.ack_at && a.status === "sent").length

  useEffect(() => {
    document.title = openCount > 0 ? `(${openCount}) Alerts` : "Alerts"
    return () => { document.title = "Alerts" }
  }, [openCount])

  async function loadAll() {
    setLoading(true)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: a }, { data: d }] = await Promise.all([
      supabase.from("alerts").select("*").order("sent_at", { ascending: false }).limit(200),
      supabase.from("denied_entries").select("*").gte("attempted_at", since)
        .order("attempted_at", { ascending: false }).limit(50),
    ])
    setAlerts((a as AlertRow[]) || [])
    setDenied((d as DeniedRow[]) || [])
    setLoading(false)
  }

  async function ack(a: AlertRow) {
    const { error } = await supabase.from("alerts").update({
      ack_at:   new Date().toISOString(),
      ack_by:   userEmail || null,
      ack_note: ackNote.trim() || null,
      status:   "acked",
    }).eq("id", a.id)
    if (error) { alert("Ack failed: " + error.message); return }
    setAckingId(null)
    setAckNote("")
  }

  async function ackAll() {
    const open = alerts.filter(a => !a.ack_at && a.status === "sent")
    if (!open.length) return
    if (!confirm(`Acknowledge all ${open.length} open alert${open.length === 1 ? "" : "s"}?`)) return
    const { error } = await supabase.from("alerts").update({
      ack_at: new Date().toISOString(), ack_by: userEmail || null, status: "acked",
    }).in("id", open.map(a => a.id))
    if (error) { alert("Ack all failed: " + error.message) }
  }

  async function renotify(a: AlertRow) {
    if (!confirm("Re-send Teams & email notification for this alert?")) return
    setResending(a.id)
    const res = await fetch("/api/alerts/resend", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ alertId: a.id }),
    })
    setResending(null)
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      alert("Re-notify failed: " + (err.error || res.status))
    }
  }

  async function deleteAlert(a: AlertRow) {
    if (!confirm("Delete this alert? This cannot be undone.")) return
    const { error } = await supabase.from("alerts").delete().eq("id", a.id)
    if (error) { alert("Delete failed: " + error.message); return }
    setAlerts(prev => prev.filter(r => r.id !== a.id))
  }

  const ackedOldCount = alerts.filter(
    a => a.ack_at && tsMs(a.sent_at) < Date.now() - CLEANUP_DAYS * 86400000,
  ).length

  async function deleteAckedOld() {
    if (!ackedOldCount) return
    if (!confirm(`Delete ${ackedOldCount} acknowledged alert${ackedOldCount === 1 ? "" : "s"} older than ${CLEANUP_DAYS} days? This cannot be undone.`)) return
    const cutoff = new Date(Date.now() - CLEANUP_DAYS * 86400000).toISOString()
    const { error } = await supabase.from("alerts").delete()
      .not("ack_at", "is", null).lt("sent_at", cutoff)
    if (error) { alert("Cleanup failed: " + error.message); return }
    loadAll()
  }

  const filtered = alerts.filter(a => {
    if (filter === "open")      return !a.ack_at && a.status === "sent"
    if (filter === "watchlist") return a.type === "watchlist_hit"
    if (filter === "incident")  return a.type === "incident_high_priority"
    if (filter === "sos")       return a.type === "panic_sos"
    return true
  })

  function exportCSV() {
    const headers = ["Date", "Type", "Severity", "Community", "Status", "Triggered By", "Acked By", "Ack Note", "Payload"]
    const lines = filtered.map(a => [
      fmt(a.sent_at),
      a.type,
      a.severity,
      String(a.payload?.Community || ""),
      a.status,
      a.triggered_by || "",
      a.ack_by        || "",
      a.ack_note      || "",
      JSON.stringify(a.payload),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    const csv  = [headers.join(","), ...lines].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const el   = document.createElement("a")
    el.href     = url
    el.download = `alerts-${new Date().toISOString().split("T")[0]}.csv`
    el.click()
    URL.revokeObjectURL(url)
  }

  const watchlistCt = alerts.filter(a => a.type === "watchlist_hit").length
  const incidentCt  = alerts.filter(a => a.type === "incident_high_priority").length
  const sosCt       = alerts.filter(a => a.type === "panic_sos").length

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🔔 Alerts & Notify</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-2 h-2 rounded-full ${rtConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            <span className="text-xs text-gray-500">
              {rtConnected ? "Live" : "Connecting…"}
              {" · "}
              {notifOk ? "Browser notifications on" : "Browser notifications off"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isGuest && isAdmin && openCount > 1 && (
            <button
              onClick={ackAll}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm rounded-md border-none cursor-pointer"
            >
              ✓ Ack All ({openCount})
            </button>
          )}
          {isAdmin && (
            <button
              onClick={deleteAckedOld}
              disabled={loading || ackedOldCount === 0}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-sm rounded-md border-none cursor-pointer disabled:opacity-40"
            >
              🗑 Clear old ({ackedOldCount})
            </button>
          )}
          <button
            onClick={() => setShowChart(s => !s)}
            className={`px-3 py-1.5 text-sm rounded-md border-none cursor-pointer transition-colors ${
              showChart ? "bg-blue-800 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📊 Chart
          </button>
          <button
            onClick={exportCSV}
            disabled={!filtered.length}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md border-none cursor-pointer disabled:opacity-40"
          >
            ⬇ CSV
          </button>
          <button
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-md border-none cursor-pointer disabled:opacity-50"
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Stat label="Open"        value={openCount}     accent="red" />
        <Stat label="Watchlist"   value={watchlistCt}   accent="orange" />
        <Stat label="Incidents"   value={incidentCt}    accent="yellow" />
        <Stat label="SOS"         value={sosCt}         accent="rose" />
        <Stat label="Denied (7d)" value={denied.length} accent="slate" />
      </div>

      {/* CHART */}
      {showChart && <AlertChart alerts={alerts} />}

      {/* FILTER TABS */}
      <div className="flex gap-1 mb-4 border-b border-gray-300 overflow-x-auto">
        {([
          ["open",      "Open"],
          ["all",       "All"],
          ["watchlist", "Watchlist"],
          ["incident",  "Incidents"],
          ["sos",       "SOS"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-2 text-sm font-medium border-none cursor-pointer rounded-t-md transition-colors ${
              filter === k ? "bg-blue-800 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ALERTS LIST */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
          Alerts ({filtered.length})
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            {filter === "open" ? "No open alerts. All clear." : "No alerts in this view."}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map(a => (
              <li
                key={a.id}
                className={`p-4 flex flex-col gap-2 hover:bg-gray-50 ${
                  !a.ack_at && a.status === "sent"
                    ? "border-l-4 border-l-red-500"
                    : "border-l-4 border-l-transparent"
                }`}
              >
                {/* Top row */}
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${SEVERITY_BADGE[a.severity] || "bg-gray-700 text-white"}`}>
                      {a.severity}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {TYPE_LABEL[a.type] || a.type}
                    </span>
                    {!!a.payload?.Community && (
                      <span className="text-sm text-gray-600">📍 {String(a.payload.Community)}</span>
                    )}
                    {!a.ack_at && a.status === "sent" && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-100 text-red-800 animate-pulse">Open</span>
                    )}
                    {a.ack_at && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-green-100 text-green-800">Acked</span>
                    )}
                    {a.status === "failed" && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">Send Failed</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 shrink-0">{fmt(a.sent_at)}</div>
                </div>

                {/* Type-specific payload */}
                <AlertPayload alert={a} />

                {/* Footer row */}
                <div className="flex items-center justify-between gap-2 text-xs text-gray-500 flex-wrap">
                  <div className="space-y-0.5">
                    <div>
                      Triggered by <span className="font-semibold text-gray-700">{a.triggered_by || "—"}</span>
                    </div>
                    {a.ack_at && (
                      <div>
                        Acked by <span className="font-semibold text-gray-700">{a.ack_by || "—"}</span>
                        {" "}at <span className="font-mono">{fmt(a.ack_at)}</span>
                        {a.ack_note && <span className="ml-1 italic text-gray-600">· &ldquo;{a.ack_note}&rdquo;</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Acknowledge (with optional note) */}
                    {!isGuest && !a.ack_at && a.status === "sent" && (
                      ackingId === a.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={ackNote}
                            onChange={e => setAckNote(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter")  ack(a)
                              if (e.key === "Escape") { setAckingId(null); setAckNote("") }
                            }}
                            placeholder="Note (optional)…"
                            className="px-2 py-1 text-xs border border-gray-300 rounded w-40 focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                          <button
                            onClick={() => ack(a)}
                            className="px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded border-none cursor-pointer"
                          >
                            ✓ Confirm
                          </button>
                          <button
                            onClick={() => { setAckingId(null); setAckNote("") }}
                            className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded border-none cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAckingId(a.id)}
                          className="px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded border-none cursor-pointer"
                        >
                          ✓ Acknowledge
                        </button>
                      )
                    )}
                    {/* Re-notify (admin only) */}
                    {isAdmin && (
                      <button
                        onClick={() => renotify(a)}
                        disabled={resending === a.id}
                        title="Re-send Teams & email notification"
                        className="px-3 py-1 bg-gray-100 hover:bg-blue-600 hover:text-white text-gray-700 text-xs font-semibold rounded border-none cursor-pointer disabled:opacity-40"
                      >
                        {resending === a.id ? "Sending…" : "↺ Re-notify"}
                      </button>
                    )}
                    {/* Delete (admin only) */}
                    {isAdmin && (
                      <button
                        onClick={() => deleteAlert(a)}
                        className="px-3 py-1 bg-gray-200 hover:bg-red-600 hover:text-white text-gray-700 text-xs font-semibold rounded border-none cursor-pointer"
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </div>

                {a.error && (
                  <div className="text-xs bg-red-50 text-red-800 border border-red-200 rounded px-2 py-1">
                    Error: {a.error}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* DENIED ENTRIES */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
          Denied Entries — Past 7 Days ({denied.length})
        </div>
        {denied.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No denied entries.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Visitor</th>
                  <th className="px-4 py-2 text-left">DOB</th>
                  <th className="px-4 py-2 text-left">Location</th>
                  <th className="px-4 py-2 text-left">Unit</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                  <th className="px-4 py-2 text-left">Guard</th>
                </tr>
              </thead>
              <tbody>
                {denied.map(d => (
                  <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{fmt(d.attempted_at)}</td>
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/vms/intel?q=${encodeURIComponent(d.first_name + " " + d.last_name)}`}
                        className="text-blue-700 hover:underline"
                      >
                        {d.first_name} {d.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{d.dob || "—"}</td>
                    <td className="px-4 py-2 text-gray-700">{d.community_name || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{d.unit_number || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{d.reason || "—"}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{d.guard_email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}

// ---------- Sub-components ----------

function AlertChart({ alerts }: { alerts: AlertRow[] }) {
  const BAR_H = 80

  // Build 14-day UTC-consistent day labels
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - (13 - i))
    return d.toISOString().split("T")[0]
  })

  const data = days.map(day => {
    const da  = alerts.filter(a => new Date(normTs(a.sent_at)).toISOString().startsWith(day))
    const w   = da.filter(a => a.type === "watchlist_hit").length
    const inc = da.filter(a => a.type === "incident_high_priority").length
    const s   = da.filter(a => a.type === "panic_sos").length
    const label = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    return { day, label, watchlist: w, incident: inc, sos: s, total: w + inc + s }
  })

  const max = Math.max(1, ...data.map(d => d.total))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
        Alert Volume — Last 14 Days
      </div>
      <div className="flex items-end gap-1">
        {data.map(d => {
          // Each segment height in px, proportional to max total
          const wh  = Math.round((d.watchlist / max) * BAR_H)
          const ih  = Math.round((d.incident  / max) * BAR_H)
          const sh  = Math.round((d.sos       / max) * BAR_H)
          const [mo, dy] = d.label.split(" ")

          return (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* Bar */}
              <div className="w-full relative bg-gray-100 rounded-sm" style={{ height: BAR_H }}>
                {d.total > 0 && (
                  <>
                    {wh > 0 && (
                      <div
                        className="absolute left-0 right-0 bg-orange-400"
                        style={{ bottom: 0, height: wh }}
                      />
                    )}
                    {ih > 0 && (
                      <div
                        className="absolute left-0 right-0 bg-yellow-400"
                        style={{ bottom: wh, height: ih }}
                      />
                    )}
                    {sh > 0 && (
                      <div
                        className="absolute left-0 right-0 bg-rose-500"
                        style={{ bottom: wh + ih, height: sh }}
                      />
                    )}
                  </>
                )}
              </div>
              {/* Day label */}
              <div className="text-[8px] text-gray-400 text-center leading-none">
                {dy}<br />{mo}
              </div>
              {/* Hover tooltip */}
              {d.total > 0 && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 leading-relaxed">
                  <div className="font-semibold">{d.total} alert{d.total !== 1 ? "s" : ""}</div>
                  {d.watchlist > 0 && <div>🚨 {d.watchlist} watchlist</div>}
                  {d.incident  > 0 && <div>⚠️ {d.incident} incident</div>}
                  {d.sos       > 0 && <div>🆘 {d.sos} SOS</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-3 text-[10px] text-gray-500">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-orange-400 mr-1 align-middle" />Watchlist</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-yellow-400 mr-1 align-middle" />Incident</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-rose-500   mr-1 align-middle" />SOS</span>
      </div>
    </div>
  )
}

function AlertPayload({ alert: a }: { alert: AlertRow }) {
  const p = a.payload as Record<string, string>

  if (a.type === "watchlist_hit") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {p.Name     && <PField label="Name"     value={p.Name}     bold />}
        {p.DOB      && <PField label="DOB"      value={p.DOB} />}
        {p.Reason   && <PField label="Reason"   value={p.Reason} />}
        {p.Match    && <PField label="Match"    value={p.Match} />}
        {p.Unit     && <PField label="Unit"     value={p.Unit} />}
        {p.Resident && <PField label="Resident" value={p.Resident} />}
      </div>
    )
  }

  if (a.type === "incident_high_priority") {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {p["Report Type"] && <PField label="Type"    value={p["Report Type"]} bold />}
        {p.Unit           && <PField label="Unit"    value={p.Unit} />}
        {p.Officer        && <PField label="Officer" value={p.Officer} />}
        {p.Narrative      && (
          <div className="sm:col-span-2 text-gray-700">
            <span className="text-gray-500 font-medium">Narrative: </span>{p.Narrative}
          </div>
        )}
      </div>
    )
  }

  if (a.type === "panic_sos") {
    return (
      <div className="bg-rose-50 border border-rose-300 rounded-lg px-3 py-2 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {p.Officer  && <PField label="Officer"  value={p.Officer}  bold />}
        {p.Location && <PField label="Location" value={p.Location} />}
        {p.Message  && (
          <div className="sm:col-span-2 text-gray-700">
            <span className="text-gray-500 font-medium">Message: </span>{p.Message}
          </div>
        )}
      </div>
    )
  }

  // Fallback: generic key/value grid
  const entries = Object.entries(p)
    .filter(([k, v]) => k !== "Community" && v !== undefined && v !== null && v !== "")
    .slice(0, 8)
  if (!entries.length) return null
  return (
    <div className="text-sm text-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
      {entries.map(([k, v]) => <PField key={k} label={k} value={String(v)} />)}
    </div>
  )
}

function PField({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <span className="text-gray-500 font-medium">{label}:</span>{" "}
      <span className={bold ? "font-semibold text-gray-900" : ""}>{value}</span>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors: Record<string, string> = {
    red:    "border-red-300 bg-red-50 text-red-700",
    orange: "border-orange-300 bg-orange-50 text-orange-700",
    yellow: "border-yellow-300 bg-yellow-50 text-yellow-700",
    rose:   "border-rose-300 bg-rose-50 text-rose-700",
    slate:  "border-slate-300 bg-slate-50 text-slate-700",
  }
  return (
    <div className={`border rounded-xl px-4 py-3 ${colors[accent]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  )
}

"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"

interface AlertRow {
  id:           string
  type:         string
  severity:     string
  community_id: string | null
  payload:      Record<string, any>
  recipients:   string[]
  triggered_by: string | null
  sent_at:      string
  status:       string
  ack_at:       string | null
  ack_by:       string | null
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

function fmt(ts: string | null): string {
  if (!ts) return "—"
  const t = ts.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + "Z"
  return new Date(t).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  })
}

export default function AlertsPage() {

  const [alerts,  setAlerts]  = useState<AlertRow[]>([])
  const [denied,  setDenied]  = useState<DeniedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<"open" | "all" | "watchlist" | "incident" | "sos">("open")
  const [userEmail, setUserEmail] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || "")
    })
    loadAll()
    const t = setInterval(loadAll, 30000)
    return () => clearInterval(t)
  }, [])

  async function loadAll() {
    setLoading(true)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: a }, { data: d }] = await Promise.all([
      supabase.from("alerts").select("*").gte("sent_at", since)
        .order("sent_at", { ascending: false }).limit(200),
      supabase.from("denied_entries").select("*").gte("attempted_at", since)
        .order("attempted_at", { ascending: false }).limit(50),
    ])
    setAlerts((a as AlertRow[]) || [])
    setDenied((d as DeniedRow[]) || [])
    setLoading(false)
  }

  async function ack(a: AlertRow) {
    const { error } = await supabase.from("alerts").update({
      ack_at: new Date().toISOString(),
      ack_by: userEmail || null,
      status: "acked",
    }).eq("id", a.id)
    if (error) { alert("Ack failed: " + error.message); return }
    loadAll()
  }

  const filtered = alerts.filter(a => {
    if (filter === "open")      return !a.ack_at && a.status === "sent"
    if (filter === "watchlist") return a.type === "watchlist_hit"
    if (filter === "incident")  return a.type === "incident_high_priority"
    if (filter === "sos")       return a.type === "panic_sos"
    return true
  })

  const openCount    = alerts.filter(a => !a.ack_at && a.status === "sent").length
  const watchlistCt  = alerts.filter(a => a.type === "watchlist_hit").length
  const incidentCt   = alerts.filter(a => a.type === "incident_high_priority").length
  const sosCt        = alerts.filter(a => a.type === "panic_sos").length

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">🔔 Alerts & Notify</h1>
        <button
          onClick={loadAll}
          disabled={loading}
          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-md border-none cursor-pointer disabled:opacity-50"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Open"        value={openCount}       accent="red" />
        <Stat label="Watchlist"   value={watchlistCt}     accent="orange" />
        <Stat label="Incidents"   value={incidentCt}      accent="yellow" />
        <Stat label="SOS"         value={sosCt}           accent="rose" />
        <Stat label="Denied (7d)" value={denied.length}   accent="slate" />
      </div>

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
              filter === k
                ? "bg-blue-800 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
              <li key={a.id} className="p-4 flex flex-col gap-2 hover:bg-gray-50">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${SEVERITY_BADGE[a.severity] || "bg-gray-700 text-white"}`}>
                      {a.severity}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {TYPE_LABEL[a.type] || a.type}
                    </span>
                    {a.payload?.Community && (
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

                <div className="text-sm text-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  {Object.entries(a.payload || {})
                    .filter(([k, v]) => k !== "Community" && v !== undefined && v !== null && v !== "")
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <div key={k}>
                        <span className="text-gray-500 font-medium">{k}:</span> <span>{String(v)}</span>
                      </div>
                    ))
                  }
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-gray-500 flex-wrap">
                  <div>
                    Triggered by <span className="font-semibold text-gray-700">{a.triggered_by || "—"}</span>
                    {a.ack_at && (
                      <> · acked by <span className="font-semibold text-gray-700">{a.ack_by || "—"}</span> at <span className="font-mono">{fmt(a.ack_at)}</span></>
                    )}
                  </div>
                  {!a.ack_at && a.status === "sent" && (
                    <button
                      onClick={() => ack(a)}
                      className="px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded border-none cursor-pointer"
                    >
                      ✓ Acknowledge
                    </button>
                  )}
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
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Visitor</th>
                <th className="px-4 py-2 text-left">DOB</th>
                <th className="px-4 py-2 text-left">Community</th>
                <th className="px-4 py-2 text-left">Unit</th>
                <th className="px-4 py-2 text-left">Reason</th>
                <th className="px-4 py-2 text-left">Guard</th>
              </tr>
            </thead>
            <tbody>
              {denied.map(d => (
                <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{fmt(d.attempted_at)}</td>
                  <td className="px-4 py-2 font-semibold">{d.first_name} {d.last_name}</td>
                  <td className="px-4 py-2 text-gray-600">{d.dob || "—"}</td>
                  <td className="px-4 py-2 text-gray-700">{d.community_name || "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{d.unit_number || "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{d.reason || "—"}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{d.guard_email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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

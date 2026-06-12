"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Community } from "@/lib/types"
import { PostOrders, loadPostOrders, formatLastUpdated } from "@/lib/postOrders"

// When `communityId` is passed, the component is "controlled" — it uses that
// id and hides its own location selector (the Property Hub provides a shared
// one). With no prop it keeps its original standalone behavior.
export default function PostOrdersTab({ communityId: controlledId }: { communityId?: string } = {}) {

  const controlled = controlledId !== undefined

  const [communities,     setCommunities]     = useState<Community[]>([])
  const [internalId,      setInternalId]      = useState("")
  const communityId = controlled ? (controlledId || "") : internalId
  const [orders,          setOrders]          = useState<PostOrders | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [expandedSection, setExpandedSection] = useState<string | null>("Gate Operations")
  const [expandedExample, setExpandedExample] = useState<string | null>(null)
  const [copiedTitle,     setCopiedTitle]     = useState<string | null>(null)

  useEffect(() => {
    if (controlled) {
      if (controlledId) { void loadOrders(controlledId) }
      else { setOrders(null); setLoading(false) }
    } else {
      initCommunities()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledId])

  async function initCommunities() {
    const { data } = await supabase.from("communities").select("id, name").order("name")
    if (!data) { setLoading(false); return }
    setCommunities(data)
    const saved = typeof window !== "undefined"
      ? localStorage.getItem("asg-current-community-id") || ""
      : ""
    const initial = data.find(c => c.id === saved) || data[0]
    if (initial) {
      setInternalId(initial.id)
      void loadOrders(initial.id)
    } else {
      setLoading(false)
    }
  }

  async function loadOrders(id: string) {
    setLoading(true)
    const result = await loadPostOrders(id)
    setOrders(result)
    setLoading(false)
  }

  function selectCommunity(id: string) {
    setInternalId(id)
    if (typeof window !== "undefined") {
      const c = communities.find(x => x.id === id)
      localStorage.setItem("asg-current-community-id", id)
      if (c) localStorage.setItem("asg-current-community-name", c.name)
    }
    void loadOrders(id)
  }

  function copyTemplate(title: string, body: string) {
    navigator.clipboard.writeText(body).then(() => {
      setCopiedTitle(title)
      setTimeout(() => setCopiedTitle(null), 1500)
    }).catch(() => {})
  }

  const communityName = communities.find(c => c.id === communityId)?.name || ""
  const inputCls = "px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"

  return (
    <div className="py-4">

      {/* Location selector (standalone only) + last-updated pill */}
      {(!controlled || orders) && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {!controlled && (
            <>
              <label className="text-sm font-semibold text-gray-700">Location:</label>
              <select value={communityId} onChange={e => selectCommunity(e.target.value)} className={inputCls}>
                {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          )}
          {orders && (
            <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              Last updated: {formatLastUpdated(orders.lastUpdated)}
            </span>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          Loading post orders…
        </div>
      )}

      {/* Empty state */}
      {!loading && !orders && communityName && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No post orders configured for <span className="font-semibold text-gray-700">{communityName}</span>.
        </div>
      )}

      {!loading && orders && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* LEFT: Procedures + POCs */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Post Procedures</h3>
            <div className="flex flex-col gap-2">
              {orders.procedures.map(proc => (
                <div key={proc.title} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedSection(expandedSection === proc.title ? null : proc.title)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-none cursor-pointer ${
                      expandedSection === proc.title ? "bg-blue-50 border-b border-blue-200" : "bg-white"
                    }`}
                  >
                    <span className="text-lg">{proc.icon}</span>
                    <span className="font-semibold text-sm text-blue-800 flex-1">{proc.title}</span>
                    <span className="text-xs text-gray-500">{expandedSection === proc.title ? "▲" : "▼"}</span>
                  </button>
                  {expandedSection === proc.title && (
                    <ul className="m-0 px-8 py-3 bg-white list-disc">
                      {proc.items.map((item, i) => (
                        <li key={i} className="text-[13px] text-gray-700 mb-2 leading-relaxed">{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-6 mb-3">Points of Contact</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">Role</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">Name</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.contacts.map((c, i) => (
                    <tr key={i} className={i < orders.contacts.length - 1 ? "border-b border-gray-100" : ""}>
                      <td className="px-3 py-2 text-gray-700">{c.role}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
                      <td className="px-3 py-2 text-blue-600 text-xs">{c.contact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: Report Examples + Notice */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Sample Report Templates</h3>
            <div className="flex flex-col gap-2">
              {orders.reportExamples.map(ex => (
                <div key={ex.title} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedExample(expandedExample === ex.title ? null : ex.title)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-none cursor-pointer ${
                      expandedExample === ex.title ? "bg-green-50 border-b border-green-200" : "bg-white"
                    }`}
                  >
                    <span>📄</span>
                    <span className="font-semibold text-sm text-green-800 flex-1">{ex.title}</span>
                    <span className="text-xs text-gray-500">{expandedExample === ex.title ? "▲" : "▼"}</span>
                  </button>
                  {expandedExample === ex.title && (
                    <div className="px-4 py-3 bg-white">
                      <pre className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-[inherit] m-0 bg-gray-50 p-3 rounded-md border border-gray-200">
                        {ex.body}
                      </pre>
                      <button
                        onClick={() => copyTemplate(ex.title, ex.body)}
                        className="mt-2 text-xs text-blue-600 bg-white border border-blue-200 rounded px-2.5 py-1 cursor-pointer hover:bg-blue-50"
                      >
                        {copiedTitle === ex.title ? "✓ Copied!" : "Copy Template"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
              <strong>⚠️ Note:</strong> All bracketed fields <strong>[LIKE THIS]</strong> must be completed before submitting any report. Never submit a report with placeholder text.
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

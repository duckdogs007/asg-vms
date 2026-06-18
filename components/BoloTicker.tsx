"use client"

// Active-BOLO ticker for the Visitor Check-In page (#20). Sits directly above
// the Henrico CAD ticker (which is fixed at bottom: 0, height 32px), so this one
// is pinned at bottom: 32px. Scrolls active BOLOs, scoped to the checked-in
// community (plus global BOLOs with no community). Hidden when there are none.
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"

export default function BoloTicker({ communityId }: { communityId?: string }) {
  const [bolos, setBolos] = useState<any[]>([])

  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabase
        .from("bolos")
        .select("id, name, vehicle, plate, plate_state, reason, community_id, active")
        .eq("active", true)
        .order("created_at", { ascending: false })
      if (!active) return
      // Show BOLOs for this community plus location-agnostic ones (null community).
      setBolos((data || []).filter(b => !communityId || !b.community_id || b.community_id === communityId))
    }
    load()
    const channel = supabase
      .channel("bolo-ticker")
      .on("postgres_changes", { event: "*", schema: "public", table: "bolos" }, load)
      .subscribe()
    const interval = setInterval(load, 120 * 1000) // safety re-poll every 2m
    return () => { active = false; supabase.removeChannel(channel); clearInterval(interval) }
  }, [communityId])

  if (!bolos.length) return null

  const tickerText = bolos.map(b => {
    const plate = b.plate ? `${b.plate}${b.plate_state ? ` (${b.plate_state})` : ""}` : ""
    return `🚨 ${[b.name, b.vehicle, plate, b.reason].filter(Boolean).join(" — ")}`
  }).join("     ·     ")

  return (
    <div className="fixed left-0 right-0 z-50 bg-gray-950 border-t-2 border-red-700 flex items-stretch overflow-hidden"
      style={{ height: "32px", bottom: "32px" }}>

      {/* LABEL */}
      <div className="flex items-center bg-red-700 px-3 flex-shrink-0">
        <span className="text-white text-xs font-bold tracking-widest uppercase">Active BOLO</span>
      </div>

      {/* COUNT */}
      <div className="flex items-center px-2 bg-gray-900 flex-shrink-0 border-r border-gray-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-1.5" />
        <span className="text-red-400 text-[10px] font-mono">{bolos.length}</span>
      </div>

      {/* SCROLLING TEXT */}
      <div className="flex-1 overflow-hidden flex items-center">
        <span
          className="ticker-scroll text-xs font-mono text-amber-300"
          style={{ animationDuration: `${Math.max(30, tickerText.length * 0.12)}s` }}
        >
          {tickerText}
        </span>
      </div>
    </div>
  )
}

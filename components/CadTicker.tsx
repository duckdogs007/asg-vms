"use client"

import { useState, useEffect } from "react"

interface FeedItem {
  title: string
  description: string
  pubDate: string
}

export default function CadTicker() {
  const [items,   setItems]   = useState<FeedItem[]>([])
  const [error,   setError]   = useState("")
  const [updated, setUpdated] = useState("")

  useEffect(() => {
    fetchFeed()
    const interval = setInterval(fetchFeed, 90 * 1000) // refresh every 90s
    return () => clearInterval(interval)
  }, [])

  async function fetchFeed() {
    try {
      const res  = await fetch("/api/rss")
      const data = await res.json()
      if (data.items?.length) {
        setItems(data.items)
        setError("")
      } else if (data.error) {
        setError(data.error)
      }
      if (data.updated) setUpdated(data.updated)
    } catch {
      setError("Feed unavailable")
    }
  }

  if (!items.length && !error) return null

  const tickerText = error
    ? `⚠ Henrico CAD feed unavailable`
    : items.map(item => {
        const parts = [item.title, item.description].filter(Boolean)
        return `🚔 ${parts.join(" — ")}`
      }).join("     ·     ")

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 border-t-2 border-blue-800 flex items-stretch overflow-hidden" style={{ height: "32px" }}>

      {/* LABEL */}
      <div className="flex items-center bg-blue-800 px-3 flex-shrink-0">
        <span className="text-white text-xs font-bold tracking-widest uppercase">Henrico CAD</span>
      </div>

      {/* LIVE DOT */}
      <div className="flex items-center px-2 bg-gray-900 flex-shrink-0 border-r border-gray-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1.5" />
        <span className="text-green-400 text-[10px] font-mono">LIVE</span>
      </div>

      {/* SCROLLING TEXT */}
      <div className="flex-1 overflow-hidden flex items-center">
        <span
          className="ticker-scroll text-xs font-mono text-green-300"
          style={{ animationDuration: `${Math.max(30, tickerText.length * 0.12)}s` }}
        >
          {tickerText}
        </span>
      </div>

      {/* TIMESTAMP */}
      {updated && (
        <div className="flex items-center px-3 flex-shrink-0 text-[10px] text-gray-600 font-mono border-l border-gray-800">
          {new Date(updated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </div>
      )}

    </div>
  )
}

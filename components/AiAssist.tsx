"use client"

import { useState } from "react"

// Reusable AI narrative-assist toolbar (item 28). Drop it above any free-text
// report field: it sends the current text (+ optional context fields) to
// /api/ai/narrative and replaces the field with the cleaned write-up. The officer
// reviews/edits before submitting. Manages its own busy/error state.
export default function AiAssist({
  kind,
  value,
  onChange,
  fields,
  className = "",
}: {
  kind: string
  value: string
  onChange: (text: string) => void
  fields?: Record<string, any>
  className?: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr]   = useState("")

  async function run(mode: "draft" | "tighten" | "formal") {
    if (!value.trim()) { setErr("Add some notes first."); return }
    setBusy(mode); setErr("")
    try {
      const res = await fetch("/api/ai/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, mode, notes: value, fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      if (data.text) onChange(data.text)
    } catch (e: any) {
      setErr(e?.message || "AI assist failed.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={() => run("draft")} disabled={!!busy}
          title="Turn your notes into a full write-up"
          className="px-2.5 py-1 bg-violet-700 text-white text-xs font-semibold rounded-md hover:bg-violet-800 border-none cursor-pointer disabled:opacity-50">
          {busy === "draft" ? "✨ Writing…" : "✨ AI Draft"}
        </button>
        <button type="button" onClick={() => run("tighten")} disabled={!!busy}
          className="px-2.5 py-1 bg-violet-100 text-violet-800 text-xs font-semibold rounded-md hover:bg-violet-200 border-none cursor-pointer disabled:opacity-50">
          {busy === "tighten" ? "…" : "Tighten"}
        </button>
        <button type="button" onClick={() => run("formal")} disabled={!!busy}
          className="px-2.5 py-1 bg-violet-100 text-violet-800 text-xs font-semibold rounded-md hover:bg-violet-200 border-none cursor-pointer disabled:opacity-50">
          {busy === "formal" ? "…" : "More formal"}
        </button>
      </div>
      {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
    </div>
  )
}

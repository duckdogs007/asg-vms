import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// POST /api/ai/summary
// Generates a short "Summary — Highlights / Followup" for a security report.
// Reads the report's narrative + structured fields and surfaces concerns,
// follow-up items, and supervisor awareness flags — not a general recap.
// Uses the same Gemini pattern as /api/ai/narrative.
export const runtime = "nodejs"

type Body = {
  kind?:      string
  fields?:    Record<string, any>
  narrative?: string
}

const KIND_LABEL: Record<string, string> = {
  incident:    "security incident report",
  daily:       "daily activity / patrol log",
  contact:     "field-contact report",
  vehicle_fi:  "vehicle field-interview report",
  parking:     "parking-violation report",
  maintenance: "property maintenance report",
}

export async function POST(req: Request) {
  let input: Body
  try { input = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured — set GEMINI_API_KEY in the environment." },
      { status: 503 },
    )
  }

  const narrative = String(input.narrative || "").slice(0, 6000).trim()
  const f         = input.fields || {}
  const details   = Object.entries(f)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v).trim()}`)
    .join("\n") || ""

  if (!narrative && !details) {
    return NextResponse.json({ error: "Not enough report content to summarize." }, { status: 400 })
  }

  const kindLabel = (input.kind && KIND_LABEL[input.kind]) || "security report"

  const prompt = `You are reviewing a ${kindLabel} written by a security officer. Your task is to identify ONLY the items that need attention — do NOT summarize or recap the report.

Structured fields:
${details || "(none)"}

Narrative:
${narrative || "(none)"}

Produce a "Summary — Highlights / Followup" consisting of 1–4 concise bullet points. Include ONLY:
- Unresolved issues or open situations
- Safety concerns or threats
- Required follow-up actions (notify someone, file a referral, revisit a unit, etc.)
- Items a supervisor should be aware of (patterns, escalations, significant events)
- Anything marked "No" in checklist items that requires explanation

If the report has no concerns or follow-up items, output exactly: No concerns or follow-up items noted.

Output ONLY the bullets (or the single "no concerns" line) — no heading, no preamble, no extra commentary. Each bullet starts with "• ".`

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash"
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
      }),
    })

    const data: any = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = data?.error?.message || `AI request failed (${res.status}).`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const blocked = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason === "SAFETY"
    if (blocked) return NextResponse.json({ error: "AI declined to process this content." }, { status: 422 })

    const text: string = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text || "")
      .join("")
      .trim()
    if (!text) return NextResponse.json({ error: "Model returned an empty response." }, { status: 502 })
    return NextResponse.json({ summary: text })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI request failed." }, { status: 502 })
  }
}

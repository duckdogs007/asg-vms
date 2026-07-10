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

  // gemini-flash-latest is Google's rolling alias for the current Flash model —
  // resilient to version deprecations. Override with GEMINI_MODEL if needed.
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest"
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const generationConfig: any = { temperature: 0.2, maxOutputTokens: 400 }
  // Flash "thinking" models (2.5 / *-latest) spend the token budget on hidden
  // reasoning; disable it so a short answer isn't truncated to empty.
  if (/2\.5|latest/i.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 }

  try {
    // Retry transient "model overloaded / high demand" (503 UNAVAILABLE) a few
    // times with backoff — these spikes are usually momentary.
    let res!: Response, data: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig,
        }),
      })
      data = await res.json().catch(() => null)
      const overloaded = res.status === 503 || data?.error?.status === "UNAVAILABLE" || /overloaded|high demand/i.test(data?.error?.message || "")
      if (!overloaded || attempt === 2) break
      await new Promise(r => setTimeout(r, 900 * (attempt + 1)))
    }

    if (!res.ok) {
      console.error("[ai/summary] gemini error", { model, status: res.status, code: data?.error?.status, message: data?.error?.message })
      const isQuota = res.status === 429 || data?.error?.status === "RESOURCE_EXHAUSTED"
      const isOverloaded = res.status === 503 || data?.error?.status === "UNAVAILABLE" || /overloaded|high demand/i.test(data?.error?.message || "")
      if (isQuota || isOverloaded) {
        const retryDelayStr: string | undefined = data?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"))?.retryDelay
        const retryMatch = (data?.error?.message as string | undefined)?.match(/retry in ([\d.]+)/i)
        const retrySeconds = retryDelayStr ? Math.ceil(parseFloat(retryDelayStr))
          : retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null
        const retryMsg = retrySeconds ? ` Try again in ~${retrySeconds}s.` : " Try again in a moment."
        const reason = isOverloaded ? "is busy right now (high demand)" : "is temporarily unavailable (quota exceeded)"
        return NextResponse.json({ error: `AI summary ${reason}.${retryMsg}` }, { status: 429 })
      }
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

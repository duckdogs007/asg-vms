import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// POST /api/ai/narrative
// AI assist for report narratives (item 28). Auth-required. Takes a report's
// rough notes / current draft (+ optional structured context fields) and returns
// a cleaned, professional write-up. Works for any report type via `kind`.
//
// Uses Google Gemini (free tier) via the REST API — no SDK dependency. Set
// GEMINI_API_KEY in the environment (free key from https://aistudio.google.com).
// GEMINI_MODEL optionally overrides the model (default gemini-flash-latest).
// The model receives report PII (names, locations) — mind that when reviewing.
export const runtime = "nodejs"

type Body = {
  kind?: string
  mode?: "draft" | "tighten" | "expand" | "formal"
  notes?: string
  fields?: Record<string, any>
}

const MODE_TASK: Record<string, string> = {
  draft:   "Turn the officer's rough notes below into a complete, well-organized write-up.",
  tighten: "Tighten and condense the text below — remove redundancy and filler while keeping every fact.",
  expand:  "Expand the text below into a fuller account, adding clarity and structure. Do NOT invent facts not present in the notes or fields.",
  formal:  "Rewrite the text below in a more formal, professional tone.",
}

// How the model is told to frame each report type.
const KIND_FRAMING: Record<string, string> = {
  incident:   "the narrative section of a security incident report",
  daily:      "the narrative for a security officer's daily activity / patrol log",
  contact:    "a field-contact / subject-interview report written by a security officer",
  vehicle_fi: "a vehicle field-interview report written by a security officer",
  parking:    "the notes for a parking-violation report",
  passdown:   "shift passdown notes for the next officer — what happened this shift, ongoing situations, and items needing follow-up",
  violation:  "the description of a lease violation",
}

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

export async function POST(req: Request) {
  let input: Body
  try { input = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  // Auth — must be a signed-in user.
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI assist isn't configured yet — set GEMINI_API_KEY in the environment." },
      { status: 503 },
    )
  }

  const mode = input.mode && MODE_TASK[input.mode] ? input.mode : "draft"
  const framing = (input.kind && KIND_FRAMING[input.kind]) || "a professional security report"
  const notes = String(input.notes || "").slice(0, 8000)
  if (!notes.trim()) return NextResponse.json({ error: "Nothing to work with — add some notes first." }, { status: 400 })

  const f = input.fields || {}
  const details = Object.entries(f)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${humanize(k)}: ${String(v).trim()}`)
    .join("\n") || "(no structured details provided)"

  const system =
    `You help a licensed security officer write ${framing}. ` +
    "Write in clear, professional, factual third person, past tense. Use only the facts given in the " +
    "structured details and the officer's notes — never invent names, times, outcomes, or events. " +
    "Do not add legal conclusions or opinions. Keep it concise and readable. " +
    "Output ONLY the finished text — no preamble, headings, labels, bullet points, or commentary."

  const prompt =
    `${system}\n\n` +
    `Structured details:\n${details}\n\n` +
    `Officer's notes / current draft:\n${notes}\n\n` +
    `Task: ${MODE_TASK[mode]}`

  // gemini-flash-latest is Google's rolling alias for the current Flash model.
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const generationConfig: any = { temperature: 0.4, maxOutputTokens: 1500 }
  if (/2\.5|latest/i.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 }

  try {
    // Retry transient "model overloaded / high demand" (503 UNAVAILABLE) with backoff.
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
      console.error("[ai/narrative] gemini error", { model, status: res.status, code: data?.error?.status, message: data?.error?.message })
      const isQuota = res.status === 429 || data?.error?.status === "RESOURCE_EXHAUSTED"
      const isOverloaded = res.status === 503 || data?.error?.status === "UNAVAILABLE" || /overloaded|high demand/i.test(data?.error?.message || "")
      if (isQuota || isOverloaded) {
        const retryDelayStr: string | undefined = data?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"))?.retryDelay
        const retryMatch = (data?.error?.message as string | undefined)?.match(/retry in ([\d.]+)/i)
        const retrySeconds = retryDelayStr ? Math.ceil(parseFloat(retryDelayStr))
          : retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null
        const retryMsg = retrySeconds ? ` Try again in ~${retrySeconds}s.` : " Try again in a moment."
        const reason = isOverloaded ? "is busy right now (high demand)" : "is temporarily unavailable (quota exceeded)"
        return NextResponse.json({ error: `AI assist ${reason}.${retryMsg}` }, { status: 429 })
      }
      const msg = data?.error?.message || `AI request failed (${res.status}).`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const blocked = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason === "SAFETY"
    if (blocked) {
      return NextResponse.json({ error: "The AI declined to process this content. Edit the notes and try again." }, { status: 422 })
    }

    const text: string = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text || "")
      .join("")
      .trim()
    if (!text) return NextResponse.json({ error: "The model returned an empty response." }, { status: 502 })
    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI request failed." }, { status: 502 })
  }
}

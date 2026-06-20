import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// POST /api/ai/narrative
// AI assist for the Incident Report narrative (item 28). Auth-required. Takes the
// report's structured fields + the officer's rough notes / current draft and returns
// a cleaned, professional third-person narrative.
//
// Uses Google Gemini (free tier) via the REST API — no SDK dependency. Set
// GEMINI_API_KEY in the environment (free key from https://aistudio.google.com).
// GEMINI_MODEL optionally overrides the model (default gemini-2.0-flash).
// The model receives incident PII (names, locations) — mind that when reviewing.
export const runtime = "nodejs"

type Body = {
  mode?: "draft" | "tighten" | "expand" | "formal"
  notes?: string
  fields?: {
    incident_type?: string
    location?: string
    building?: string
    apartment?: string
    persons_involved?: string
    action_taken?: string
    date?: string
    time?: string
  }
}

const MODE_TASK: Record<string, string> = {
  draft:   "Turn the officer's rough notes below into a complete, well-organized incident narrative.",
  tighten: "Tighten and condense the narrative below — remove redundancy and filler while keeping every fact.",
  expand:  "Expand the narrative below into a fuller account, adding clarity and structure. Do NOT invent facts not present in the notes or fields.",
  formal:  "Rewrite the narrative below in a more formal, professional tone suitable for a security incident report.",
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
  const notes = String(input.notes || "").slice(0, 8000)
  if (!notes.trim()) return NextResponse.json({ error: "Nothing to work with — add some notes first." }, { status: 400 })

  const f = input.fields || {}
  const unit = [f.building, f.apartment].filter(Boolean).join("-")
  const details = [
    f.incident_type && `Incident type: ${f.incident_type}`,
    (unit || f.location) && `Location: ${[unit, f.location].filter(Boolean).join(" — ")}`,
    (f.date || f.time) && `When: ${[f.date, f.time].filter(Boolean).join(" ")}`,
    f.persons_involved && `Persons involved: ${f.persons_involved}`,
    f.action_taken && `Action taken: ${f.action_taken}`,
  ].filter(Boolean).join("\n") || "(no structured details provided)"

  const instructions =
    "You help a licensed security officer write the narrative section of an incident report. " +
    "Write in clear, professional, factual third person, past tense. Use only the facts given in the " +
    "structured details and the officer's notes — never invent names, times, outcomes, or events. " +
    "Do not add legal conclusions or opinions. Keep it concise and readable. " +
    "Output ONLY the finished narrative text — no preamble, headings, labels, bullet points, or commentary."

  const prompt =
    `${instructions}\n\n` +
    `Structured details:\n${details}\n\n` +
    `Officer's notes / current draft:\n${notes}\n\n` +
    `Task: ${MODE_TASK[mode]}`

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      }),
    })

    const data: any = await res.json().catch(() => null)
    if (!res.ok) {
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

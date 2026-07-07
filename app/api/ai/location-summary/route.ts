import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// POST /api/ai/location-summary
// Scans ALL logged activity at one community for a date range (e.g. a month)
// via the unit_activity view and produces a structured operations summary:
// executive summary + severity-ranked concerns, open follow-ups, patterns,
// and recommendations. Evaluation/triage, not a recap. Same Gemini pattern as
// /api/ai/summary.
//
// PII note: the unit_activity view exposes names (HOH) and free-text detail but
// NOT SSN/DOB/OLN, so those never reach the model. Names are included because
// repeat-person pattern detection depends on them.
export const runtime = "nodejs"

type Body = { communityId?: string; from?: string; to?: string }

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    executive_summary: { type: "string" },
    concerns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title:    { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          detail:   { type: "string" },
          location: { type: "string" },
        },
        required: ["title", "severity"],
      },
    },
    follow_ups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title:    { type: "string" },
          detail:   { type: "string" },
          location: { type: "string" },
        },
        required: ["title"],
      },
    },
    patterns: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, detail: { type: "string" } },
        required: ["title"],
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["executive_summary", "concerns", "follow_ups", "patterns", "recommendations"],
}

export async function POST(req: Request) {
  let input: Body
  try { input = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  const { communityId, from, to } = input
  if (!communityId || !from || !to) {
    return NextResponse.json({ error: "communityId, from and to are required" }, { status: 400 })
  }

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

  // Community name + activity feed for the window.
  const [{ data: comm }, { data: activity }] = await Promise.all([
    supabase.from("communities").select("name").eq("id", communityId).maybeSingle(),
    supabase.from("unit_activity").select("*")
      .eq("community_id", communityId)
      .gte("event_at", from + "T00:00:00")
      .lte("event_at", to + "T23:59:59")
      .order("event_at", { ascending: true })
      .limit(1500),
  ])

  const rows = (activity || []) as any[]
  if (rows.length === 0) {
    return NextResponse.json({ error: "No activity on record for this location and period." }, { status: 404 })
  }

  const communityName = (comm as { name?: string } | null)?.name || "the property"

  // Counts by record type.
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.record_type || "Other"] = (counts[r.record_type || "Other"] || 0) + 1
  const countsStr = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")

  // Compact record lines (cap detail length; names kept, no SSN/DOB in the view).
  const lines = rows.map((r) => {
    const date = r.event_at ? new Date(r.event_at).toISOString().slice(0, 10) : "—"
    const loc  = [r.building, r.apartment].filter(Boolean).join("-") || "common area"
    const refs = [
      r.reliant_case_no && `Reliant#${r.reliant_case_no}`,
      r.hpd_report_no && `HPD#${r.hpd_report_no}`,
      r.asg_report_no && `ASG#${r.asg_report_no}`,
    ].filter(Boolean).join(" ")
    const detail = String(r.detail || "").replace(/\s+/g, " ").slice(0, 240)
    return `${date} | ${loc} | ${r.record_type || "Activity"}${r.hoh_name ? ` | HOH: ${r.hoh_name}` : ""}${detail ? ` | ${detail}` : ""}${refs ? ` | ${refs}` : ""}`
  }).join("\n").slice(0, 24000)

  const prompt = `You are a security operations supervisor reviewing ALL logged activity at a single residential property for a period. Evaluate and triage — do NOT recap.

Property: ${communityName}
Period: ${from} to ${to}
Total records: ${rows.length}
Counts by type: ${countsStr}

Records (date | location | type | people | detail | ref#):
${lines}

Analyze and return:
- executive_summary: 2-4 sentences on the overall security picture for this property this period.
- concerns: safety/security issues — weapons, violence, threats, repeat trespass, serious incidents. Rank by severity (high/medium/low). Include the location.
- follow_ups: unresolved items and required actions, especially serious incidents that may not have been referred/notified to authorities (Reliant/HPD).
- patterns: the SAME unit or person recurring across multiple records, escalating behavior, or clusters by area/time.
- recommendations: concrete next actions for site management.

Base everything ONLY on the records provided — never invent facts. If a category has nothing, return an empty array.`

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash"
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1600,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    })

    const data: any = await res.json().catch(() => null)
    if (!res.ok) {
      const isQuota = res.status === 429 || data?.error?.status === "RESOURCE_EXHAUSTED"
      if (isQuota) {
        const retryDelayStr: string | undefined = data?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"))?.retryDelay
        const retryMatch = (data?.error?.message as string | undefined)?.match(/retry in ([\d.]+)/i)
        const retrySeconds = retryDelayStr ? Math.ceil(parseFloat(retryDelayStr))
          : retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null
        const retryMsg = retrySeconds ? ` Try again in ~${retrySeconds}s.` : " Try again in a moment."
        return NextResponse.json({ error: `AI summary is temporarily unavailable (quota exceeded).${retryMsg}` }, { status: 429 })
      }
      const msg = data?.error?.message || `AI request failed (${res.status}).`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const blocked = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason === "SAFETY"
    if (blocked) return NextResponse.json({ error: "AI declined to process this content." }, { status: 422 })

    const text: string = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text || "").join("").trim()
    if (!text) return NextResponse.json({ error: "Model returned an empty response." }, { status: 502 })

    let summary: any
    try { summary = JSON.parse(text) } catch { return NextResponse.json({ error: "Model returned malformed output." }, { status: 502 }) }

    return NextResponse.json({
      summary,
      meta: { community: communityName, from, to, totalRecords: rows.length, counts },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI request failed." }, { status: 502 })
  }
}

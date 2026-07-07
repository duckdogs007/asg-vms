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

// unit_activity.source_table → /vms/reports/[type] slug (for source links).
const UA_SOURCE_SLUG: Record<string, string> = {
  incident_reports:             "incident",
  parking_violations:           "parking",
  vehicle_fi_logs:              "vehicle-fi",
  contact_history:              "field-contact",
  officer_daily_logs:           "daily-log",
  property_maintenance_reports: "maintenance",
  gate_checklists:              "gate-checklist",
  visitor_logs:                 "visitor-log",
}

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
          sources:  { type: "array", items: { type: "string" } },
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
          sources:  { type: "array", items: { type: "string" } },
        },
        required: ["title"],
      },
    },
    patterns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title:   { type: "string" },
          detail:  { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["executive_summary", "concerns", "follow_ups", "patterns", "recommendations"],
}

// Parse model output that may be wrapped in ```json fences or padded with prose.
function extractJson(text: string): any | null {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const first = t.indexOf("{")
  const last  = t.lastIndexOf("}")
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1)
  try { return JSON.parse(t) } catch { return null }
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

  // Gather all sources for the community + window in parallel: unit activity,
  // BOLOs, new watchlist (barred-person) additions, and alerts.
  const [
    { data: comm },
    { data: activity },
    { data: boloRows },
    { data: wlRows },
    { data: alertRows },
  ] = await Promise.all([
    supabase.from("communities").select("name").eq("id", communityId).maybeSingle(),
    supabase.from("unit_activity").select("*")
      .eq("community_id", communityId)
      .gte("event_at", from + "T00:00:00").lte("event_at", to + "T23:59:59")
      .order("event_at", { ascending: true }).limit(1500),
    supabase.from("bolos").select("id, name, description, reason, plate, vehicle, firearm_flag, created_at")
      .eq("community_id", communityId)
      .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59").limit(200),
    supabase.from("watchlist").select("id, first_name, last_name, reason, firearm_flag, created_at")
      .eq("community_id", communityId)
      .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59").limit(300),
    supabase.from("alerts").select("id, type, severity, payload, status, sent_at")
      .eq("community_id", communityId)
      .gte("sent_at", from + "T00:00:00").lte("sent_at", to + "T23:59:59").limit(200),
  ])

  const communityName = (comm as { name?: string } | null)?.name || "the property"

  // Unified record list. Each record gets a stable [Rn] ref, a prompt line, and
  // (where available) a link to the underlying record for UI source-linking.
  // PII: names/reasons kept; SSN/DOB/OLN/plate-owner data intentionally excluded.
  type Rec = { date: string; category: string; line: string; href: string | null; label: string }
  const recs: Rec[] = []

  for (const r of (activity || []) as any[]) {
    const date = r.event_at ? new Date(r.event_at).toISOString().slice(0, 10) : ""
    const loc  = [r.building, r.apartment].filter(Boolean).join("-") || "common area"
    const refNos = [r.reliant_case_no && `Reliant#${r.reliant_case_no}`, r.hpd_report_no && `HPD#${r.hpd_report_no}`, r.asg_report_no && `ASG#${r.asg_report_no}`].filter(Boolean).join(" ")
    const detail = String(r.detail || "").replace(/\s+/g, " ").slice(0, 240)
    const slug = UA_SOURCE_SLUG[r.source_table]
    recs.push({
      date, category: r.record_type || "Activity",
      line: `${loc} | ${r.record_type || "Activity"}${r.hoh_name ? ` | HOH: ${r.hoh_name}` : ""}${detail ? ` | ${detail}` : ""}${refNos ? ` | ${refNos}` : ""}`,
      href: slug && r.source_id ? `/vms/reports/${slug}/${r.source_id}` : null,
      label: `${r.record_type || "Activity"} @ ${loc}`,
    })
  }
  for (const b of (boloRows || []) as any[]) {
    recs.push({
      date: b.created_at ? String(b.created_at).slice(0, 10) : "", category: "BOLO",
      line: `BOLO | ${b.name || "—"}${b.reason || b.description ? ` | ${b.reason || b.description}` : ""}${b.plate ? ` | plate ${b.plate}` : ""}${b.vehicle ? ` | ${b.vehicle}` : ""}${b.firearm_flag ? " | FIREARM" : ""}`,
      href: `/vms/intel/bolo/${b.id}`, label: `BOLO: ${b.name || "—"}`,
    })
  }
  for (const w of (wlRows || []) as any[]) {
    const name = [w.first_name, w.last_name].filter(Boolean).join(" ") || "—"
    recs.push({
      date: w.created_at ? String(w.created_at).slice(0, 10) : "", category: "Watchlist add",
      line: `Watchlist addition (barred) | ${name}${w.reason ? ` | ${w.reason}` : ""}${w.firearm_flag ? " | FIREARM" : ""}`,
      href: `/vms/intel/${w.id}`, label: `Watchlist: ${name}`,
    })
  }
  for (const a of (alertRows || []) as any[]) {
    const subj = (a.payload && (a.payload.subject || a.payload.Subject)) || a.type || "alert"
    recs.push({
      date: a.sent_at ? String(a.sent_at).slice(0, 10) : "", category: "Alert",
      line: `Alert (${a.severity || "?"}) | ${a.type || "—"} | ${String(subj).slice(0, 160)}${a.status ? ` | status ${a.status}` : ""}`,
      href: "/alerts", label: `Alert: ${a.type || "—"}`,
    })
  }

  if (recs.length === 0) {
    return NextResponse.json({ error: "No activity on record for this location and period." }, { status: 404 })
  }
  recs.sort((a, b) => (a.date || "").localeCompare(b.date || ""))

  const counts: Record<string, number> = {}
  for (const r of recs) counts[r.category] = (counts[r.category] || 0) + 1
  const countsStr = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")

  // Ref map (Rn → link) for the UI + tagged lines for the prompt.
  const refMap: Record<string, { label: string; href: string | null }> = {}
  const lines = recs.map((r, i) => {
    const ref = `R${i + 1}`
    refMap[ref] = { label: r.label, href: r.href }
    return `[${ref}] ${r.date || "—"} | ${r.line}`
  }).join("\n").slice(0, 26000)

  const prompt = `You are a security operations supervisor reviewing ALL logged activity at a single residential property for a period. Evaluate and triage — do NOT recap.

Property: ${communityName}
Period: ${from} to ${to}
Total records: ${recs.length}
Counts by type: ${countsStr}

Each record is prefixed with a reference tag like [R12]. Records include unit/incident activity, BOLOs, new watchlist (barred-person) additions, and alerts.

Records:
${lines}

Analyze and return:
- executive_summary: 2-4 sentences on the overall security picture for this property this period.
- concerns: safety/security issues — weapons, violence, threats, repeat trespass, serious incidents, new BOLOs/barred persons. Rank by severity (high/medium/low). Include the location.
- follow_ups: unresolved items and required actions, especially serious incidents that may not have been referred/notified to authorities (Reliant/HPD).
- patterns: the SAME unit or person recurring across multiple records, escalating behavior, or clusters by area/time.
- recommendations: concrete next actions for site management.

For EVERY concern, follow_up, and pattern, include a "sources" array listing the record reference tags (e.g. "R12") it is based on. Base everything ONLY on the records provided — never invent facts or reference tags not shown above. If a category has nothing, return an empty array.`

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
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          // gemini-2.5-flash is a thinking model; without this it can spend the
          // output budget "thinking" and truncate the JSON. Disable it here.
          thinkingConfig: { thinkingBudget: 0 },
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

    const finish = data?.candidates?.[0]?.finishReason
    const text: string = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text || "").join("").trim()
    if (!text) {
      const why = finish === "MAX_TOKENS" ? " (response too long — try a shorter date range)" : ""
      return NextResponse.json({ error: `Model returned an empty response${why}.` }, { status: 502 })
    }

    // Tolerant JSON extraction: strip markdown fences and isolate the object.
    const summary = extractJson(text)
    if (!summary) {
      console.error("[location-summary] unparseable output. finishReason=", finish, "snippet=", text.slice(0, 400))
      const why = finish === "MAX_TOKENS" ? " The report was too long for one pass — try a shorter date range." : ""
      return NextResponse.json({ error: `Model returned malformed output.${why}` }, { status: 502 })
    }

    // Only return links for the record refs the model actually cited (keeps the
    // payload small and the UI relevant).
    const cited = new Set<string>()
    for (const key of ["concerns", "follow_ups", "patterns"]) {
      for (const item of (summary[key] || [])) {
        for (const ref of (item?.sources || [])) cited.add(String(ref))
      }
    }
    const sources: Record<string, { label: string; href: string | null }> = {}
    for (const ref of cited) if (refMap[ref]) sources[ref] = refMap[ref]

    return NextResponse.json({
      summary,
      meta: { community: communityName, from, to, totalRecords: recs.length, counts, sources },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI request failed." }, { status: 502 })
  }
}

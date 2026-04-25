// Client-side helper to fire alerts via /api/alerts/send.
// Fire-and-forget by design — UI should not block on email delivery.

export type AlertType = "watchlist_hit" | "incident_high_priority" | "panic_sos"

export interface FireAlertInput {
  type:         AlertType
  severity?:    "critical" | "high" | "medium"
  community_id?: string | null
  subject?:      string
  body?:         string
  payload?:      Record<string, unknown>
}

export async function fireAlert(input: FireAlertInput): Promise<void> {
  try {
    const r = await fetch("/api/alerts/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(input),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => "")
      console.error("[alerts] send failed:", r.status, text)
    }
  } catch (e) {
    console.error("[alerts] send error:", e)
  }
}

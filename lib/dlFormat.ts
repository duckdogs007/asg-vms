// Display helpers for raw AAMVA driver's-license values. Scans store the raw
// barcode values (sex as the DBC code "1"/"2", height as the DAU field e.g.
// "067 in"), so every view that shows them must decode — otherwise the card
// reads "Sex: 1 · Height: 067 in".

// AAMVA DBC: 1 = male, 2 = female, 9 = not specified.
export function decodeSex(code: string | null | undefined): string {
  const c = String(code ?? "").trim()
  if (c === "1" || c.toUpperCase() === "M") return "M"
  if (c === "2" || c.toUpperCase() === "F") return "F"
  if (c === "9") return "X"
  return c || "—"
}

// AAMVA DAU: total inches, usually zero-padded with a unit — "067 in" → 5'7".
// Also tolerates a bare number ("67") and passes through cm or anything odd.
export function formatHeight(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim()
  if (!s) return "—"
  const m = s.match(/^0*(\d{2,3})\s*(in)?$/i)
  if (m) {
    const total = parseInt(m[1], 10)
    if (total > 0 && total < 108) return `${Math.floor(total / 12)}'${total % 12}"`
  }
  return s
}

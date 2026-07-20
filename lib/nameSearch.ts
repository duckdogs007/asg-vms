// Matching a person against a free-text "persons involved" field.
//
// This MUST anchor on the last name. A previous version could match on the
// first name alone, and treated a single-letter initial as a substring — so
// searching "Johnson, O" matched any report containing the letter "o"
// ("Officer Brinkley", "S/O B. Baldwin", "Henrico Fire", "of incident") and
// reported 6 incident appearances for someone with none.
export function personsInvolvedMatch(
  personsInvolved: string | null | undefined,
  first: string,
  last: string,
): boolean {
  const pi = (personsInvolved || "").toLowerCase()
  if (!pi || !last) return false
  const tokens = pi.split(/\W+/).filter(Boolean)

  // The surname must appear as a whole word — not a substring.
  if (!tokens.includes(last)) return false

  // Single-word query (parseName sets first === last): surname hit is enough.
  if (!first || first === last) return true

  const others = tokens.filter(t => t !== last && t.length >= 2)
  const firstOk = others.some(w =>
    first.length === 1
      ? w.startsWith(first)                                   // "O" → "Oliver"
      : w.length >= 3 && (w.startsWith(first) || first.startsWith(w)) // "Rob" ↔ "Robert"
  )

  // Officer documented only a surname → still a plausible appearance.
  return firstOk || others.length === 0
}

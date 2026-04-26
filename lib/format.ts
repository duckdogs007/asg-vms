// Display helpers shared across pages.

/**
 * Mask a stored SSN to "•••-••-XXXX" where XXXX is the last 4 digits.
 * Works on full SSNs ("123-45-6789", "123456789") and on records that
 * only stored the last 4 ("1234"). Returns empty string for null/undefined.
 */
export function maskSSN(value: string | null | undefined): string {
  if (!value) return ""
  const digits = String(value).replace(/\D/g, "")
  if (!digits) return ""
  const last4 = digits.slice(-4).padStart(4, "•")
  return `•••-••-${last4}`
}

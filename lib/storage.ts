// Storage URL helpers for PRIVATE buckets (security audit #16).
//
// Buckets (photos, contact-photos, community-docs) are private, so objects are
// no longer reachable by a stable public URL. Rows in the DB still store the
// legacy `/object/public/<bucket>/<path>` strings (and new uploads keep doing
// so via getPublicUrl, which just builds a string) — we treat those purely as
// locators: parse the bucket + path back out and mint a short-lived signed URL
// on demand.
//
// Pure module — no React, no bound client — so it's safe to import on the
// server (email routes) and the client (SignedImage).
import type { SupabaseClient } from "@supabase/supabase-js"

export const DEFAULT_SIGNED_TTL = 3600          // 1 hour (in-app)
export const EMAIL_SIGNED_TTL    = 60 * 60 * 24 * 30  // 30 days (alert emails)

// Pull the bucket + object path out of a stored value. Handles legacy public
// URLs, signed URLs, and bare paths (with optional `<bucket>/` prefix).
export function parseStored(stored: string, fallbackBucket = ""): { bucket: string; path: string } {
  if (!stored) return { bucket: fallbackBucket, path: "" }
  const m = stored.match(/\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/)
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) }
  let p = stored
  if (fallbackBucket && p.startsWith(fallbackBucket + "/")) p = p.slice(fallbackBucket.length + 1)
  return { bucket: fallbackBucket, path: p }
}

// Mint a signed URL for a stored locator. Returns "" if it can't be resolved or
// signing fails (callers fall back to no image). Works with any Supabase client.
export async function createSignedUrlFor(
  client: SupabaseClient,
  stored: string | null | undefined,
  fallbackBucket = "",
  ttlSeconds: number = DEFAULT_SIGNED_TTL,
): Promise<string> {
  if (!stored) return ""
  const { bucket, path } = parseStored(stored, fallbackBucket)
  if (!bucket || !path) return ""
  const { data } = await client.storage.from(bucket).createSignedUrl(path, ttlSeconds)
  return data?.signedUrl || ""
}

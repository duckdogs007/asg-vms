"use client"

// Client helpers for rendering objects from PRIVATE storage buckets (#16).
// They take a stored locator (legacy public URL or path), mint a short-lived
// signed URL via the browser client, and render once it resolves. Safe to use
// inside .map() loops (each instance owns its own async state) — unlike a hook.
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { createSignedUrlFor, DEFAULT_SIGNED_TTL } from "@/lib/storage"

export function useSignedUrl(
  stored?: string | null,
  fallbackBucket = "",
  ttl: number = DEFAULT_SIGNED_TTL,
): string {
  const [url, setUrl] = useState("")
  useEffect(() => {
    let active = true
    if (!stored) { setUrl(""); return }
    createSignedUrlFor(supabase, stored, fallbackBucket, ttl).then(u => { if (active) setUrl(u) })
    return () => { active = false }
  }, [stored, fallbackBucket, ttl])
  return url
}

export function SignedImage({
  src, bucket = "", alt = "", className, ttl = DEFAULT_SIGNED_TTL,
}: {
  src?: string | null; bucket?: string; alt?: string; className?: string; ttl?: number
}) {
  const url = useSignedUrl(src, bucket, ttl)
  if (!url) return null
  return <img src={url} alt={alt} className={className} />
}

// A link that opens a private object via a freshly-signed URL. Renders its
// children inside an <a>; the href fills in once signed (placeholder until then).
export function SignedLink({
  href, bucket = "", className, title, children, ttl = DEFAULT_SIGNED_TTL,
}: {
  href?: string | null; bucket?: string; className?: string; title?: string;
  children: React.ReactNode; ttl?: number
}) {
  const url = useSignedUrl(href, bucket, ttl)
  return (
    <a href={url || "#"} target="_blank" rel="noopener noreferrer"
      className={className} title={title}
      onClick={e => { if (!url) e.preventDefault() }}>
      {children}
    </a>
  )
}

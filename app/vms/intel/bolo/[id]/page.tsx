"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { SignedImage } from "@/components/SignedImage"
import { maskSSN } from "@/lib/format"

export default function BoloDetailPage() {
  const params = useParams()
  const id     = params.id as string

  const [bolo,          setBolo]          = useState<Record<string, any> | null>(null)
  const [communityName, setCommunityName] = useState("")
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    supabase.from("bolos").select("*").eq("id", id).maybeSingle()
      .then(({ data }) => {
        setBolo(data)
        if (data?.community_id) {
          supabase.from("communities").select("name").eq("id", data.community_id).maybeSingle()
            .then(({ data: c }) => setCommunityName(c?.name ?? ""))
        }
        setLoading(false)
      })
  }, [id])

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>
  if (!bolo)   return (
    <div className="p-8">
      <div className="text-gray-500 text-sm mb-3">BOLO not found.</div>
      <Link href="/userdash" className="text-blue-700 text-sm hover:underline">← Back to User Dashboard</Link>
    </div>
  )

  const photos: string[] = bolo.photo_urls ?? []

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="mb-5">
        <Link href="/userdash" className="text-xs text-blue-700 hover:underline">← BOLOs</Link>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
            bolo.active ? "bg-red-100 text-red-700 border-red-200" : "bg-gray-100 text-gray-500 border-gray-200"
          }`}>
            {bolo.active ? "🔴 Active BOLO" : "Resolved"}
          </span>
          {bolo.firearm_flag && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-700 text-white">🔫 Firearm Flag</span>
          )}
        </div>
      </div>

      {/* Subject */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        {bolo.name && <div className="text-xl font-bold text-gray-900 mb-3">{bolo.name}</div>}
        {bolo.reason && <div className="text-sm font-semibold text-red-700 mb-3">{bolo.reason}</div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {bolo.dob  && <div><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">DOB</div><div className="text-sm text-gray-900">{bolo.dob}</div></div>}
          {bolo.sex  && <div><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Sex</div><div className="text-sm text-gray-900">{bolo.sex}</div></div>}
          {bolo.race && <div><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Race</div><div className="text-sm text-gray-900">{bolo.race}</div></div>}
          {bolo.oln  && <div><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">OLN</div><div className="text-sm text-gray-900">{bolo.oln}</div></div>}
          {bolo.ssn  && <div><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">SSN</div><div className="text-sm text-gray-900">{maskSSN(bolo.ssn)}</div></div>}
          {communityName && <div><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Property</div><div className="text-sm text-gray-900">{communityName}</div></div>}
          {bolo.added_by  && <div><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Added By</div><div className="text-sm text-gray-900">{bolo.added_by}</div></div>}
        </div>
      </div>

      {/* Vehicle */}
      {(bolo.vehicle || bolo.plate) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Vehicle</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {bolo.vehicle    && <div className="sm:col-span-2"><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Description</div><div className="text-sm text-gray-900">{bolo.vehicle}</div></div>}
            {bolo.plate      && <div><div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Plate</div><div className="text-sm text-gray-900">{bolo.plate}{bolo.plate_state ? ` (${bolo.plate_state})` : ""}</div></div>}
          </div>
        </div>
      )}

      {/* Description */}
      {bolo.description && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Description</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{bolo.description}</div>
        </div>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Photos ({photos.length})</div>
          <div className="flex flex-wrap gap-3">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <SignedImage
                  src={url}
                  bucket="contact-photos"
                  alt={`Photo ${i + 1}`}
                  className="w-28 h-32 object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-gray-400 mt-6">
        BOLO ID: {id} · Added {bolo.created_at ? new Date(bolo.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
      </div>
    </div>
  )
}

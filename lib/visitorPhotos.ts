import { supabase } from "@/lib/supabase/supabaseClient"

export type VisitorPhotoMeta = {
  visitorId: string
  visitorLogId?: string | null
  communityId?: string | null
  capturedBy?: string | null
}

async function uploadOne(file: File, visitorId: string, type: "id" | "live", i: number): Promise<string | null> {
  const ext  = file.name.split(".").pop() || "jpg"
  const path = `visitor_${visitorId}_${type}_${Date.now()}_${i}.${ext}`
  const { data: up, error } = await supabase.storage.from("photos").upload(path, file, { upsert: false })
  if (error || !up) return null
  const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(up.path)
  return publicUrl
}

// Upload ID/Live photos to the photos bucket and insert one visitor_photos row
// per photo, attached to the person (visitor_id) and this check-in (visitor_log_id).
export async function saveVisitorPhotos(
  idFiles: File[], liveFiles: File[], meta: VisitorPhotoMeta,
): Promise<{ saved: number; failed: number }> {
  if (!meta.visitorId) return { saved: 0, failed: idFiles.length + liveFiles.length }
  let failed = 0
  const rows: any[] = []
  const groups: [File[], "id" | "live"][] = [[idFiles, "id"], [liveFiles, "live"]]
  for (const [files, type] of groups) {
    for (let i = 0; i < files.length; i++) {
      const url = await uploadOne(files[i], meta.visitorId, type, i)
      if (!url) { failed++; continue }
      rows.push({
        visitor_id:     meta.visitorId,
        visitor_log_id: meta.visitorLogId || null,
        community_id:   meta.communityId || null,
        photo_type:     type,
        url,
        captured_by:    meta.capturedBy || null,
        captured_at:    new Date().toISOString(),
      })
    }
  }
  if (rows.length === 0) return { saved: 0, failed }
  const { error } = await supabase.from("visitor_photos").insert(rows)
  if (error) return { saved: 0, failed: failed + rows.length }
  return { saved: rows.length, failed }
}

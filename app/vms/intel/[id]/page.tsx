"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/supabaseClient"
import { WatchlistEntry } from "@/lib/types"
import { SignedImage, SignedLink } from "@/components/SignedImage"
import { ADMIN_EMAILS } from "@/lib/admin"

interface PersonRow extends WatchlistEntry {
  photo_url?: string | null
  community?: string | null  // legacy free-text location field
}

interface NoteRow {
  id: string
  note: string | null
  officer_name: string | null
  severity: string | null
  created_at: string
}

interface FlagRow {
  id: string
  flagged: boolean | null
  reason: string | null
  created_at: string
}

interface IncidentRow {
  id: string
  report: string | null
  description: string | null
  officer_name: string | null
  date: string | null
  location: string | null
  incident_type: string | null
  created_at: string
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB

function validatePhotoFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file (jpg, png, etc)."
  if (file.size > MAX_PHOTO_BYTES) return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`
  return null
}

function fmt(ts: string | null) {
  if (!ts) return "—"
  const s = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z"
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

// For date-only values (YYYY-MM-DD) — avoids UTC midnight timezone shift
function fmtDate(d: string | null) {
  if (!d) return "—"
  const [y, m, day] = d.split("-").map(Number)
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const SEVERITY_BADGE: Record<string, string> = {
  LOW:    "bg-gray-100   text-gray-700",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH:   "bg-red-100    text-red-800",
}

export default function ProfilePage() {

  // Next 15+: route params arrive as a Promise on the `params` prop, so reading
  // them synchronously yields undefined (→ id="undefined" → uuid cast error).
  // useParams() unwraps them safely in this client component.
  const routeParams = useParams()
  const router = useRouter()
  const id = (Array.isArray(routeParams?.id) ? routeParams.id[0] : routeParams?.id) as string | undefined

  const [person,    setPerson]    = useState<PersonRow | null>(null)
  const [communityName, setCommunityName] = useState("")
  const [notes,     setNotes]     = useState<NoteRow[]>([])
  const [flags,     setFlags]     = useState<FlagRow[]>([])
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState("")

  // Photo upload
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState("")

  // Flag
  const [flagging,   setFlagging]   = useState(false)
  const [flagError,  setFlagError]  = useState("")

  // Add to BOLO
  const [boloBusy,   setBoloBusy]   = useState(false)
  const [boloError,  setBoloError]  = useState("")

  // Add note
  const [noteOfficer,  setNoteOfficer]  = useState("")
  const [noteSeverity, setNoteSeverity] = useState("LOW")
  const [noteText,     setNoteText]     = useState("")
  const [savingNote,   setSavingNote]   = useState(false)
  const [noteError,    setNoteError]    = useState("")

  // Add incident (this page uses the legacy `report` column for free-text;
  // the rich admin form at /admin → Officer Reports uses the extended schema)
  const [incidentText,  setIncidentText]  = useState("")
  const [savingIncident,setSavingIncident]= useState(false)
  const [incidentError, setIncidentError] = useState("")

  // Admin edit
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [editMode,   setEditMode]   = useState(false)
  const [editFields, setEditFields] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError,  setEditError]  = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setIsAdmin(ADMIN_EMAILS.includes(user.email || ""))
    })
  }, [])

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    if (!id || id === "undefined") { setLoading(false); setError("Failed to load profile."); return }
    setLoading(true); setError("")
    const [{ data: p, error: pErr }, { data: n }, { data: f }, { data: i }] = await Promise.all([
      supabase.from("watchlist").select("*").eq("id", id).maybeSingle(),
      supabase.from("person_notes").select("*").eq("person_id", id).order("created_at", { ascending: false }),
      supabase.from("person_flags").select("*").eq("person_id", id).order("created_at", { ascending: false }),
      supabase.from("incident_reports").select("*").eq("person_id", id).order("created_at", { ascending: false }),
    ])
    setLoading(false)
    if (pErr) { setError("Failed to load profile."); return }
    setPerson(p as PersonRow | null)
    // Resolve the community_id (uuid) to a readable name for the Location line.
    if (p?.community_id) {
      const { data: c } = await supabase.from("communities").select("name").eq("id", p.community_id).maybeSingle()
      setCommunityName((c as { name?: string } | null)?.name || "")
    } else {
      setCommunityName("")
    }
    setNotes((n as NoteRow[]) || [])
    setFlags((f as FlagRow[]) || [])

    // Also search by name in persons_involved (new-style reports don't set person_id)
    const base: IncidentRow[] = (i as IncidentRow[]) || []
    const first = (p?.first_name || "").toLowerCase().trim()
    const last  = (p?.last_name  || "").toLowerCase().trim()
    if (first && last) {
      const { data: byName } = await supabase
        .from("incident_reports")
        .select("*")
        .ilike("persons_involved", `%${last}%`)
        .order("created_at", { ascending: false })
        .limit(100)
      const baseIds = new Set(base.map(r => r.id))
      const extra = (byName || []).filter((r: any) => {
        if (baseIds.has(r.id)) return false
        const pi = (r.persons_involved || "").toLowerCase()
        if (!pi.includes(last)) return false
        const tokens = pi.split(/\W+/).filter(Boolean)
        const minLen = Math.min(4, first.length)
        // Accept on first-name match (full/nickname/initial) or last-name-only entry
        const firstMatch = tokens.some((w: string) => {
          if (w.length === 1) return w === first[0]           // "T" → "Theodore"
          return w.length >= minLen && (w.includes(first) || first.includes(w))
        })
        const hasOtherTokens = tokens.some((w: string) => w !== last && w.length >= 2)
        return firstMatch || !hasOtherTokens
      })
      setIncidents(
        [...base, ...(extra as IncidentRow[])]
          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      )
    } else {
      setIncidents(base)
    }
  }

  async function flagPerson() {
    setFlagging(true); setFlagError("")
    const { error: err } = await supabase.from("person_flags").insert({
      person_id: id,
      flagged:   true,
      reason:    "Manual flag",
      created_at: new Date().toISOString(),
    })
    setFlagging(false)
    if (err) { setFlagError(err.message); return }
    await loadAll()
  }

  function personName() {
    return [person?.first_name, person?.middle_name, person?.last_name].filter(Boolean).join(" ").trim() || "Unknown"
  }

  // Create a BOLO pre-filled from this record, reusing an existing active BOLO
  // for the same OLN/name. Returns the BOLO id, or null on error.
  async function createBoloFromPerson(): Promise<string | null> {
    if (!person) return null
    const name = personName()
    let dupQ = supabase.from("bolos").select("id").eq("active", true)
    dupQ = person.oln ? dupQ.eq("oln", person.oln) : dupQ.ilike("name", name)
    const { data: dup } = await dupQ.limit(1).maybeSingle()
    if (dup) return (dup as any).id as string

    const { data: { user } } = await supabase.auth.getUser()
    const { data: created, error: err } = await supabase.from("bolos").insert({
      name,
      reason:       person.reason || null,
      description:  person.comments || person.notes || null,
      community_id: person.community_id || null,
      dob:          person.dob || null,
      oln:          person.oln || null,
      ssn:          person.ssn || null,
      sex:          person.sex || null,
      race:         person.race || null,
      firearm_flag: !!person.firearm_flag,
      photo_url:    person.photo_url || null,
      added_by:     user?.email || null,
      active:       true,
      created_at:   new Date().toISOString(),
    }).select("id").single()
    if (err) { setBoloError(err.message); return null }
    supabase.from("audit_logs").insert({
      user_email: user?.email || "unknown",
      action: "created", resource_type: "BOLO", resource_id: created!.id,
      detail: `BOLO created from watchlist record — ${name}`,
      created_at: new Date().toISOString(),
    })
    return created!.id as string
  }

  // Add to BOLO — keeps the person on the barred Watchlist as well.
  async function addToBolo() {
    if (!person) return
    if (!confirm(`Create a BOLO for ${personName()}? It will appear on the BOLO page for all staff.`)) return
    setBoloBusy(true); setBoloError("")
    const boloId = await createBoloFromPerson()
    setBoloBusy(false)
    if (boloId) router.push(`/vms/intel/bolo/${boloId}`)
  }

  // Move to BOLO — for someone entered as barred by mistake: create the BOLO and
  // REMOVE them from the barred Watchlist. Delete is admin-only (RLS).
  async function moveToBolo() {
    if (!person) return
    const name = personName()
    if (!confirm(`Move ${name} to BOLO?\n\nThis creates a BOLO and removes them from the Barred Watchlist (including this profile's notes/flags). Use this when the person was entered as barred by mistake.`)) return
    setBoloBusy(true); setBoloError("")
    const boloId = await createBoloFromPerson()
    if (!boloId) { setBoloBusy(false); return }
    const { error: delErr } = await supabase.from("watchlist").delete().eq("id", id)
    setBoloBusy(false)
    if (delErr) {
      // FK history (ban/denied/violation) can block removal — BOLO still created.
      setBoloError("BOLO created, but this person couldn't be removed from the barred list (they have ban/denied/violation history). They remain on the Watchlist.")
      router.push(`/vms/intel/bolo/${boloId}`)
      return
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase.from("audit_logs").insert({
        user_email: user?.email || "unknown",
        action: "deleted", resource_type: "Watchlist", resource_id: id,
        detail: `Moved to BOLO — removed from barred list — ${name}`,
        created_at: new Date().toISOString(),
      })
    })
    router.push(`/vms/intel/bolo/${boloId}`)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const v = validatePhotoFile(file)
    if (v) { setUploadError(v); return }
    setUploadError("")
    setUploading(true)
    try {
      const ext  = file.name.split(".").pop() || "jpg"
      const path = `${id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from("photos").upload(path, file, { upsert: true })
      if (upErr) { setUploadError("Upload failed: " + upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(path)
      const { error: dbErr } = await supabase.from("watchlist").update({ photo_url: publicUrl }).eq("id", id)
      if (dbErr) { setUploadError("Saved file, but failed to update record: " + dbErr.message); return }
      setPerson(p => p ? { ...p, photo_url: publicUrl } : p)
    } finally {
      setUploading(false)
    }
  }

  async function addNote() {
    if (!noteText.trim()) return
    setSavingNote(true); setNoteError("")
    const { error: err } = await supabase.from("person_notes").insert({
      person_id:    id,
      note:         noteText.trim(),
      officer_name: noteOfficer.trim() || null,
      severity:     noteSeverity,
      created_at:   new Date().toISOString(),
    })
    setSavingNote(false)
    if (err) { setNoteError(err.message); return }
    setNoteText("")
    await loadAll()
  }

  async function addIncident() {
    if (!incidentText.trim()) return
    setSavingIncident(true); setIncidentError("")
    const { error: err } = await supabase.from("incident_reports").insert({
      person_id:  id,
      report:     incidentText.trim(),
      created_at: new Date().toISOString(),
    })
    setSavingIncident(false)
    if (err) { setIncidentError(err.message); return }
    setIncidentText("")
    await loadAll()
  }

  function openEdit() {
    if (!person) return
    setEditFields({
      first_name:  person.first_name  || "",
      middle_name: person.middle_name || "",
      last_name:   person.last_name   || "",
      dob:         person.dob         || "",
      sex:         person.sex         || "",
      race:        person.race        || "",
      oln:         person.oln         || "",
      ssn:         person.ssn         || "",
      ban_date:    person.ban_date    || "",
      banned_by:   person.banned_by   || person.flagged_by || "",
      reason:      person.reason      || "",
      notes:       person.notes       || person.comments   || "",
      community:   person.property     || "",
    })
    setEditError("")
    setEditMode(true)
  }

  async function saveEdit() {
    setEditSaving(true); setEditError("")
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from("watchlist").update({
      first_name:  editFields.first_name  || null,
      middle_name: editFields.middle_name || null,
      last_name:   editFields.last_name   || null,
      dob:         editFields.dob         || null,
      sex:         editFields.sex         || null,
      race:        editFields.race        || null,
      oln:         editFields.oln         || null,
      ssn:         editFields.ssn         || null,
      ban_date:    editFields.ban_date    || null,
      banned_by:   editFields.banned_by   || null,
      reason:      editFields.reason      || null,
      comments:    editFields.notes       || null,
      property:    editFields.community   || null,
    }).eq("id", id)
    if (err) { setEditError(err.message); setEditSaving(false); return }
    // Audit log
    supabase.from("audit_logs").insert({
      user_email: user?.email || "unknown",
      action: "updated", resource_type: "Watchlist", resource_id: id,
      detail: `Admin updated watchlist record: ${editFields.first_name} ${editFields.last_name}`,
      created_at: new Date().toISOString(),
    })
    setEditSaving(false)
    setEditMode(false)
    await loadAll()
  }

  if (loading) return <div className="p-5 text-gray-500 text-sm">Loading…</div>
  if (error)   return <div className="p-5 text-red-600 text-sm">{error}</div>
  if (!person) return <div className="p-5 text-gray-500 text-sm">Person not found.</div>

  const inputCls    = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
  const textareaCls = `${inputCls} resize-none`
  const labelCls    = "block text-xs font-semibold text-gray-600 mb-1"
  const sectionCls  = "bg-white border border-gray-200 rounded-xl p-4 mb-5"

  return (
    <div className="p-4 sm:p-5 pb-16 max-w-4xl">

      <div className="mb-4">
        <Link href="/vms/intel" className="text-sm text-blue-700 hover:text-blue-900">← Back to Intel Terminal</Link>
      </div>

      {/* HEADER */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 flex flex-col sm:flex-row gap-5">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold capitalize mb-2">
            {person.first_name} {person.middle_name || ""} {person.last_name}
          </h1>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm text-gray-700">
            {person.sex       && <div><span className="text-gray-500">Sex:</span> {person.sex}</div>}
            {person.race      && <div><span className="text-gray-500">Race:</span> {person.race}</div>}
            {person.dob       && <div><span className="text-gray-500">DOB:</span> {fmtDate(person.dob)}</div>}
            {person.oln       && <div><span className="text-gray-500">DL / OLN:</span> {person.oln}</div>}
            {person.ssn       && <div><span className="text-gray-500">SSN:</span> {person.ssn}</div>}
            {(communityName || person.property) && <div><span className="text-gray-500">Location:</span> {communityName || person.property}</div>}
            {person.ban_date  && <div><span className="text-gray-500">Ban Date:</span> {fmtDate(person.ban_date)}</div>}
            {person.banned_by && <div><span className="text-gray-500">Banned By:</span> {person.banned_by}</div>}
            {person.status    && <div><span className="text-gray-500">Status:</span> {person.status}</div>}
          </div>

          {person.firearm_flag && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs font-semibold text-amber-800">
              🔫 Firearm flag
            </div>
          )}

          {person.reason && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800 font-medium">
              🚨 {person.reason}
            </div>
          )}

          {person.comments && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes / Comments</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{person.comments}</div>
            </div>
          )}

          {Array.isArray(person.ban_sheet_urls) && person.ban_sheet_urls.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Ban Sheet</div>
              <div className="flex flex-wrap items-center gap-2">
                {person.ban_sheet_urls.map((url: string, i: number) => {
                  const isImg = /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url)
                  return isImg ? (
                    <SignedLink key={i} href={url} bucket="photos" title={`Ban sheet ${i + 1}`}>
                      <SignedImage src={url} bucket="photos" alt={`Ban sheet ${i + 1}`} className="w-12 h-14 object-cover rounded border border-gray-300 hover:border-red-400" />
                    </SignedLink>
                  ) : (
                    <SignedLink key={i} href={url} bucket="photos" className="text-xs text-blue-600 hover:underline">
                      📄 Page {i + 1}
                    </SignedLink>
                  )
                })}
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              onClick={flagPerson}
              disabled={flagging}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer disabled:opacity-50"
            >
              {flagging ? "Flagging…" : "🚩 Flag Person"}
            </button>
            <button
              onClick={addToBolo}
              disabled={boloBusy}
              title="Create a BOLO from this record (keeps them on the barred Watchlist)"
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-md border-none cursor-pointer disabled:opacity-50"
            >
              {boloBusy ? "Working…" : "📢 Add to BOLO"}
            </button>
            {isAdmin && (
              <button
                onClick={moveToBolo}
                disabled={boloBusy}
                title="Not actually barred? Create a BOLO and remove them from the barred Watchlist (admin only)"
                className="px-3 py-1.5 bg-white border border-amber-500 text-amber-700 hover:bg-amber-50 text-sm font-semibold rounded-md cursor-pointer disabled:opacity-50"
              >
                {boloBusy ? "Working…" : "➡️ Move to BOLO"}
              </button>
            )}
            {boloError && <span className="text-red-600 text-xs self-center">{boloError}</span>}
            {isAdmin && !editMode && (
              <button
                onClick={openEdit}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer"
              >
                ✏️ Edit Record
              </button>
            )}
            {flagError && <span className="text-red-600 text-xs self-center">{flagError}</span>}
          </div>
        </div>

        {/* PHOTO */}
        <div className="w-36 flex-shrink-0 text-center">
          <div className="w-32 h-40 bg-gray-100 border border-gray-200 rounded-md overflow-hidden flex items-center justify-center mx-auto">
            {person.photo_url
              ? <SignedImage src={person.photo_url} bucket="photos" alt="" className="w-full h-full object-cover" />
              : <span className="text-xs text-gray-400">No photo</span>}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            disabled={uploading}
            className="text-xs text-gray-600 mt-2 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 disabled:opacity-50"
          />
          {uploading && <div className="text-xs text-gray-500 mt-1">Uploading…</div>}
          {uploadError && <div className="text-xs text-red-600 mt-1">{uploadError}</div>}
        </div>
      </div>

      {/* ADMIN EDIT FORM */}
      {isAdmin && editMode && (
        <div className="bg-blue-50 border border-blue-300 rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-bold text-gray-800">✏️ Edit Watchlist Record</div>
            <button onClick={() => setEditMode(false)} className="text-xs text-gray-400 hover:text-gray-700 bg-transparent border-none cursor-pointer">✕ Cancel</button>
          </div>
          {(() => {
            const f = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            const l = "block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1"
            const field = (key: string, label: string, type = "text") => (
              <div key={key}>
                <label className={l}>{label}</label>
                <input
                  type={type}
                  value={editFields[key] ?? ""}
                  onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                  className={f}
                />
              </div>
            )
            const sel = (key: string, label: string, opts: string[]) => (
              <div key={key}>
                <label className={l}>{label}</label>
                <select
                  value={editFields[key] ?? ""}
                  onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                  className={f}
                >
                  <option value="">—</option>
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            )
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field("first_name",  "First Name")}
                {field("middle_name", "Middle Name")}
                {field("last_name",   "Last Name")}
                {field("dob",         "Date of Birth", "date")}
                {sel  ("sex",         "Sex",     ["Male", "Female", "Other"])}
                {sel  ("race",        "Race",    ["Black", "White", "Hispanic", "Asian", "Native American", "Other"])}
                {field("oln",         "Driver License # (OLN)")}
                {field("ssn",         "SSN (last 4)")}
                {field("ban_date",    "Ban Date", "date")}
                {field("banned_by",   "Banned By")}
                {field("community",   "Location / Community")}
                <div className="sm:col-span-2">
                  <label className={l}>Reason / Ban Notes</label>
                  <input value={editFields.reason ?? ""} onChange={e => setEditFields(p => ({ ...p, reason: e.target.value }))} className={f} />
                </div>
                <div className="sm:col-span-2">
                  <label className={l}>Officer Notes / Comments</label>
                  <textarea
                    rows={3}
                    value={editFields.notes ?? ""}
                    onChange={e => setEditFields(p => ({ ...p, notes: e.target.value }))}
                    className={f + " resize-y"}
                  />
                </div>
              </div>
            )
          })()}
          {editError && <div className="mt-3 text-xs text-red-600 font-medium">{editError}</div>}
          <div className="flex gap-2 mt-4">
            <button
              onClick={saveEdit}
              disabled={editSaving}
              className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg border-none cursor-pointer disabled:opacity-50"
            >
              {editSaving ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-600 text-sm rounded-lg cursor-pointer hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* NOTES */}
      <div className={sectionCls}>
        <h3 className="text-sm font-bold text-gray-800 mb-3">📝 Officer Notes <span className="text-gray-400 font-normal">({notes.length})</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <input  value={noteOfficer}  onChange={e => setNoteOfficer(e.target.value)}  placeholder="Officer name"           className={inputCls} />
          <select value={noteSeverity} onChange={e => setNoteSeverity(e.target.value)}                                       className={inputCls}>
            <option>LOW</option><option>MEDIUM</option><option>HIGH</option>
          </select>
          <button
            onClick={addNote}
            disabled={savingNote || !noteText.trim()}
            className="px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer disabled:opacity-50"
          >
            {savingNote ? "Adding…" : "+ Add Note"}
          </button>
        </div>
        <textarea
          rows={2}
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Note text…"
          className={textareaCls}
        />
        {noteError && <div className="text-xs text-red-600 mt-1">{noteError}</div>}

        {notes.length === 0 ? (
          <div className="text-sm text-gray-400 mt-4">No notes yet.</div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {notes.map(n => (
              <div key={n.id} className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50">
                <div className="flex justify-between items-start gap-2 flex-wrap mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {n.severity && (
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${SEVERITY_BADGE[n.severity] || "bg-gray-100 text-gray-700"}`}>
                        {n.severity}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{n.officer_name || "Unknown officer"}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{fmt(n.created_at)}</span>
                </div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{n.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FLAGS */}
      <div className={sectionCls}>
        <h3 className="text-sm font-bold text-gray-800 mb-3">🚩 Flags <span className="text-gray-400 font-normal">({flags.length})</span></h3>
        {flags.length === 0 ? (
          <div className="text-sm text-gray-400">No flags yet. Use the 🚩 Flag Person button above to add one.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {flags.map(f => (
              <div key={f.id} className="border border-amber-200 bg-amber-50 rounded-md px-3 py-2 flex justify-between items-center gap-2">
                <span className="text-sm text-amber-900">🚩 {f.reason || (f.flagged ? "Flagged" : "Unflagged")}</span>
                <span className="text-xs text-amber-700 shrink-0">{fmt(f.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* INCIDENTS */}
      <div className={sectionCls}>
        <h3 className="text-sm font-bold text-gray-800 mb-3">📄 Incident Reports <span className="text-gray-400 font-normal">({incidents.length})</span></h3>
        <div className="flex gap-2 mb-1">
          <input
            value={incidentText}
            onChange={e => setIncidentText(e.target.value)}
            placeholder="Quick incident report…"
            className={inputCls}
          />
          <button
            onClick={addIncident}
            disabled={savingIncident || !incidentText.trim()}
            className="px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-md border-none cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {savingIncident ? "Adding…" : "+ Add"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">For richer reports (date/location/type/follow-up), use <Link href="/userdash" className="text-blue-700 hover:text-blue-900">Officer Reports</Link>.</p>
        {incidentError && <div className="text-xs text-red-600 mt-1">{incidentError}</div>}

        {(() => {
          // Synthesize incident cards from watchlist record fields when no formal report exists
          const synth: Array<{ key: string; date: string; label: string; description: string }> = []
          if (person) {
            if (person.ban_date && person.reason) {
              synth.push({ key: "ban", date: person.ban_date, label: "Ban / Offense", description: person.reason })
            }
            // Parse "(YYYY-MM-DD): description" patterns embedded in comments
            const commentText = (person.comments || person.notes || "") as string
            const rx = /\((\d{4}-\d{2}-\d{2})\):\s*([^\n|]+)/g
            let m: RegExpExecArray | null
            let i = 0
            while ((m = rx.exec(commentText)) !== null) {
              const [, date, desc] = m
              // Skip if we already have a formal incident_report for this date
              if (!incidents.some(r => r.date === date)) {
                synth.push({ key: `c${i++}`, date, label: "Prior Incident", description: desc.trim() })
              }
            }
          }
          const synthCards = synth
            .filter(s => !incidents.some(r => r.date === s.date))
            .sort((a, b) => b.date.localeCompare(a.date))

          const total = incidents.length + synthCards.length
          if (total === 0) return <div className="text-sm text-gray-400 mt-4">No incident reports.</div>

          return (
            <div className="mt-4 flex flex-col gap-2">
              {incidents.map(r => (
                <div key={r.id} className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50">
                  <div className="flex justify-between items-start gap-2 flex-wrap mb-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
                      {r.incident_type && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-semibold uppercase rounded text-[10px]">
                          {r.incident_type}
                        </span>
                      )}
                      {r.officer_name && <span>{r.officer_name}</span>}
                      {r.location && <span>· 📍 {r.location}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">{r.date ? fmtDate(r.date) : fmt(r.created_at)}</span>
                      <Link href={`/vms/reports/incident/${r.id}`} className="text-xs text-blue-700 hover:text-blue-900 font-medium">View ↗</Link>
                    </div>
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{r.description || r.report || "—"}</div>
                </div>
              ))}
              {synthCards.map(s => (
                <div key={s.key} className="border border-amber-200 rounded-md px-3 py-2 bg-amber-50">
                  <div className="flex justify-between items-start gap-2 flex-wrap mb-1">
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-semibold uppercase rounded text-[10px]">{s.label}</span>
                    <span className="text-xs text-gray-400 shrink-0">{fmtDate(s.date)}</span>
                  </div>
                  <div className="text-sm text-gray-800">{s.description}</div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

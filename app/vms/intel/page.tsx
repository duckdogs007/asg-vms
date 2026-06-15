"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { VisitorLog, WatchlistEntry, Community } from "@/lib/types"
import { maskSSN } from "@/lib/format"
import { SignedImage } from "@/components/SignedImage"

function fmtDate(ts: string) {
  const s = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z"
  return new Date(s).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

// Filter helper. Single-word queries (parseName returns first === last)
// match first OR last name. Multi-word queries require both, like
// "John Doe" → first_name contains "john" AND last_name contains "doe".
function nameMatch(
  rec: { first_name?: string | null; last_name?: string | null },
  first: string,
  last: string
): boolean {
  const fn = (rec.first_name || "").toLowerCase()
  const ln = (rec.last_name  || "").toLowerCase()
  if (first === last) return fn.includes(first) || ln.includes(last)
  return fn.includes(first) && ln.includes(last)
}

// Bidirectional substring match: handles "Greg" ↔ "Gregory" mismatches
// between watchlist record and visitor log without missing the match.
function bidirContains(a: string, b: string): boolean {
  const x = a.toLowerCase().trim()
  const y = b.toLowerCase().trim()
  if (!x || !y) return false
  return x.includes(y) || y.includes(x)
}

// Used after the user confirms one specific Ban History candidate — narrows
// visit + contact history to records whose first AND last names match that
// candidate.
function matchesPersonRecord(
  rec: { first_name?: string | null; last_name?: string | null },
  person: { first_name?: string | null; last_name?: string | null }
): boolean {
  return bidirContains(rec.first_name || "", person.first_name || "")
      && bidirContains(rec.last_name  || "", person.last_name  || "")
}

// Photo upload validation — guard against arbitrarily large or non-image files.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB
function validatePhotoFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file (jpg, png, etc)."
  if (file.size > MAX_PHOTO_BYTES) return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`
  return null
}

interface PersonProfile {
  name: string
  // "review" = multiple watchlist matches; user must confirm which is the
  // actual person before the page treats them as barred.
  status: "barred" | "clear" | "review"
  visits: number
  last_seen: string | null
  oln: string | null
}

interface ContactRecord {
  id: string
  first_name: string
  last_name: string
  contacted_at: string
  location: string | null
  reason: string | null
  officer: string | null
  notes: string | null
  community_id: string | null
  sex: string | null
  race: string | null
  dob: string | null
  ssn: string | null
  oln: string | null
  address: string | null
  photo_url: string | null
}

type RightTab = "ban" | "visits" | "contacts" | "osint"

interface OsintSource {
  id:    string
  name:  string
  desc:  string
  icon:  string
  build: (q: string) => string
}

// Curated OSINT sources. Each opens the source's own search page with the
// query pre-filled. We never scrape — clicks just open in a new tab and log
// the click to osint_search_history for audit.
const OSINT_SOURCES: OsintSource[] = [
  {
    id:   "va_arrests",
    name: "Virginia Arrests",
    desc: "virginia.arrests.org — public arrest aggregator",
    icon: "🚓",
    build: q => `https://virginia.arrests.org/?ms_search=${encodeURIComponent(q)}`,
  },
  {
    id:   "va_courts",
    name: "VA Court Records",
    desc: "eapps.courts.state.va.us — district + circuit case search",
    icon: "⚖️",
    build: () => `https://eapps.courts.state.va.us/ocis/search`,
  },
  {
    id:   "henrico_jail",
    name: "Henrico Jail Inmate Search",
    desc: "henricosheriff.org — current inmate roster",
    icon: "🏛️",
    build: () => `https://henricosheriff.org/search/`,
  },
  {
    id:   "va_sor",
    name: "VA Sex Offender Registry",
    desc: "vspsor.com — Virginia State Police registry",
    icon: "📛",
    build: () => `https://vspsor.com/search`,
  },
  {
    id:   "google_arrest",
    name: "Google: name + arrest",
    desc: "Web search — \"NAME\" + arrest + Virginia",
    icon: "🔎",
    build: q => `https://www.google.com/search?q=%22${encodeURIComponent(q)}%22+arrest+Virginia`,
  },
  {
    id:   "google_news",
    name: "Google News",
    desc: "Recent news mentions",
    icon: "🗞️",
    build: q => `https://news.google.com/search?q=%22${encodeURIComponent(q)}%22+arrest+OR+wanted`,
  },
]

interface OsintHistoryRow {
  id:          string
  user_email:  string | null
  query:       string
  source:      string
  searched_at: string
}

export default function IntelPage() {

  const [search,         setSearch]         = useState("")
  const [selectedPerson, setSelectedPerson] = useState<PersonProfile | null>(null)
  const [banHistory,     setBanHistory]     = useState<WatchlistEntry[]>([])
  const [history,        setHistory]        = useState<VisitorLog[]>([])
  const [contacts,       setContacts]       = useState<ContactRecord[]>([])
  const [communities,    setCommunities]    = useState<Community[]>([])
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState("")
  const [rightTab,       setRightTab]       = useState<RightTab>("ban")

  const [photoUrl,       setPhotoUrl]       = useState("")
  const [uploading,      setUploading]      = useState(false)
  const [uploadError,    setUploadError]    = useState("")
  const [historyLimit,   setHistoryLimit]   = useState(25)
  // Tracks which Ban History card the user has confirmed as the actual
  // match when the search returns 2+ candidates. null = unconfirmed.
  const [confirmedBanId, setConfirmedBanId] = useState<string | null>(null)

  // OSINT tab state
  const [osintQuery,    setOsintQuery]    = useState("")
  const [osintHistory,  setOsintHistory]  = useState<OsintHistoryRow[]>([])
  const [osintExpanded, setOsintExpanded] = useState(false)

  const [showContactForm, setShowContactForm] = useState(false)
  const [ctDate,     setCtDate]     = useState(new Date().toISOString().split("T")[0])
  const [ctTime,     setCtTime]     = useState("")
  const [ctLocation, setCtLocation] = useState("")
  const [ctReason,   setCtReason]   = useState("")
  const [ctOfficer,  setCtOfficer]  = useState("")
  const [ctNotes,    setCtNotes]    = useState("")
  const [ctSex,      setCtSex]      = useState("")
  const [ctRace,     setCtRace]     = useState("")
  const [ctDob,      setCtDob]      = useState("")
  const [ctSsn,      setCtSsn]      = useState("")
  const [ctOln,      setCtOln]      = useState("")
  const [ctAddress,  setCtAddress]  = useState("")
  const [ctPhotoFile,    setCtPhotoFile]    = useState<File | null>(null)
  const [ctPhotoPreview, setCtPhotoPreview] = useState("")
  const [ctSaving,   setCtSaving]   = useState(false)
  const [ctError,    setCtError]    = useState("")
  const [ctMessage,  setCtMessage]  = useState("")

  useEffect(() => {
    loadCommunities()

    const params = new URLSearchParams(window.location.search)
    const s = params.get("search")
    if (s) {
      setSearch(s)
      handleSearch(s)
    }
  }, [])

  async function loadCommunities() {
    const { data, error } = await supabase.from("communities").select("id,name")
    if (!error && data) setCommunities(data)
  }

  function getCommunityName(id: string) {
    return communities.find(x => x.id === id)?.name || "Unknown"
  }

  function parseName(input: string) {
    const s = input.toLowerCase().trim()
    if (s.includes(",")) {
      const [last, first] = s.split(",").map(p => p.trim())
      return { first, last }
    }
    const parts = s.split(" ")
    return { first: parts[0] || "", last: parts[parts.length - 1] || "" }
  }

  async function handleSearch(term?: string) {
    const query = (term || search).trim()
    if (!query) return

    setLoading(true)
    setError("")
    setPhotoUrl("")

    try {
      const { first, last } = parseName(query)

      const { data: visits, error: visitErr } = await supabase
        .from("visitor_logs")
        .select("*")
        .or(`last_name.ilike.%${last}%,first_name.ilike.%${first}%`)
        .order("created_at", { ascending: false })

      if (visitErr) { setError("Failed to load visit history."); return }

      const visitData = (visits || []).filter((v: VisitorLog) => nameMatch(v, first, last))
      setHistory(visitData)
      setHistoryLimit(25)

      const { data: watch, error: watchErr } = await supabase
        .from("watchlist")
        .select("*")
        .or(`last_name.ilike.%${last}%,first_name.ilike.%${first}%`)

      if (watchErr) { setError("Failed to load watchlist data."); return }

      const watchMatches = (watch || []).filter((w: WatchlistEntry) => nameMatch(w, first, last))

      // 0 matches → clear. Exactly 1 → barred (treat as definitive).
      // 2+ matches → "review": don't auto-flag a specific person, let the
      // user pick which Ban History card is the actual match.
      const banStatus: "barred" | "clear" | "review" =
        watchMatches.length === 0 ? "clear"   :
        watchMatches.length === 1 ? "barred"  : "review"

      setSelectedPerson({
        name:      query,
        status:    banStatus,
        visits:    visitData.length,
        last_seen: visitData[0]?.created_at || null,
        oln:       watchMatches.length === 1 ? (watchMatches[0].oln || null) : null,
      })
      setOsintQuery(query)
      setBanHistory(watchMatches)
      setConfirmedBanId(null)

      // Load contact history
      const { data: contactData } = await supabase
        .from("contact_history")
        .select("*")
        .ilike("last_name", `%${last}%`)
        .order("contacted_at", { ascending: false })

      const filtered = (contactData || []).filter((c: ContactRecord) => nameMatch(c, first, last))
      setContacts(filtered)

      tryLoadPhoto(`${first}_${last}`)

    } finally {
      setLoading(false)
    }
  }

  async function saveContact() {
    if (!selectedPerson) return
    setCtSaving(true); setCtError(""); setCtMessage("")
    const { first, last } = parseName(selectedPerson.name)
    const contactedAt = ctDate && ctTime
      ? new Date(`${ctDate}T${ctTime}`).toISOString()
      : new Date(`${ctDate}T00:00:00`).toISOString()

    // Upload photo first if selected
    let photoUrl: string | null = null
    if (ctPhotoFile) {
      const ext  = ctPhotoFile.name.split(".").pop() || "jpg"
      const path = `${Date.now()}_${first}_${last}.${ext}`
      const { data: up, error: upErr } = await supabase.storage
        .from("contact-photos").upload(path, ctPhotoFile, { upsert: false })
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from("contact-photos").getPublicUrl(up.path)
        photoUrl = publicUrl
      }
    }

    const { error } = await supabase.from("contact_history").insert({
      first_name:   first.charAt(0).toUpperCase() + first.slice(1),
      last_name:    last.charAt(0).toUpperCase() + last.slice(1),
      contacted_at: contactedAt,
      location:     ctLocation || null,
      reason:       ctReason   || null,
      officer:      ctOfficer  || null,
      notes:        ctNotes    || null,
      sex:          ctSex      || null,
      race:         ctRace     || null,
      dob:          ctDob      || null,
      ssn:          ctSsn      || null,
      oln:          ctOln      || null,
      address:      ctAddress  || null,
      photo_url:    photoUrl,
    })
    setCtSaving(false)
    if (error) { setCtError("Failed to save: " + error.message); return }
    setCtMessage("✅ Contact logged.")
    setCtLocation(""); setCtReason(""); setCtOfficer(""); setCtNotes("")
    setCtSex(""); setCtRace(""); setCtDob(""); setCtSsn(""); setCtOln(""); setCtAddress("")
    setCtPhotoFile(null); setCtPhotoPreview("")
    setCtDate(new Date().toISOString().split("T")[0]); setCtTime("")
    setShowContactForm(false)
    handleSearch()
  }

  function confirmBanMatch(b: WatchlistEntry) {
    setConfirmedBanId(b.id)
    // Recompute visits + last_seen based on the confirmed person so the
    // left-panel stats reflect THIS Greg, not the union of all "Perkins".
    const personVisits = history.filter(v => matchesPersonRecord(v, b))
    setSelectedPerson(prev => prev ? {
      ...prev,
      status:    "barred",
      oln:       b.oln || null,
      visits:    personVisits.length,
      last_seen: personVisits[0]?.created_at || null,
    } : null)
  }

  async function tryLoadPhoto(slug: string) {
    try {
      const { data, error } = await supabase.storage
        .from("photos")
        .list("", { search: slug })
      if (error || !data) return
      // Find any file whose name starts with the slug (handles png/jpeg/etc
      // and timestamp-suffixed filenames). Pick the lexicographically newest
      // (which corresponds to the most-recent timestamp suffix when present).
      const match = data
        .filter(f => f.name.startsWith(slug))
        .sort((a, b) => b.name.localeCompare(a.name))[0]
      if (!match) return
      const { data: { publicUrl } } = supabase.storage
        .from("photos")
        .getPublicUrl(match.name)
      setPhotoUrl(publicUrl)
    } catch {}
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedPerson) return
    const validationErr = validatePhotoFile(file)
    if (validationErr) { setUploadError(validationErr); return }

    setUploading(true)
    setUploadError("")

    try {
      const { first, last } = parseName(selectedPerson.name)
      const slug = `${first}_${last}`
      const ext  = file.name.split(".").pop() || "jpg"
      // Timestamp suffix prevents collisions when two unrelated people share
      // a first+last name. tryLoadPhoto sorts matches descending so the most
      // recent upload wins.
      const path = `${slug}_${Date.now()}.${ext}`

      const { data, error } = await supabase.storage
        .from("photos")
        .upload(path, file, { upsert: true })

      if (error) { setUploadError("Upload failed: " + error.message); return }

      const { data: { publicUrl } } = supabase.storage
        .from("photos")
        .getPublicUrl(data.path)

      setPhotoUrl(publicUrl)
    } finally {
      setUploading(false)
    }
  }

  async function loadOsintHistory(query?: string) {
    let q = supabase.from("osint_search_history").select("*")
      .order("searched_at", { ascending: false }).limit(20)
    if (query) q = q.ilike("query", query)
    const { data } = await q
    setOsintHistory(data || [])
  }

  async function fireOsint(src: OsintSource) {
    const query = osintQuery.trim()
    if (!query) { setError("Enter a name to search."); return }
    const url = src.build(query)

    // Open in a new tab right away so the popup blocker doesn't fire
    window.open(url, "_blank", "noopener,noreferrer")

    // Log fire-and-forget
    const { data: { user } } = await supabase.auth.getUser()
    supabase.from("osint_search_history").insert({
      user_email: user?.email || null,
      query,
      source:     src.id,
      source_url: url,
    }).then(({ error }) => {
      if (error) console.error("[osint] history insert failed:", error)
      else loadOsintHistory()
    })
  }

  useEffect(() => {
    if (rightTab === "osint") loadOsintHistory()
  }, [rightTab])

  const tabCls = (t: RightTab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
      rightTab === t
        ? "border-blue-700 text-blue-700"
        : "border-transparent text-gray-500 hover:text-gray-800"
    }`

  // Narrow visits + contacts to the confirmed Ban History candidate when the
  // user picks one. With no confirmation (single match or unconfirmed multi),
  // show the full unfiltered set.
  const confirmedMatch = confirmedBanId
    ? banHistory.find(b => b.id === confirmedBanId) || null
    : null
  const displayedHistory  = confirmedMatch ? history.filter(v  => matchesPersonRecord(v, confirmedMatch))  : history
  const displayedContacts = confirmedMatch ? contacts.filter(c => matchesPersonRecord(c, confirmedMatch)) : contacts
  const isAmbiguous       = banHistory.length > 1 && !confirmedMatch

  return (
    <div className="p-5">

      <h2 className="text-2xl font-bold mb-4">Intel Terminal</h2>

      {/* SEARCH */}
      <div className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search name, unit, or OLN"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          onClick={() => handleSearch()}
          disabled={loading}
          className="px-4 py-2 bg-blue-800 text-white text-sm rounded-md hover:bg-blue-900 transition-colors border-none cursor-pointer disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* STATUS HEADER */}
      {selectedPerson && (
        <div className={`px-4 py-3 rounded-lg text-white font-bold mb-4 ${
          selectedPerson.status === "barred" ? "bg-red-900" :
          selectedPerson.status === "review" ? "bg-amber-700" :
          "bg-gray-900"
        }`}>
          {selectedPerson.name.toUpperCase()}
          {selectedPerson.oln && <span className="font-normal ml-2">🛂 {selectedPerson.oln}</span>}
          {selectedPerson.status === "barred" && <span className="ml-2">🚨 BARRED</span>}
          {selectedPerson.status === "review" && (
            <span className="ml-2 font-normal">⚠️ {banHistory.length} POSSIBLE MATCHES — VERIFY BELOW</span>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5 lg:gap-8">

        {/* LEFT PANEL */}
        <div className="w-full lg:w-72 lg:flex-shrink-0">

          <div className="w-48 h-56 bg-gray-800 rounded-lg mb-3 overflow-hidden flex items-center justify-center">
            {photoUrl ? (
              <SignedImage src={photoUrl} bucket="photos" alt="Visitor photo" className="w-full h-full object-cover" ttl={3600} />
            ) : (
              <span className="text-gray-500 text-xs">No photo</span>
            )}
          </div>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {uploading ? "Uploading..." : "Upload Photo"}
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={uploading || !selectedPerson}
              className="text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 disabled:opacity-50"
            />
            {uploadError && <p className="text-red-600 text-xs mt-1">{uploadError}</p>}
          </div>

          {selectedPerson && (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-gray-900 capitalize">{selectedPerson.name}</h3>
              <div className="text-sm">
                Status:{" "}
                <span className={`font-bold ${
                  selectedPerson.status === "barred" ? "text-red-600" :
                  selectedPerson.status === "review" ? "text-amber-600" :
                  "text-green-600"
                }`}>
                  {selectedPerson.status}
                </span>
              </div>
              <div className="text-sm text-gray-700">Total Visits: <strong>{selectedPerson.visits}</strong></div>
              <div className="text-sm text-gray-700">
                Last Seen:{" "}
                {selectedPerson.last_seen ? fmtDate(selectedPerson.last_seen) : "—"}
              </div>
              {contacts.length > 0 && (
                <div className="text-sm text-gray-700">Field Contacts: <strong>{contacts.length}</strong></div>
              )}
            </div>
          )}

          {!selectedPerson && !loading && (
            <p className="text-sm text-gray-400 italic">Search a name to load profile.</p>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1">

          {/* TABS */}
          <div className="flex border-b border-gray-200 mb-4">
            <button className={tabCls("ban")}      onClick={() => setRightTab("ban")}>🚨 Ban History</button>
            <button className={tabCls("visits")}   onClick={() => setRightTab("visits")}>📊 Visitor History</button>
            <button className={tabCls("contacts")} onClick={() => setRightTab("contacts")}>
              📋 Contact History
              {contacts.length > 0 && (
                <span className="ml-1.5 bg-blue-700 text-white text-xs rounded-full px-1.5 py-0.5">{contacts.length}</span>
              )}
            </button>
            <button className={tabCls("osint")} onClick={() => setRightTab("osint")}>🌐 OSINT</button>
          </div>

          {/* BAN HISTORY TAB */}
          {rightTab === "ban" && (
            <>
              {banHistory.length > 0 ? banHistory.map((b) => {
                const multi = banHistory.length > 1
                const confirmed = confirmedBanId === b.id
                return (
                  <div
                    key={b.id}
                    className={`px-4 py-3 rounded-lg mb-3 ${
                      confirmed
                        ? "bg-red-100 border-2 border-red-500"
                        : "bg-red-50 border border-red-200"
                    }`}
                  >
                    <div className="font-bold text-red-700 mb-2">🚨 {b.reason || "WATCHLIST ENTRY"}</div>
                    <div className="flex flex-col gap-1 text-sm text-gray-700">
                      <span><span className="text-gray-500">Name:</span> {b.first_name} {b.last_name}</span>
                      {b.dob  && <span><span className="text-gray-500">DOB:</span> {b.dob}</span>}
                      {b.oln  && <span><span className="text-gray-500">OLN:</span> {b.oln}</span>}
                      {b.ssn  && <span><span className="text-gray-500">SSN:</span> {maskSSN(b.ssn)}</span>}
                      {b.sex  && <span><span className="text-gray-500">Sex:</span> {b.sex}</span>}
                      {b.race && <span><span className="text-gray-500">Race:</span> {b.race}</span>}
                      {(b.notes || b.comments) && <span><span className="text-gray-500">Notes:</span> {b.notes || b.comments}</span>}
                      <span><span className="text-gray-500">Date Banned:</span> {b.ban_date || b.banned_date || b.date_banned || "Unknown"}</span>
                      <span><span className="text-gray-500">Banned By:</span> {b.flagged_by || b.banned_by || "Unknown"}</span>
                    </div>
                    {multi && (
                      <button
                        onClick={() => confirmBanMatch(b)}
                        className={`mt-3 px-3 py-1.5 text-xs font-semibold rounded border-none cursor-pointer ${
                          confirmed
                            ? "bg-red-700 text-white"
                            : "bg-white text-red-700 border border-red-300 hover:bg-red-50"
                        }`}
                      >
                        {confirmed ? "✓ This is the match" : "Confirm this is the person"}
                      </button>
                    )}
                  </div>
                )
              }) : (
                <p className="text-sm text-gray-500">No ban history.</p>
              )}
            </>
          )}

          {/* VISITOR HISTORY TAB */}
          {rightTab === "visits" && (
            <>
              {isAmbiguous && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 mb-3 text-xs">
                  Showing visits for <strong>all {banHistory.length} candidates</strong>. Confirm a match in the Ban History tab to narrow this list.
                </div>
              )}
              {displayedHistory.length > 0 ? (
                <>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {displayedHistory.length > historyLimit
                      ? `${historyLimit} of ${displayedHistory.length} visits`
                      : `${displayedHistory.length} visit${displayedHistory.length === 1 ? "" : "s"}`}
                  </div>
                  {displayedHistory.slice(0, historyLimit).map((v) => (
                    <div key={v.id} className="bg-white border border-gray-200 px-4 py-3 rounded-lg mb-2 hover:border-gray-300 transition-colors">
                      <div className="font-semibold text-gray-900">{v.first_name} {v.last_name}
                        <span className="text-gray-500 font-normal ml-2 text-sm">({v.person_type})</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5">
                        {getCommunityName(v.community_id || "")} · Unit: {v.unit_number || "N/A"}
                        {v.resident_name && ` · Visiting: ${v.resident_name}`}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(v.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {displayedHistory.length > historyLimit && (
                    <button
                      onClick={() => setHistoryLimit(l => l + 25)}
                      className="mt-2 w-full py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer bg-white"
                    >
                      Show more ({displayedHistory.length - historyLimit} remaining)
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  {selectedPerson ? "No visit history found." : ""}
                </p>
              )}
            </>
          )}

          {/* CONTACT HISTORY TAB */}
          {rightTab === "contacts" && (
            <>
              {/* ADD CONTACT BUTTON / FORM */}
              {selectedPerson && !showContactForm && (
                <div className="mb-4 flex items-center gap-3">
                  <button
                    onClick={() => { setShowContactForm(true); setCtMessage("") }}
                    className="px-4 py-2 bg-blue-800 text-white text-sm rounded-lg hover:bg-blue-900 border-none cursor-pointer"
                  >
                    + Log Field Contact
                  </button>
                  {ctMessage && <span className="text-green-600 text-sm">{ctMessage}</span>}
                </div>
              )}

              {showContactForm && selectedPerson && (
                <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 mb-4">
                  <h4 className="font-semibold text-gray-800 mb-3">
                    New Field Contact — {selectedPerson.name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                  </h4>
                  {(() => {
                    const f = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    const lbl = "block text-xs font-semibold text-gray-600 mb-1"
                    return (
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div><label className={lbl}>Date</label>
                          <input type="date" value={ctDate} onChange={e => setCtDate(e.target.value)} className={f} /></div>
                        <div><label className={lbl}>Time</label>
                          <input type="time" value={ctTime} onChange={e => setCtTime(e.target.value)} className={f} /></div>
                        <div><label className={lbl}>DOB</label>
                          <input type="date" value={ctDob} onChange={e => setCtDob(e.target.value)} className={f} /></div>
                        <div><label className={lbl}>Sex</label>
                          <select value={ctSex} onChange={e => setCtSex(e.target.value)} className={f}>
                            <option value="">—</option>
                            <option>Male</option><option>Female</option><option>Other</option>
                          </select></div>
                        <div><label className={lbl}>Race</label>
                          <select value={ctRace} onChange={e => setCtRace(e.target.value)} className={f}>
                            <option value="">—</option>
                            <option>Black</option><option>White</option><option>Hispanic</option>
                            <option>Asian</option><option>Native American</option><option>Other</option>
                          </select></div>
                        <div><label className={lbl}>OLN (Driver License #)</label>
                          <input value={ctOln} onChange={e => setCtOln(e.target.value)} className={f} /></div>
                        <div><label className={lbl}>SSN (last 4)</label>
                          <input value={ctSsn} onChange={e => setCtSsn(e.target.value)} placeholder="XXXX" maxLength={9} className={f} /></div>
                        <div><label className={lbl}>Location</label>
                          <input value={ctLocation} onChange={e => setCtLocation(e.target.value)} placeholder="e.g. Building 3, Parking Lot" className={f} /></div>
                        <div className="col-span-2"><label className={lbl}>Address</label>
                          <input value={ctAddress} onChange={e => setCtAddress(e.target.value)} placeholder="Street address" className={f} /></div>
                        <div><label className={lbl}>Reason / Type</label>
                          <input value={ctReason} onChange={e => setCtReason(e.target.value)} placeholder="e.g. Trespassing, Suspicious Activity" className={f} /></div>
                        <div><label className={lbl}>Officer</label>
                          <input value={ctOfficer} onChange={e => setCtOfficer(e.target.value)} className={f} /></div>
                        <div className="col-span-2"><label className={lbl}>Notes</label>
                          <textarea rows={3} value={ctNotes} onChange={e => setCtNotes(e.target.value)}
                            placeholder="Details of the contact..." className={f + " resize-none"} /></div>

                        {/* PHOTO */}
                        <div className="col-span-2">
                          <label className={lbl}>Person Photo</label>
                          <div className="flex items-start gap-4">
                            <div className="w-28 h-32 bg-gray-200 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-300">
                              {ctPhotoPreview
                                ? <img src={ctPhotoPreview} alt="preview" className="w-full h-full object-cover" />
                                : <span className="text-gray-400 text-xs text-center px-1">No photo</span>}
                            </div>
                            <div className="flex-1">
                              <input type="file" accept="image/*"
                                onChange={e => {
                                  const file = e.target.files?.[0] || null
                                  if (file) {
                                    const v = validatePhotoFile(file)
                                    if (v) { setCtError(v); return }
                                  }
                                  setCtError("")
                                  setCtPhotoFile(file)
                                  setCtPhotoPreview(file ? URL.createObjectURL(file) : "")
                                }}
                                className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 cursor-pointer" />
                              <p className="text-xs text-gray-400 mt-1">JPG, PNG accepted</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  {ctError && <p className="text-red-600 text-sm mb-2">{ctError}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveContact} disabled={ctSaving}
                      className="px-4 py-2 bg-blue-800 text-white text-sm rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
                      {ctSaving ? "Saving..." : "Save Contact"}
                    </button>
                    <button onClick={() => { setShowContactForm(false); setCtPhotoPreview(""); setCtPhotoFile(null) }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 border-none cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isAmbiguous && displayedContacts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 mb-3 text-xs">
                  Showing contacts for <strong>all {banHistory.length} candidates</strong>. Confirm a match in the Ban History tab to narrow this list.
                </div>
              )}
              {displayedContacts.length > 0 ? displayedContacts.map((c) => (
                <div key={c.id} className="border border-gray-200 rounded-lg px-4 py-3 mb-3 bg-white">
                  <div className="flex gap-3">
                    {c.photo_url && (
                      <SignedImage src={c.photo_url} bucket="contact-photos" alt="contact" className="w-16 h-20 object-cover rounded-md flex-shrink-0 border border-gray-200" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-semibold text-gray-900 text-sm">{c.reason || "Field Contact"}</div>
                        <div className="text-xs text-gray-400 ml-2 flex-shrink-0">{new Date(c.contacted_at).toLocaleString()}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600 mb-1">
                        {c.sex      && <span>Sex: {c.sex}</span>}
                        {c.race     && <span>Race: {c.race}</span>}
                        {c.dob      && <span>DOB: {c.dob}</span>}
                        {c.oln      && <span>OLN: {c.oln}</span>}
                        {c.ssn      && <span>SSN: {maskSSN(c.ssn)}</span>}
                        {c.location && <span>📍 {c.location}</span>}
                        {c.address  && <span className="col-span-2">Address: {c.address}</span>}
                      </div>
                      {c.officer && <div className="text-xs text-gray-500">Officer: {c.officer}</div>}
                      {c.notes   && <div className="text-sm text-gray-700 mt-2 border-t border-gray-100 pt-2">{c.notes}</div>}
                    </div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm">
                    {selectedPerson ? "No contact history on record." : "Search a person to view contact history."}
                  </div>
                </div>
              )}
            </>
          )}

          {/* OSINT TAB */}
          {rightTab === "osint" && (
            <>
              <div className="mb-3 bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <div>
                  <span className="font-bold">Verify first!</span> Web source information may not be accurate or up to date. Treat results as investigative leads — confirm against primary records before acting.
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Search query</label>
                <div className="flex gap-2">
                  <input
                    value={osintQuery}
                    onChange={e => setOsintQuery(e.target.value)}
                    placeholder="Name to search across public sources"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  />
                  <button
                    onClick={() => loadOsintHistory(osintQuery.trim() || undefined)}
                    className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold rounded-md border-none cursor-pointer"
                  >
                    Filter History
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Each click opens the source in a new tab and logs the search to the audit trail. We never scrape or store the source's content — these are pivot links.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                {OSINT_SOURCES.map(src => (
                  <button
                    key={src.id}
                    onClick={() => fireOsint(src)}
                    disabled={!osintQuery.trim()}
                    className="text-left bg-white border border-gray-200 hover:border-blue-500 hover:shadow-md rounded-lg p-3 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xl shrink-0">{src.icon}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">{src.name}</div>
                        <div className="text-xs text-gray-500 leading-snug">{src.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                  <span>Recent Searches</span>
                  <button onClick={() => loadOsintHistory()} className="text-blue-700 hover:text-blue-900 normal-case font-medium border-none bg-transparent cursor-pointer">↻ Refresh</button>
                </div>
                {osintHistory.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">No OSINT searches logged yet.</div>
                ) : (
                  <>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">When</th>
                          <th className="px-3 py-2 text-left">Query</th>
                          <th className="px-3 py-2 text-left">Source</th>
                          <th className="px-3 py-2 text-left">User</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(osintExpanded ? osintHistory : osintHistory.slice(0, 5)).map(h => (
                          <tr key={h.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{fmtDate(h.searched_at)}</td>
                            <td className="px-3 py-2 font-medium">{h.query}</td>
                            <td className="px-3 py-2 text-gray-700 text-xs">{h.source}</td>
                            <td className="px-3 py-2 text-gray-500 text-xs">{h.user_email || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {osintHistory.length > 5 && (
                      <button
                        onClick={() => setOsintExpanded(v => !v)}
                        className="w-full text-center px-3 py-2 bg-gray-50 hover:bg-gray-100 text-blue-700 hover:text-blue-900 text-xs font-semibold border-t border-gray-200 cursor-pointer transition-colors"
                      >
                        {osintExpanded
                          ? `▴ Show Less`
                          : `▾ Click for more — ${osintHistory.length - 5} additional`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { VisitorLog, WatchlistEntry, Community } from "@/lib/types"

interface PersonProfile {
  name: string
  status: "barred" | "clear"
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
}

type RightTab = "ban" | "visits" | "contacts"

export default function IntelPage() {

  const [search,         setSearch]         = useState("")
  const [selectedPerson, setSelectedPerson] = useState<PersonProfile | null>(null)
  const [banHistory,     setBanHistory]     = useState<WatchlistEntry[]>([])
  const [history,        setHistory]        = useState<VisitorLog[]>([])
  const [contacts,       setContacts]       = useState<ContactRecord[]>([])
  const [communities,    setCommunities]    = useState<Community[]>([])
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState("")
  const [rightTab,       setRightTab]       = useState<RightTab>("visits")

  const [photoUrl,   setPhotoUrl]   = useState("")
  const [uploading,  setUploading]  = useState(false)
  const [uploadError,setUploadError]= useState("")

  const [showContactForm, setShowContactForm] = useState(false)
  const [ctDate,     setCtDate]     = useState(new Date().toISOString().split("T")[0])
  const [ctTime,     setCtTime]     = useState("")
  const [ctLocation, setCtLocation] = useState("")
  const [ctReason,   setCtReason]   = useState("")
  const [ctOfficer,  setCtOfficer]  = useState("")
  const [ctNotes,    setCtNotes]    = useState("")
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

      const visitData = (visits || []).filter((v: VisitorLog) =>
        v.first_name?.toLowerCase().includes(first) &&
        v.last_name?.toLowerCase().includes(last)
      )
      setHistory(visitData)

      const { data: watch, error: watchErr } = await supabase
        .from("watchlist")
        .select("*")
        .or(`last_name.ilike.%${last}%,first_name.ilike.%${first}%`)

      if (watchErr) { setError("Failed to load watchlist data."); return }

      const watchMatch = (watch || []).find((w: WatchlistEntry) =>
        w.first_name?.toLowerCase().includes(first) &&
        w.last_name?.toLowerCase().includes(last)
      ) || null

      setSelectedPerson({
        name: query,
        status: watchMatch ? "barred" : "clear",
        visits: visitData.length,
        last_seen: visitData[0]?.created_at || null,
        oln: watchMatch?.oln || null
      })
      setBanHistory(watchMatch ? [watchMatch] : [])

      // Load contact history
      const { data: contactData } = await supabase
        .from("contact_history")
        .select("*")
        .ilike("last_name", `%${last}%`)
        .order("contacted_at", { ascending: false })

      const filtered = (contactData || []).filter((c: ContactRecord) =>
        c.first_name?.toLowerCase().includes(first) &&
        c.last_name?.toLowerCase().includes(last)
      )
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
    const { error } = await supabase.from("contact_history").insert({
      first_name:   first.charAt(0).toUpperCase() + first.slice(1),
      last_name:    last.charAt(0).toUpperCase() + last.slice(1),
      contacted_at: contactedAt,
      location:     ctLocation || null,
      reason:       ctReason   || null,
      officer:      ctOfficer  || null,
      notes:        ctNotes    || null,
    })
    setCtSaving(false)
    if (error) { setCtError("Failed to save: " + error.message); return }
    setCtMessage("✅ Contact logged.")
    setCtLocation(""); setCtReason(""); setCtOfficer(""); setCtNotes("")
    setCtDate(new Date().toISOString().split("T")[0]); setCtTime("")
    setShowContactForm(false)
    // Refresh contacts
    handleSearch()
  }

  function tryLoadPhoto(slug: string) {
    const { data } = supabase.storage
      .from("visitor-photos")
      .getPublicUrl(`${slug}.jpg`)
    if (data?.publicUrl) setPhotoUrl(data.publicUrl)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedPerson) return

    setUploading(true)
    setUploadError("")

    try {
      const { first, last } = parseName(selectedPerson.name)
      const slug = `${first}_${last}`
      const ext  = file.name.split(".").pop() || "jpg"
      const path = `${slug}.${ext}`

      const { data, error } = await supabase.storage
        .from("visitor-photos")
        .upload(path, file, { upsert: true })

      if (error) { setUploadError("Upload failed: " + error.message); return }

      const { data: { publicUrl } } = supabase.storage
        .from("visitor-photos")
        .getPublicUrl(data.path)

      setPhotoUrl(publicUrl)
    } finally {
      setUploading(false)
    }
  }

  const tabCls = (t: RightTab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
      rightTab === t
        ? "border-blue-700 text-blue-700"
        : "border-transparent text-gray-500 hover:text-gray-800"
    }`

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
        <div className={`px-4 py-3 rounded-lg text-white font-bold mb-4 ${selectedPerson.status === "barred" ? "bg-red-900" : "bg-gray-900"}`}>
          {selectedPerson.name.toUpperCase()}
          {selectedPerson.oln && <span className="font-normal ml-2">🪪 {selectedPerson.oln}</span>}
          {selectedPerson.status === "barred" && <span className="ml-2">🚨 BARRED</span>}
        </div>
      )}

      <div className="flex gap-8">

        {/* LEFT PANEL */}
        <div className="w-72 flex-shrink-0">

          <div className="w-48 h-56 bg-gray-800 rounded-lg mb-3 overflow-hidden flex items-center justify-center">
            {photoUrl ? (
              <img src={photoUrl} alt="Visitor photo" className="w-full h-full object-cover" onError={() => setPhotoUrl("")} />
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
                <span className={`font-bold ${selectedPerson.status === "barred" ? "text-red-600" : "text-green-600"}`}>
                  {selectedPerson.status}
                </span>
              </div>
              <div className="text-sm text-gray-700">Total Visits: <strong>{selectedPerson.visits}</strong></div>
              <div className="text-sm text-gray-700">
                Last Seen:{" "}
                {selectedPerson.last_seen ? new Date(selectedPerson.last_seen).toLocaleString() : "—"}
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
          </div>

          {/* BAN HISTORY TAB */}
          {rightTab === "ban" && (
            <>
              {banHistory.length > 0 ? banHistory.map((b, i) => (
                <div key={i} className="bg-gray-900 text-white px-4 py-3 rounded-lg mb-3">
                  <div className="font-bold text-red-400 mb-2">🚨 {b.reason || "WATCHLIST ENTRY"}</div>
                  <div className="flex flex-col gap-1 text-sm text-gray-300">
                    <span>Name: {b.first_name} {b.last_name}</span>
                    {b.dob  && <span>DOB: {b.dob}</span>}
                    {b.oln  && <span>OLN: {b.oln}</span>}
                    {b.sex  && <span>Sex: {b.sex}</span>}
                    {b.race && <span>Race: {b.race}</span>}
                    {(b.notes || b.comments) && <span>Notes: {b.notes || b.comments}</span>}
                    <span>Date Banned: {b.ban_date || b.banned_date || b.date_banned || "Unknown"}</span>
                    <span className="opacity-60">Banned By: {b.flagged_by || b.banned_by || "Unknown"}</span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-gray-500">No ban history.</p>
              )}
            </>
          )}

          {/* VISITOR HISTORY TAB */}
          {rightTab === "visits" && (
            <>
              {history.length > 0 ? history.map((v) => (
                <div key={v.id} className="bg-gray-900 text-white px-4 py-3 rounded-lg mb-2">
                  <div className="font-medium">{v.first_name} {v.last_name}
                    <span className="text-gray-400 font-normal ml-2 text-sm">({v.person_type})</span>
                  </div>
                  <div className="text-sm text-gray-400 mt-0.5">
                    {getCommunityName(v.community_id || "")} · Unit: {v.unit_number || "N/A"}
                    {(v as any).resident_name && ` · Visiting: ${(v as any).resident_name}`}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(v.created_at).toLocaleString()}
                  </div>
                </div>
              )) : (
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
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                      <input type="date" value={ctDate} onChange={e => setCtDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Time</label>
                      <input type="time" value={ctTime} onChange={e => setCtTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
                      <input value={ctLocation} onChange={e => setCtLocation(e.target.value)}
                        placeholder="e.g. Building 3, Parking Lot"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Reason / Type</label>
                      <input value={ctReason} onChange={e => setCtReason(e.target.value)}
                        placeholder="e.g. Trespassing, Suspicious Activity"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Officer</label>
                      <input value={ctOfficer} onChange={e => setCtOfficer(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                      <textarea rows={3} value={ctNotes} onChange={e => setCtNotes(e.target.value)}
                        placeholder="Details of the contact..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white resize-none" />
                    </div>
                  </div>
                  {ctError && <p className="text-red-600 text-sm mb-2">{ctError}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveContact} disabled={ctSaving}
                      className="px-4 py-2 bg-blue-800 text-white text-sm rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50">
                      {ctSaving ? "Saving..." : "Save Contact"}
                    </button>
                    <button onClick={() => setShowContactForm(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 border-none cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {contacts.length > 0 ? contacts.map((c) => (
                <div key={c.id} className="border border-gray-200 rounded-lg px-4 py-3 mb-2 bg-white">
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-semibold text-gray-900 text-sm">
                      {c.reason || "Field Contact"}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(c.contacted_at).toLocaleString()}
                    </div>
                  </div>
                  {c.location && (
                    <div className="text-sm text-gray-600">📍 {c.location}</div>
                  )}
                  {c.officer && (
                    <div className="text-xs text-gray-500 mt-1">Officer: {c.officer}</div>
                  )}
                  {c.notes && (
                    <div className="text-sm text-gray-700 mt-2 border-t border-gray-100 pt-2">
                      {c.notes}
                    </div>
                  )}
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

        </div>
      </div>
    </div>
  )
}

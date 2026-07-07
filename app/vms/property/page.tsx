"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { checkCanEditPropertyHub, checkCanIssueLeaseViolation, checkIsAdmin } from "@/lib/admin"
import PostOrdersTab from "@/components/PostOrdersTab"
import RentRollTab from "@/components/RentRollTab"
import UnitActivityTab from "@/components/UnitActivityTab"
import LeaseViolationsTab from "@/components/LeaseViolationsTab"
import { SignedLink } from "@/components/SignedImage"

interface Community {
  id: string; name: string
  address: string | null; phone: string | null; jurisdiction: string | null
}
interface Contact  { id: string; role: string | null; name: string | null; phone: string | null; email: string | null }
interface Doc      { id: string; title: string | null; doc_type: string | null; file_url: string; created_at: string }
interface Vehicle  {
  id: string; kind: string
  plate: string | null; plate_state: string | null
  make: string | null; model: string | null; color: string | null; year: string | null
  resident_name: string | null; unit: string | null; permit_number: string | null
  sponsor_resident: string | null; visitor_pass: string | null; valid_from: string | null; valid_to: string | null
  notes: string | null
}

type Tab = "post-orders" | "info" | "documents" | "vehicles" | "rentroll" | "history" | "violations"
const DOC_TYPES = ["Lease", "House Rules", "Property Map", "Floor Plan", "Other"]

const inputCls    = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
const labelCls    = "block text-xs font-semibold text-gray-600 mb-1"
const btnPrimary  = "px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 border-none cursor-pointer disabled:opacity-50"
const btnGhost    = "px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 border-none cursor-pointer"
const btnDanger   = "px-3 py-1.5 bg-red-700 text-white text-xs font-semibold rounded-lg hover:bg-red-800 border-none cursor-pointer"

export default function PropertyHubPage() {
  const [communities, setCommunities] = useState<Community[]>([])
  const [communityId, setCommunityId] = useState("")
  const [tab,         setTab]         = useState<Tab>("post-orders")
  const [canEdit,     setCanEdit]     = useState(false)
  const [canIssueViolation, setCanIssueViolation] = useState(false)
  const [canDeleteViolation, setCanDeleteViolation] = useState(false)
  const [userEmail,   setUserEmail]   = useState("")
  const [msg,         setMsg]         = useState("")

  // Info
  const [editInfo,   setEditInfo]   = useState(false)
  const [infoForm,   setInfoForm]   = useState({ address: "", phone: "", jurisdiction: "" })
  const [contacts,   setContacts]   = useState<Contact[]>([])
  const [newContact, setNewContact] = useState({ role: "", name: "", phone: "", email: "" })

  // Documents
  const [docs,        setDocs]        = useState<Doc[]>([])
  const [docTitle,    setDocTitle]    = useState("")
  const [docType,     setDocType]     = useState(DOC_TYPES[0])
  const [docFile,     setDocFile]     = useState<File | null>(null)
  const [uploading,   setUploading]   = useState(false)

  // Vehicles
  const [vehicles,   setVehicles]   = useState<Vehicle[]>([])
  const [vKind,      setVKind]      = useState<"resident" | "visitor">("resident")
  const [vForm,      setVForm]      = useState<Partial<Vehicle>>({})
  const [editVid,    setEditVid]    = useState<string | null>(null)
  const [showVForm,  setShowVForm]  = useState(false)

  const community = communities.find(c => c.id === communityId)

  useEffect(() => {
    checkCanEditPropertyHub().then(setCanEdit).catch(() => setCanEdit(false))
    checkCanIssueLeaseViolation().then(setCanIssueViolation).catch(() => setCanIssueViolation(false))
    checkIsAdmin().then(setCanDeleteViolation).catch(() => setCanDeleteViolation(false))
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || ""))
    supabase.from("communities").select("id, name, address, phone, jurisdiction").order("name").then(({ data }) => {
      const list = (data as Community[]) || []
      setCommunities(list)
      const saved = typeof window !== "undefined" ? localStorage.getItem("asg-current-community-id") || "" : ""
      const chosen = list.find(c => c.id === saved) || list[0]
      if (chosen) setCommunityId(chosen.id)
    })
  }, [])

  useEffect(() => {
    if (!communityId) return
    setInfoForm({
      address:      community?.address || "",
      phone:        community?.phone || "",
      jurisdiction: community?.jurisdiction || "",
    })
    loadContacts(); loadDocs(); loadVehicles()
    setEditInfo(false); setShowVForm(false); setEditVid(null); setMsg("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId])

  function selectCommunity(id: string) {
    setCommunityId(id)
    const c = communities.find(x => x.id === id)
    if (typeof window !== "undefined") {
      localStorage.setItem("asg-current-community-id", id)
      if (c) localStorage.setItem("asg-current-community-name", c.name)
    }
  }

  // ── Community Info ──
  async function loadContacts() {
    const { data } = await supabase.from("community_contacts").select("*")
      .eq("community_id", communityId).order("sort_order").order("created_at")
    setContacts((data as Contact[]) || [])
  }
  async function saveInfo() {
    const { error } = await supabase.from("communities")
      .update({ address: infoForm.address || null, phone: infoForm.phone || null, jurisdiction: infoForm.jurisdiction || null })
      .eq("id", communityId)
    if (error) { setMsg("⚠ " + error.message); return }
    setCommunities(cs => cs.map(c => c.id === communityId ? { ...c, ...infoForm } : c))
    setEditInfo(false); setMsg("✅ Community info saved.")
  }
  async function addContact() {
    if (!newContact.role && !newContact.name) { setMsg("⚠ Contact needs a role or name."); return }
    const { error } = await supabase.from("community_contacts").insert({ community_id: communityId, ...newContact, sort_order: contacts.length })
    if (error) { setMsg("⚠ " + error.message); return }
    setNewContact({ role: "", name: "", phone: "", email: "" }); loadContacts()
  }
  async function deleteContact(id: string) {
    if (!confirm("Remove this contact?")) return
    await supabase.from("community_contacts").delete().eq("id", id)
    loadContacts()
  }

  // ── Documents ──
  async function loadDocs() {
    const { data } = await supabase.from("community_documents").select("*")
      .eq("community_id", communityId).order("created_at", { ascending: false })
    setDocs((data as Doc[]) || [])
  }
  async function uploadDoc() {
    if (!docFile) { setMsg("⚠ Choose a file."); return }
    setUploading(true); setMsg("")
    const ext  = docFile.name.split(".").pop() || "bin"
    const path = `${communityId}/${Date.now()}.${ext}`
    const { data: up, error: upErr } = await supabase.storage.from("community-docs").upload(path, docFile, { upsert: false })
    if (upErr || !up) { setUploading(false); setMsg("⚠ Upload failed: " + (upErr?.message || "")); return }
    const { data: { publicUrl } } = supabase.storage.from("community-docs").getPublicUrl(up.path)
    const { error } = await supabase.from("community_documents").insert({
      community_id: communityId, title: docTitle || docFile.name, doc_type: docType, file_url: publicUrl, uploaded_by: userEmail,
    })
    setUploading(false)
    if (error) { setMsg("⚠ " + error.message); return }
    setDocTitle(""); setDocFile(null); setDocType(DOC_TYPES[0]); setMsg("✅ Document uploaded.")
    loadDocs()
  }
  async function deleteDoc(id: string) {
    if (!confirm("Delete this document?")) return
    await supabase.from("community_documents").delete().eq("id", id)
    loadDocs()
  }

  // ── Vehicles ──
  async function loadVehicles() {
    const { data } = await supabase.from("registered_vehicles").select("*")
      .eq("community_id", communityId).order("created_at", { ascending: false })
    setVehicles((data as Vehicle[]) || [])
  }
  function startAddVehicle() {
    setEditVid(null); setVForm({ kind: vKind }); setShowVForm(true)
  }
  function startEditVehicle(v: Vehicle) {
    setEditVid(v.id); setVForm({ ...v }); setVKind(v.kind === "visitor" ? "visitor" : "resident"); setShowVForm(true)
  }
  async function saveVehicle() {
    if (!vForm.plate?.trim() && !vForm.make?.trim()) { setMsg("⚠ Plate or make is required."); return }
    const payload = {
      community_id: communityId, kind: vKind,
      plate: vForm.plate || null, plate_state: vForm.plate_state || null,
      make: vForm.make || null, model: vForm.model || null, color: vForm.color || null, year: vForm.year || null,
      resident_name: vKind === "resident" ? (vForm.resident_name || null) : (vForm.sponsor_resident ? null : vForm.resident_name || null),
      unit: vForm.unit || null, permit_number: vKind === "resident" ? (vForm.permit_number || null) : null,
      sponsor_resident: vKind === "visitor" ? (vForm.sponsor_resident || null) : null,
      visitor_pass: vKind === "visitor" ? (vForm.visitor_pass || null) : null,
      valid_from: vKind === "visitor" ? (vForm.valid_from || null) : null,
      valid_to:   vKind === "visitor" ? (vForm.valid_to || null) : null,
      notes: vForm.notes || null, updated_at: new Date().toISOString(),
    }
    const res = editVid
      ? await supabase.from("registered_vehicles").update(payload).eq("id", editVid)
      : await supabase.from("registered_vehicles").insert({ ...payload, created_by: userEmail })
    if (res.error) { setMsg("⚠ " + res.error.message); return }
    setShowVForm(false); setEditVid(null); setVForm({}); setMsg("✅ Vehicle saved.")
    loadVehicles()
  }
  async function deleteVehicle(id: string) {
    if (!confirm("Remove this vehicle?")) return
    await supabase.from("registered_vehicles").delete().eq("id", id)
    loadVehicles()
  }

  const visibleVehicles = vehicles.filter(v => (v.kind === "visitor" ? "visitor" : "resident") === vKind)
  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold rounded-lg border-none cursor-pointer ${tab === t ? "bg-blue-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`

  return (
    <div className="p-4 sm:p-5 pb-16 max-w-5xl">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold">🏢 Property Hub</h1>
        <select value={communityId} onChange={e => selectCommunity(e.target.value)}
          className="ml-auto px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white">
          {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <button className={tabCls("post-orders")} onClick={() => setTab("post-orders")}>📋 Post Orders</button>
        <button className={tabCls("info")}        onClick={() => setTab("info")}>🏘️ Community Info</button>
        <button className={tabCls("documents")}   onClick={() => setTab("documents")}>📁 Documents</button>
        <button className={tabCls("vehicles")}    onClick={() => setTab("vehicles")}>🚗 Vehicles</button>
        <button className={tabCls("rentroll")}    onClick={() => setTab("rentroll")}>🏠 Rent Roll</button>
        <button className={tabCls("history")}     onClick={() => setTab("history")}>🗂️ Unit History</button>
        <button className={tabCls("violations")}  onClick={() => setTab("violations")}>⚖️ Lease Violations</button>
      </div>

      {msg && <div className="mb-4 text-sm px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-700">{msg}</div>}
      {!canEdit && tab !== "post-orders" && tab !== "history" && tab !== "violations" && (
        <div className="mb-4 text-xs text-gray-500">View-only — contact an admin or property manager to make changes.</div>
      )}

      {/* POST ORDERS */}
      {tab === "post-orders" && <PostOrdersTab communityId={communityId} isAdmin={canEdit} />}

      {/* UNIT ACTIVITY HISTORY */}
      {tab === "history" && <UnitActivityTab />}

      {/* LEASE VIOLATIONS */}
      {tab === "violations" && <LeaseViolationsTab communityId={communityId} communityName={community?.name} isAdmin={canIssueViolation} canDelete={canDeleteViolation} />}

      {/* RENT ROLL */}
      {tab === "rentroll" && <RentRollTab communityId={communityId} communityName={community?.name} isAdmin={canEdit} />}

      {/* COMMUNITY INFO */}
      {tab === "info" && (
        <div className="max-w-2xl">
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">{community?.name}</h3>
              {canEdit && !editInfo && <button className={btnGhost} onClick={() => setEditInfo(true)}>✏️ Edit</button>}
            </div>
            {editInfo ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><label className={labelCls}>Address</label>
                  <input value={infoForm.address} onChange={e => setInfoForm(f => ({ ...f, address: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Phone</label>
                  <input value={infoForm.phone} onChange={e => setInfoForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Jurisdiction</label>
                  <input value={infoForm.jurisdiction} onChange={e => setInfoForm(f => ({ ...f, jurisdiction: e.target.value }))} placeholder="e.g. Richmond PD, Henrico County" className={inputCls} /></div>
                <div className="sm:col-span-2 flex gap-2">
                  <button className={btnPrimary} onClick={saveInfo}>Save</button>
                  <button className={btnGhost} onClick={() => setEditInfo(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <Field label="Address"      value={community?.address} />
                <Field label="Phone"        value={community?.phone} />
                <Field label="Jurisdiction" value={community?.jurisdiction} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Points of Contact</h3>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {contacts.length === 0 && <div className="px-4 py-3 text-sm text-gray-400">No contacts yet.</div>}
            {contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0 text-sm">
                <div className="w-40 shrink-0 font-medium text-gray-700">{c.role || "—"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{c.name || "—"}</div>
                  <div className="text-xs text-gray-500">{[c.phone, c.email].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                {canEdit && <button className={btnDanger} onClick={() => deleteContact(c.id)}>Remove</button>}
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <input value={newContact.role}  onChange={e => setNewContact(f => ({ ...f, role: e.target.value }))}  placeholder="Role (e.g. Management)" className={inputCls} />
              <input value={newContact.name}  onChange={e => setNewContact(f => ({ ...f, name: e.target.value }))}  placeholder="Name" className={inputCls} />
              <input value={newContact.phone} onChange={e => setNewContact(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" className={inputCls} />
              <div className="flex gap-2">
                <input value={newContact.email} onChange={e => setNewContact(f => ({ ...f, email: e.target.value }))} placeholder="Email" className={inputCls} />
                <button className={btnPrimary} onClick={addContact}>Add</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DOCUMENTS */}
      {tab === "documents" && (
        <div className="max-w-2xl">
          {canEdit && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Title</label>
                <input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="e.g. 2026 Lease, House Rules" className={inputCls} /></div>
              <div><label className={labelCls}>Type</label>
                <select value={docType} onChange={e => setDocType(e.target.value)} className={inputCls}>
                  {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                </select></div>
              <div className="sm:col-span-2"><label className={labelCls}>File (PDF or image)</label>
                <input type="file" accept="application/pdf,image/*" onChange={e => setDocFile(e.target.files?.[0] || null)}
                  className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-800 file:text-white hover:file:bg-blue-900 cursor-pointer" /></div>
              <div><button className={btnPrimary} onClick={uploadDoc} disabled={uploading}>{uploading ? "Uploading…" : "Upload Document"}</button></div>
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {docs.length === 0 && <div className="px-4 py-6 text-sm text-gray-400 text-center">No documents yet.</div>}
            {docs.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0">
                <span className="text-xl">{d.file_url.toLowerCase().endsWith(".pdf") ? "📄" : "🖼️"}</span>
                <div className="flex-1 min-w-0">
                  <SignedLink href={d.file_url} bucket="community-docs" className="font-semibold text-blue-700 hover:text-blue-900 truncate block">{d.title || "Untitled"}</SignedLink>
                  <div className="text-xs text-gray-500">{d.doc_type || "—"} · {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
                {canEdit && <button className={btnDanger} onClick={() => deleteDoc(d.id)}>Delete</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VEHICLES */}
      {tab === "vehicles" && (
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button className={`${btnGhost} ${vKind === "resident" ? "ring-2 ring-blue-500" : ""}`} onClick={() => { setVKind("resident"); setShowVForm(false) }}>🏠 Resident</button>
            <button className={`${btnGhost} ${vKind === "visitor"  ? "ring-2 ring-blue-500" : ""}`} onClick={() => { setVKind("visitor"); setShowVForm(false) }}>👋 Visitor</button>
            {canEdit && <button className={`${btnPrimary} ml-auto`} onClick={startAddVehicle}>+ Add {vKind === "resident" ? "Resident" : "Visitor"} Vehicle</button>}
          </div>

          {canEdit && showVForm && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><label className={labelCls}>Plate</label>
                  <input value={vForm.plate || ""} onChange={e => setVForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} className={inputCls} /></div>
                <div><label className={labelCls}>State</label>
                  <input value={vForm.plate_state || ""} onChange={e => setVForm(f => ({ ...f, plate_state: e.target.value.toUpperCase() }))} maxLength={2} className={inputCls} /></div>
                <div><label className={labelCls}>Make</label>
                  <input value={vForm.make || ""} onChange={e => setVForm(f => ({ ...f, make: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Model</label>
                  <input value={vForm.model || ""} onChange={e => setVForm(f => ({ ...f, model: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Color</label>
                  <input value={vForm.color || ""} onChange={e => setVForm(f => ({ ...f, color: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Year</label>
                  <input value={vForm.year || ""} onChange={e => setVForm(f => ({ ...f, year: e.target.value }))} maxLength={4} className={inputCls} /></div>

                {vKind === "resident" ? (
                  <>
                    <div><label className={labelCls}>Resident</label>
                      <input value={vForm.resident_name || ""} onChange={e => setVForm(f => ({ ...f, resident_name: e.target.value }))} className={inputCls} /></div>
                    <div><label className={labelCls}>Unit</label>
                      <input value={vForm.unit || ""} onChange={e => setVForm(f => ({ ...f, unit: e.target.value }))} className={inputCls} /></div>
                    <div><label className={labelCls}>Permit / Decal #</label>
                      <input value={vForm.permit_number || ""} onChange={e => setVForm(f => ({ ...f, permit_number: e.target.value }))} className={inputCls} /></div>
                  </>
                ) : (
                  <>
                    <div><label className={labelCls}>Sponsoring Resident</label>
                      <input value={vForm.sponsor_resident || ""} onChange={e => setVForm(f => ({ ...f, sponsor_resident: e.target.value }))} className={inputCls} /></div>
                    <div><label className={labelCls}>Unit</label>
                      <input value={vForm.unit || ""} onChange={e => setVForm(f => ({ ...f, unit: e.target.value }))} className={inputCls} /></div>
                    <div><label className={labelCls}>Visitor Pass #</label>
                      <input value={vForm.visitor_pass || ""} onChange={e => setVForm(f => ({ ...f, visitor_pass: e.target.value }))} className={inputCls} /></div>
                    <div><label className={labelCls}>Valid From</label>
                      <input type="date" value={vForm.valid_from || ""} onChange={e => setVForm(f => ({ ...f, valid_from: e.target.value }))} className={inputCls} /></div>
                    <div><label className={labelCls}>Valid To</label>
                      <input type="date" value={vForm.valid_to || ""} onChange={e => setVForm(f => ({ ...f, valid_to: e.target.value }))} className={inputCls} /></div>
                  </>
                )}
              </div>
              <div className="mt-3"><label className={labelCls}>Notes</label>
                <input value={vForm.notes || ""} onChange={e => setVForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} /></div>
              <div className="flex gap-2 mt-3">
                <button className={btnPrimary} onClick={saveVehicle}>{editVid ? "Save Changes" : "Add Vehicle"}</button>
                <button className={btnGhost} onClick={() => { setShowVForm(false); setEditVid(null) }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {visibleVehicles.length === 0 && <div className="px-4 py-6 text-sm text-gray-400 text-center">No {vKind} vehicles registered.</div>}
            {visibleVehicles.map(v => {
              const expired = v.kind === "visitor" && v.valid_to && v.valid_to < new Date().toISOString().slice(0, 10)
              return (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0">
                  <div className="font-mono font-semibold text-gray-800 w-28 shrink-0">
                    {v.plate || "—"}{v.plate_state ? ` (${v.plate_state})` : ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {[v.year, v.color, v.make, v.model].filter(Boolean).join(" ") || "—"}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {v.kind === "resident"
                        ? [v.resident_name && `Resident: ${v.resident_name}`, v.unit && `Unit ${v.unit}`, v.permit_number && `Permit ${v.permit_number}`].filter(Boolean).join(" · ") || "—"
                        : [v.sponsor_resident && `Sponsor: ${v.sponsor_resident}`, v.unit && `Unit ${v.unit}`, v.visitor_pass && `Pass ${v.visitor_pass}`, (v.valid_from || v.valid_to) && `${v.valid_from || "?"} → ${v.valid_to || "?"}`].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {expired && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full shrink-0">expired</span>}
                  {canEdit && (
                    <div className="flex gap-1.5 shrink-0">
                      <button className={btnGhost} onClick={() => startEditVehicle(v)}>Edit</button>
                      <button className={btnDanger} onClick={() => deleteVehicle(v.id)}>Remove</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-gray-800">{value || "—"}</div>
    </div>
  )
}

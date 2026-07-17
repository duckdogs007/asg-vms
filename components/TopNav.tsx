"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"
import { fireAlert } from "@/lib/alerts"
import { ADMIN_EMAILS } from "@/lib/admin"
import QuickNav from "./QuickNav"

export default function TopNav() {

  const router   = useRouter()
  const pathname = usePathname()

  const [currentTime,    setCurrentTime]    = useState("")
  const [menuOpen,       setMenuOpen]       = useState(false)
  const [mobileNavOpen,  setMobileNavOpen]  = useState(false)
  const [userEmail,      setUserEmail]      = useState("")
  const [isAdmin,        setIsAdmin]        = useState(false)
  const [userRole,       setUserRole]       = useState("")
  const [nightMode,      setNightMode]      = useState(false)
  const [sosOpen,        setSosOpen]        = useState(false)
  const [sosSending,     setSosSending]     = useState(false)
  const [sosResult,      setSosResult]      = useState<"" | "ok" | "fail">("")
  const [changelogOpen,  setChangelogOpen]  = useState(false)
  const [changelog,      setChangelog]      = useState<Array<{id: string; title: string; blurb: string; posted_at: string}>>([])
  const [lastSeenAt,     setLastSeenAt]     = useState<string | null>(null)
  const [chatUnread,     setChatUnread]     = useState(false)
  const [openDropdown,   setOpenDropdown]   = useState<string | null>(null)
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null)
  const [quickNavOpen,   setQuickNavOpen]   = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("asg-changelog-last-seen")
    setLastSeenAt(saved)
    supabase.from("changelog")
      .select("id, title, blurb, posted_at")
      .eq("is_published", true)
      .order("posted_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setChangelog(data || []))

    // Chat unread badge
    const lastRead = localStorage.getItem("asg-chat-last-read")
    supabase.from("chat_messages")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) {
          setChatUnread(!lastRead || data[0].created_at > lastRead)
        }
      })

    // Clear badge when user visits /chat
    const clearBadge = () => setChatUnread(false)
    window.addEventListener("chat-read", clearBadge)
    return () => window.removeEventListener("chat-read", clearBadge)

  // Cmd+K keyboard shortcut for quick navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setQuickNavOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("asg-night-mode") === "true"
    setNightMode(saved)
    document.body.classList.toggle("dark", saved)

    // Tick once per minute (no seconds shown). Fire immediately so the
    // clock isn't blank until the first minute boundary.
    function tick() {
      setCurrentTime(new Date().toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric",
        year: "numeric", hour: "numeric", minute: "2-digit",
      }))
    }
    tick()
    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  }, [])

  async function resolveUserRole(user: { id: string; email?: string }) {
    const email = user.email || ""
    if (ADMIN_EMAILS.includes(email)) { setUserRole("Admin"); return }
    const { data: adminRow } = await supabase
      .from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle()
    if (adminRow) { setUserRole("Admin"); return }
    const { data: assign } = await supabase
      .from("user_assignments").select("role").eq("user_id", user.id).maybeSingle()
    const role = assign?.role
    setUserRole(
      role === "supervisor" ? "Supervisor" :
      role === "guest"      ? "Guest"      :
      role === "admin_super"? "Admin"      : "Officer"
    )
  }

  useEffect(() => {
    // Apply the session to UI state and, once per browser tab-session, record a
    // "login" audit event. This is the single source of login auditing — it
    // captures both fresh sign-ins AND restored/persisted sessions that never
    // hit the login page (the case that left logged-in users invisible).
    function applySession(user: { id: string; email?: string }) {
      setUserEmail(user.email || "")
      setIsAdmin(ADMIN_EMAILS.includes(user.email || ""))
      resolveUserRole(user)
      try {
        if (sessionStorage.getItem("asg-auth-logged") !== user.id) {
          sessionStorage.setItem("asg-auth-logged", user.id)
          supabase.from("audit_logs").insert({
            user_email:    user.email || "unknown",
            action:        "login",
            resource_type: "Auth",
            resource_id:   user.id,
            detail:        "Signed in / session active",
            created_at:    new Date().toISOString(),
          })
        }
      } catch { /* audit is best-effort */ }
    }

    supabase.auth.getUser().then(({ data: { user } }) => { if (user) applySession(user) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (user) applySession(user)
      else { setUserEmail(""); setIsAdmin(false); setUserRole("") }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function markChangelogSeen() {
    const now = new Date().toISOString()
    localStorage.setItem("asg-changelog-last-seen", now)
    setLastSeenAt(now)
  }

  const unreadCount = changelog.filter(e => !lastSeenAt || e.posted_at > lastSeenAt).length

  async function handleLogout() {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from("audit_logs").insert({
      user_email: user?.email || "unknown",
      action: "logout", resource_type: "Auth", resource_id: "",
      detail: "User signed out",
      created_at: new Date().toISOString(),
    })
    try { sessionStorage.removeItem("asg-auth-logged") } catch {}
    await supabase.auth.signOut()
    router.push("/login")
  }

  async function fireSos() {
    setSosSending(true); setSosResult("")
    let coords = ""
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      coords = await new Promise<string>(resolve => {
        navigator.geolocation.getCurrentPosition(
          p => resolve(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`),
          () => resolve(""),
          { timeout: 4000, enableHighAccuracy: true }
        )
      })
    }
    // Pull last-selected community from /vms (persisted by loadUnits).
    const communityId   = typeof window !== "undefined" ? localStorage.getItem("asg-current-community-id")   || "" : ""
    const communityName = typeof window !== "undefined" ? localStorage.getItem("asg-current-community-name") || "" : ""
    const where = communityName || "Unknown community"
    try {
      const r = await fetch("/api/alerts/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:         "panic_sos",
          severity:     "critical",
          community_id: communityId || null,
          subject:      `🆘 PANIC / SOS — ${where}`,
          body:         `An officer at ${where} has triggered the panic / SOS button. Respond immediately.`,
          payload: {
            Community: communityName || "Unknown",
            User:      userEmail || "—",
            Page:      pathname,
            Location:  coords || "unavailable",
            Time:      new Date().toLocaleString("en-US"),
            UserAgent: typeof navigator !== "undefined" ? navigator.userAgent : "—",
          },
        }),
      })
      setSosResult(r.ok ? "ok" : "fail")
    } catch {
      setSosResult("fail")
    } finally {
      setSosSending(false)
    }
  }

  const displayName = userEmail
    ? userEmail.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : ""

  const navLinkCls        = "text-gray-700 hover:text-blue-800 text-sm font-medium transition-colors"
  const mobileNavLinkCls  = "block px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
  const dropdownItemCls   = "block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 whitespace-nowrap"
  const mobileSubLinkCls  = "block pl-8 pr-4 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-blue-800"

  if (pathname === "/login") return null

  return (
    <nav className="relative border-b border-gray-200 bg-white shadow-sm">

      {/* MAIN NAV BAR */}
      <div className="flex justify-between items-center px-4 sm:px-5 py-3">

        {/* LEFT GROUP — hamburger (always visible) + desktop link row */}
        <div className="flex items-center gap-3 md:gap-5">

          {/* Hamburger — opens the all-pages dropdown on every screen size */}
          <button
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100 border-none cursor-pointer"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Toggle menu"
          >
            {mobileNavOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          {/* Desktop nav links (hidden below md) */}
          <div className="hidden md:flex gap-5 items-center">
            <Link href="/" className={navLinkCls}>Home</Link>

            {/* VMS dropdown */}
            <div className="relative" onMouseEnter={() => setOpenDropdown("vms")} onMouseLeave={() => setOpenDropdown(null)}>
              <Link href="/vms" className={`${navLinkCls} flex items-center gap-0.5`}>
                VMS <span className="text-[10px] text-gray-400 ml-0.5">▾</span>
              </Link>
              {openDropdown === "vms" && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                  <Link href="/vms"        className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🛂 Check-In</Link>
                  <Link href="/vms/scan"   className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>📷 Scan License</Link>
                  <Link href="/vms/search" className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🔎 Search</Link>
                  <Link href="/vms/log"    className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>📜 Scan Log</Link>
                </div>
              )}
            </div>

            {/* User Dashboard dropdown */}
            <div className="relative" onMouseEnter={() => setOpenDropdown("userdash")} onMouseLeave={() => setOpenDropdown(null)}>
              <Link href="/userdash" className={`${navLinkCls} flex items-center gap-0.5`}>
                User Dashboard <span className="text-[10px] text-gray-400 ml-0.5">▾</span>
              </Link>
              {openDropdown === "userdash" && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-50">
                  <Link href="/userdash?tab=reports"  className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>📝 Reports</Link>
                  <Link href="/userdash?tab=onduty"   className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🟢 On Duty</Link>
                  <Link href="/userdash?tab=watchlist" className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🚫 Watchlist</Link>
                  <Link href="/userdash?tab=passdown" className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>📋 Passdown</Link>
                  <Link href="/userdash?tab=bolo"     className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>⚠️ BOLO</Link>
                  <Link href="/userdash?tab=gatecheck" className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🔒 Gate Check</Link>
                </div>
              )}
            </div>

            {/* Property Hub dropdown */}
            <div className="relative" onMouseEnter={() => setOpenDropdown("property")} onMouseLeave={() => setOpenDropdown(null)}>
              <Link href="/vms/property" className={`${navLinkCls} flex items-center gap-0.5`}>
                Property Hub <span className="text-[10px] text-gray-400 ml-0.5">▾</span>
              </Link>
              {openDropdown === "property" && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] z-50">
                  <Link href="/vms/property?tab=post-orders"  className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>📋 Post Orders</Link>
                  <Link href="/vms/property?tab=info"         className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🏢 Community Info</Link>
                  <Link href="/vms/property?tab=documents"    className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>📁 Documents</Link>
                  <Link href="/vms/property?tab=vehicles"     className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🚗 Vehicles</Link>
                  <Link href="/vms/property?tab=rentroll"     className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🏠 Rent Roll</Link>
                  <Link href="/vms/property?tab=history"      className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>📅 Unit History</Link>
                  <Link href="/vms/property?tab=violations"   className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>⚠️ Lease Violations</Link>
                  <Link href="/vms/property?tab=maintenance"  className={dropdownItemCls} onClick={() => setOpenDropdown(null)}>🔧 Maintenance</Link>
                </div>
              )}
            </div>

            <Link href="/vms/intel"   className={navLinkCls}>Intel Hub</Link>
            <Link href="/alerts"      className={navLinkCls}>Alert Log</Link>
            <Link href="/vms/reports" className={navLinkCls}>Reports</Link>
            {userEmail && (
              <Link href="/chat" className={`${navLinkCls} relative`}>
                💬 Chat
                {chatUnread && (
                  <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-blue-600"></span>
                )}
              </Link>
            )}
            {isAdmin && <Link href="/admin/system" className={navLinkCls}>Admin</Link>}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Clock — hidden on mobile */}
          <span className="hidden lg:block text-xs text-gray-500">{currentTime}</span>
          <span className="hidden lg:block text-gray-300">|</span>


            {/* Quick Nav Button */}
            <button
              onClick={() => setQuickNavOpen(true)}
              title="Quick Navigation (Cmd+K)"
              className="hidden md:flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-md hover:bg-gray-200 border border-gray-300 cursor-pointer transition-colors"
            >
              <span>🔍</span>
              <span className="hidden sm:inline text-gray-400">Cmd+K</span>
            </button>
          {/* User dropdown */}
          <div className="relative flex items-center gap-1.5 cursor-pointer" onClick={() => { setMenuOpen(!menuOpen); setChangelogOpen(false) }}>
            <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>
            <span className="text-sm font-bold text-gray-800 hidden sm:block">{displayName || "—"}</span>
            <span className="text-[10px] text-gray-500">▼</span>

            {menuOpen && (
              <div className="absolute top-8 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-64">
                {/* Profile card */}
                <div className="px-4 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {displayName ? displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("") : "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{displayName || "—"}</div>
                      <div className="text-xs text-gray-500 truncate">{userEmail}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Access Level</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      userRole === "Admin"      ? "bg-red-100 text-red-700"    :
                      userRole === "Supervisor" ? "bg-blue-100 text-blue-700"  :
                      userRole === "Guest"      ? "bg-gray-100 text-gray-600"  :
                                                  "bg-green-100 text-green-700"
                    }`}>
                      {userRole || "…"}
                    </span>
                  </div>
                </div>
                {/* Actions */}
                <div
                  className="px-4 py-3 text-sm cursor-pointer hover:bg-gray-50 text-red-600 font-medium rounded-b-xl flex items-center gap-2"
                  onClick={handleLogout}
                >
                  🚪 Logout
                </div>
              </div>
            )}
          </div>

          {/* What's New changelog */}
          {userEmail && (
            <div className="relative">
              <button
                onClick={() => {
                  const opening = !changelogOpen
                  setChangelogOpen(opening)
                  setMenuOpen(false)
                  if (opening) markChangelogSeen()
                }}
                title="Latest Developments"
                className="relative px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-md hover:bg-gray-200 transition-colors border-none cursor-pointer"
              >
                📣<span className="hidden sm:inline"> What's New</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {changelogOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setChangelogOpen(false)} />
                  <div className="absolute top-9 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-80 max-h-[28rem] overflow-y-auto">
                    <div className="px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
                      <Link
                        href="/changelog"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setChangelogOpen(false)}
                        className="font-bold text-blue-700 hover:text-blue-900 text-sm underline-offset-2 hover:underline"
                      >
                        Latest Developments ↗
                      </Link>
                      <div className="text-xs text-gray-400">Recent updates to the ASG-PSP platform</div>
                    </div>
                    {changelog.length === 0 ? (
                      <div className="px-4 py-8 text-sm text-gray-400 text-center">No updates posted yet.</div>
                    ) : changelog.map(entry => {
                      const unread = !lastSeenAt || entry.posted_at > lastSeenAt
                      return (
                        <div key={entry.id} className={`px-4 py-3 border-b border-gray-50 last:border-0 ${unread ? "bg-blue-50" : ""}`}>
                          <div className="flex items-start gap-2">
                            {unread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5"></span>}
                            <div className={unread ? "" : "pl-3.5"}>
                              <div className="text-sm font-semibold text-gray-900">{entry.title}</div>
                              <div className="text-xs text-gray-500 mt-0.5 leading-snug">{entry.blurb}</div>
                              <div className="text-[10px] text-gray-400 mt-1.5">
                                {new Date(entry.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Panic / SOS — visible to all signed-in users */}
          {userEmail && (
            <button
              onClick={() => { setSosResult(""); setSosOpen(true) }}
              title="Panic / SOS"
              className="px-2 sm:px-3 py-1.5 bg-red-700 text-white text-xs rounded-md hover:bg-red-800 transition-colors border-none cursor-pointer font-bold"
            >
              🆘<span className="hidden sm:inline"> SOS</span>
            </button>
          )}

          {/* Night mode */}
          <button
            onClick={() => {
              const next = !nightMode
              setNightMode(next)
              document.body.classList.toggle("dark", next)
              localStorage.setItem("asg-night-mode", String(next))
            }}
            className="px-2 sm:px-3 py-1.5 bg-blue-800 text-white text-xs rounded-md hover:bg-blue-900 transition-colors border-none cursor-pointer"
          >
            {nightMode ? "☀️" : "🌙"}
            <span className="hidden sm:inline"> {nightMode ? "Day" : "Night"}</span>
          </button>

        </div>
      </div>

      {/* SOS confirmation modal */}
      {sosOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={() => !sosSending && setSosOpen(false)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="text-2xl font-bold text-red-700 mb-2">🆘 Confirm Panic / SOS</div>
            <div className="text-sm text-gray-700 mb-4">
              This will immediately email all on-call recipients with your identity, page, and (if permitted) GPS location. Use only in a real emergency.
            </div>
            {sosResult === "ok" && (
              <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded px-3 py-2 mb-3">Alert sent. Help has been notified.</div>
            )}
            {sosResult === "fail" && (
              <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded px-3 py-2 mb-3">Failed to send. Try again or call dispatch directly.</div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSosOpen(false)}
                disabled={sosSending}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded text-sm font-semibold border-none cursor-pointer hover:bg-gray-300 disabled:opacity-50"
              >
                {sosResult === "ok" ? "Close" : "Cancel"}
              </button>
              {sosResult !== "ok" && (
                <button
                  onClick={fireSos}
                  disabled={sosSending}
                  className="px-4 py-2 bg-red-700 text-white rounded text-sm font-bold border-none cursor-pointer hover:bg-red-800 disabled:opacity-50"
                >
                  {sosSending ? "Sending…" : "Send SOS"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NAV DROPDOWN — floating panel anchored under the hamburger */}
      {mobileNavOpen && (
        <>
          {/* Click-outside catcher */}
          <div className="fixed inset-0 z-40" onClick={() => { setMobileNavOpen(false); setMobileExpanded(null) }} />
          <div className="absolute left-3 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[240px] py-1">
            <Link href="/" className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🏠 Home</Link>

            {/* VMS expandable */}
            <div>
              <div className="flex items-center">
                <Link href="/vms" className={`${mobileNavLinkCls} flex-1`} onClick={() => setMobileNavOpen(false)}>🛂 VMS</Link>
                <button
                  className="pr-4 py-2.5 text-gray-400 text-xs bg-transparent border-none cursor-pointer"
                  onClick={() => setMobileExpanded(mobileExpanded === "vms" ? null : "vms")}
                  aria-label="Toggle VMS sub-menu"
                >
                  {mobileExpanded === "vms" ? "▲" : "▾"}
                </button>
              </div>
              {mobileExpanded === "vms" && (
                <div className="bg-gray-50 border-t border-gray-100 pb-1">
                  <Link href="/vms"        className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🛂 Check-In</Link>
                  <Link href="/vms/scan"   className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>📷 Scan License</Link>
                  <Link href="/vms/search" className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🔎 Search</Link>
                  <Link href="/vms/log"    className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>📜 Scan Log</Link>
                </div>
              )}
            </div>

            {/* User Dashboard expandable */}
            <div>
              <div className="flex items-center">
                <Link href="/userdash" className={`${mobileNavLinkCls} flex-1`} onClick={() => setMobileNavOpen(false)}>📋 User Dashboard</Link>
                <button
                  className="pr-4 py-2.5 text-gray-400 text-xs bg-transparent border-none cursor-pointer"
                  onClick={() => setMobileExpanded(mobileExpanded === "userdash" ? null : "userdash")}
                  aria-label="Toggle User Dashboard sub-menu"
                >
                  {mobileExpanded === "userdash" ? "▲" : "▾"}
                </button>
              </div>
              {mobileExpanded === "userdash" && (
                <div className="bg-gray-50 border-t border-gray-100 pb-1">
                  <Link href="/userdash?tab=reports"   className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>📝 Reports</Link>
                  <Link href="/userdash?tab=onduty"    className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🟢 On Duty</Link>
                  <Link href="/userdash?tab=watchlist" className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🚫 Watchlist</Link>
                  <Link href="/userdash?tab=passdown"  className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>📋 Passdown</Link>
                  <Link href="/userdash?tab=bolo"      className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>⚠️ BOLO</Link>
                  <Link href="/userdash?tab=gatecheck" className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🔒 Gate Check</Link>
                </div>
              )}
            </div>

            {/* Property Hub expandable */}
            <div>
              <div className="flex items-center">
                <Link href="/vms/property" className={`${mobileNavLinkCls} flex-1`} onClick={() => setMobileNavOpen(false)}>🏢 Property Hub</Link>
                <button
                  className="pr-4 py-2.5 text-gray-400 text-xs bg-transparent border-none cursor-pointer"
                  onClick={() => setMobileExpanded(mobileExpanded === "property" ? null : "property")}
                  aria-label="Toggle Property Hub sub-menu"
                >
                  {mobileExpanded === "property" ? "▲" : "▾"}
                </button>
              </div>
              {mobileExpanded === "property" && (
                <div className="bg-gray-50 border-t border-gray-100 pb-1">
                  <Link href="/vms/property?tab=post-orders" className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>📋 Post Orders</Link>
                  <Link href="/vms/property?tab=info"        className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🏢 Community Info</Link>
                  <Link href="/vms/property?tab=documents"   className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>📁 Documents</Link>
                  <Link href="/vms/property?tab=vehicles"    className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🚗 Vehicles</Link>
                  <Link href="/vms/property?tab=rentroll"    className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🏠 Rent Roll</Link>
                  <Link href="/vms/property?tab=history"     className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>📅 Unit History</Link>
                  <Link href="/vms/property?tab=violations"  className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>⚠️ Lease Violations</Link>
                  <Link href="/vms/property?tab=maintenance" className={mobileSubLinkCls} onClick={() => setMobileNavOpen(false)}>🔧 Maintenance</Link>
                </div>
              )}
            </div>

            <Link href="/vms/intel"   className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🔎 Intel Hub</Link>
            <Link href="/alerts"      className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🔔 Alert Log</Link>
            <Link href="/vms/reports" className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>📊 Reports</Link>
            {userEmail && (
              <Link href="/chat" className={`${mobileNavLinkCls} flex items-center justify-between`} onClick={() => setMobileNavOpen(false)}>
                <span>💬 Chat</span>
                {chatUnread && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0"></span>}
              </Link>
            )}
            {isAdmin && <Link href="/admin/system" className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>⚙️ Admin</Link>}
            <div className="border-t border-gray-100 mt-1 pt-1.5 pb-1.5 px-4 text-xs text-gray-400">{currentTime}</div>
          </div>
        </>
      )}


      {/* Quick Nav Modal */}
      <QuickNav 
        isOpen={quickNavOpen} 
        onClose={() => setQuickNavOpen(false)} 
        isAdmin={isAdmin} 
      />
    </nav>
  )
}

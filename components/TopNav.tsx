"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"
import { fireAlert } from "@/lib/alerts"

export default function TopNav() {

  const router   = useRouter()
  const pathname = usePathname()

  const adminEmails = ["jhall@teamasg.com"]
  const [currentTime,    setCurrentTime]    = useState("")
  const [menuOpen,       setMenuOpen]       = useState(false)
  const [mobileNavOpen,  setMobileNavOpen]  = useState(false)
  const [userEmail,      setUserEmail]      = useState("")
  const [isAdmin,        setIsAdmin]        = useState(false)
  const [nightMode,      setNightMode]      = useState(false)
  const [sosOpen,        setSosOpen]        = useState(false)
  const [sosSending,     setSosSending]     = useState(false)
  const [sosResult,      setSosResult]      = useState<"" | "ok" | "fail">("")

  useEffect(() => {
    const saved = localStorage.getItem("asg-night-mode") === "true"
    setNightMode(saved)
    document.body.classList.toggle("dark", saved)

    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric",
        year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit"
      }))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || "")
        setIsAdmin(adminEmails.includes(user.email || ""))
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (user) {
        setUserEmail(user.email || "")
        setIsAdmin(adminEmails.includes(user.email || ""))
      } else {
        setUserEmail(""); setIsAdmin(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
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
    try {
      const r = await fetch("/api/alerts/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:     "panic_sos",
          severity: "critical",
          subject:  `🆘 PANIC / SOS — ${userEmail || "Unknown user"}`,
          body:     `An officer has triggered the panic / SOS button. Respond immediately.`,
          payload: {
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

  const navLinkCls = "text-gray-700 hover:text-blue-800 text-sm font-medium transition-colors"
  const mobileNavLinkCls = "block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 border-b border-gray-100"

  if (pathname === "/login") return null

  return (
    <nav className="border-b border-gray-200 bg-white shadow-sm">

      {/* MAIN NAV BAR */}
      <div className="flex justify-between items-center px-4 sm:px-5 py-3">

        {/* LEFT — desktop nav links */}
        <div className="hidden md:flex gap-5">
          <Link href="/"            className={navLinkCls}>Home</Link>
          <Link href="/vms"         className={navLinkCls}>VMS</Link>
          {isAdmin && <Link href="/admin" className={navLinkCls}>User Dashboard</Link>}
          <Link href="/vms/intel"   className={navLinkCls}>Intel Terminal</Link>
          <Link href="/vms/reports" className={navLinkCls}>Reports</Link>
        </div>

        {/* LEFT — mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100 border-none cursor-pointer"
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

        {/* RIGHT */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Clock — hidden on mobile */}
          <span className="hidden lg:block text-xs text-gray-500">{currentTime}</span>
          <span className="hidden lg:block text-gray-300">|</span>

          {/* User dropdown */}
          <div className="relative flex items-center gap-1.5 cursor-pointer" onClick={() => setMenuOpen(!menuOpen)}>
            <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>
            <span className="text-sm font-bold text-gray-800 hidden sm:block">{displayName || "—"}</span>
            <span className="text-[10px] text-gray-500">▼</span>

            {menuOpen && (
              <div className="absolute top-7 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px]">
                <div className="px-3 py-2.5 text-xs text-gray-500 border-b border-gray-100 truncate">{userEmail}</div>
                <div className="px-3 py-2.5 text-sm cursor-pointer hover:bg-gray-50 text-red-600" onClick={handleLogout}>
                  🚪 Logout
                </div>
              </div>
            )}
          </div>

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

      {/* MOBILE NAV DROPDOWN */}
      {mobileNavOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <Link href="/"            className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🏠 Home</Link>
          <Link href="/vms"         className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🪪 VMS</Link>
          {isAdmin && <Link href="/admin" className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>⚙️ User Dashboard</Link>}
          <Link href="/vms/intel"   className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🔎 Intel Terminal</Link>
          <Link href="/vms/reports" className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>📊 Reports</Link>
          <div className="px-4 py-3 text-xs text-gray-400">{currentTime}</div>
        </div>
      )}

    </nav>
  )
}

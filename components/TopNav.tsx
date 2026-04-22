"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"

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
          <Link href="/vms/intel"   className={navLinkCls}>Intel Terminal</Link>
          <Link href="/vms/reports" className={navLinkCls}>Reports</Link>
          {isAdmin && <Link href="/admin" className={navLinkCls}>User Dashboard</Link>}
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

      {/* MOBILE NAV DROPDOWN */}
      {mobileNavOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <Link href="/"            className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🏠 Home</Link>
          <Link href="/vms"         className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🪪 VMS</Link>
          <Link href="/vms/intel"   className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>🔎 Intel Terminal</Link>
          <Link href="/vms/reports" className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>📊 Reports</Link>
          {isAdmin && <Link href="/admin" className={mobileNavLinkCls} onClick={() => setMobileNavOpen(false)}>⚙️ User Dashboard</Link>}
          <div className="px-4 py-3 text-xs text-gray-400">{currentTime}</div>
        </div>
      )}

    </nav>
  )
}

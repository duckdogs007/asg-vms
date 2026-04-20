"use client"

import "./globals.css"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {

  const router = useRouter()
  const pathname = usePathname()
  const isLoginPage = pathname === "/login"

  const adminEmails = ["jhall@teamasg.com"]
  const [currentTime, setCurrentTime] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [nightMode, setNightMode] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("asg-night-mode") === "true"
    setNightMode(saved)
    document.body.classList.toggle("dark", saved)

    const interval = setInterval(() => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit"
        })
      )
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
        setUserEmail("")
        setIsAdmin(false)
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

  const navLink = "text-gray-700 hover:text-blue-800 text-sm font-medium transition-colors"

  return (
    <html lang="en">
      <body>

        {!isLoginPage && (
          <nav className="flex justify-between items-center px-5 py-3 border-b border-gray-200 bg-white shadow-sm">

            <div className="flex gap-5">
              <Link href="/" className={navLink}>Home</Link>
              <Link href="/vms" className={navLink}>VMS</Link>
              <Link href="/vms/intel" className={navLink}>Intel Terminal</Link>
              <Link href="/vms/reports" className={navLink}>Reports</Link>
              {isAdmin && <Link href="/admin" className={navLink}>User Dashboard</Link>}
            </div>

            <div className="flex items-center gap-3">

              <div className="relative flex items-center gap-2 cursor-pointer" onClick={() => setMenuOpen(!menuOpen)}>
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="text-sm font-bold text-gray-800">{displayName || "—"}</span>
                <span className="text-[10px] text-gray-500">▼</span>

                {menuOpen && (
                  <div className="absolute top-7 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px]">
                    <div className="px-3 py-2.5 text-xs text-gray-500 border-b border-gray-100 truncate">
                      {userEmail}
                    </div>
                    <div
                      className="px-3 py-2.5 text-sm cursor-pointer hover:bg-gray-50 text-red-600"
                      onClick={handleLogout}
                    >
                      🚪 Logout
                    </div>
                  </div>
                )}
              </div>

              <span className="text-gray-300">|</span>
              <span className="text-xs text-gray-500">{currentTime}</span>

              <button
                onClick={() => {
                  const next = !nightMode
                  setNightMode(next)
                  document.body.classList.toggle("dark", next)
                  localStorage.setItem("asg-night-mode", String(next))
                }}
                className="px-3 py-1.5 bg-blue-800 text-white text-xs rounded-md hover:bg-blue-900 transition-colors border-none"
              >
                {nightMode ? "☀️ Day Mode" : "🌙 Night Mode"}
              </button>

            </div>

          </nav>
        )}

        <div className={isLoginPage ? "" : "p-5"}>
          {children}
        </div>

      </body>
    </html>
  )
}

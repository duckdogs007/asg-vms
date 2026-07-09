"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/vms",        label: "Check-In",     icon: "🛂" },
  { href: "/vms/scan",   label: "Scan License", icon: "📷" },
  { href: "/vms/search", label: "Search",       icon: "🔎" },
  { href: "/vms/log",    label: "Scan Log",     icon: "📜" },
]

// Tab bar appears only on the check-in workflow pages. /vms/intel,
// /vms/reports, /vms/post-orders are top-level concerns reached via
// TopNav and are intentionally excluded.
const SHOW_PATHS = new Set(["/vms", "/vms/scan", "/vms/search", "/vms/log"])

export default function VmsTabBar() {
  const pathname = usePathname()
  if (!SHOW_PATHS.has(pathname)) return null
  return (
    <div className="flex gap-1 border-b border-gray-300 px-4 sm:px-5 pt-3 overflow-x-auto bg-white">
      {TABS.map(t => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors whitespace-nowrap ${
              active
                ? "bg-blue-800 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span className="mr-1.5">{t.icon}</span>{t.label}
          </Link>
        )
      })}
    </div>
  )
}

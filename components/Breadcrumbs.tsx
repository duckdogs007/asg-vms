"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface BreadcrumbItem {
  label: string
  href?: string
}

// Map routes to readable breadcrumb labels
const BREADCRUMB_MAP: Record<string, BreadcrumbItem[]> = {
  "/": [{ label: "Home" }],
  "/vms": [
    { label: "Home", href: "/" },
    { label: "VMS" },
  ],
  "/vms/scan": [
    { label: "Home", href: "/" },
    { label: "VMS", href: "/vms" },
    { label: "Scan License" },
  ],
  "/vms/search": [
    { label: "Home", href: "/" },
    { label: "VMS", href: "/vms" },
    { label: "Search" },
  ],
  "/vms/log": [
    { label: "Home", href: "/" },
    { label: "VMS", href: "/vms" },
    { label: "Scan Log" },
  ],
  "/vms/intel": [
    { label: "Home", href: "/" },
    { label: "Intel Hub" },
  ],
  "/vms/reports": [
    { label: "Home", href: "/" },
    { label: "Reports" },
  ],
  "/vms/property": [
    { label: "Home", href: "/" },
    { label: "Property Hub" },
  ],
  "/userdash": [
    { label: "Home", href: "/" },
    { label: "Dashboard" },
  ],
  "/alerts": [
    { label: "Home", href: "/" },
    { label: "Alerts" },
  ],
  "/admin/system": [
    { label: "Home", href: "/" },
    { label: "Admin" },
  ],
  "/changelog": [
    { label: "Home", href: "/" },
    { label: "What's New" },
  ],
  "/chat": [
    { label: "Home", href: "/" },
    { label: "Chat" },
  ],
}

/**
 * Breadcrumb navigation showing the user's current location in the app.
 * Helps with orientation and provides quick navigation to parent pages.
 */
export default function Breadcrumbs() {
  const pathname = usePathname()

  // Don't show breadcrumbs on home or login
  if (pathname === "/" || pathname === "/login") return null

  // Extract breadcrumbs, with fallback to simple path
  const breadcrumbs = BREADCRUMB_MAP[pathname] || [
    { label: "Home", href: "/" },
    { label: pathname.split("/").filter(Boolean).at(-1)?.replace(/-/g, " ") || "Page" },
  ]

  return (
    <nav className="px-4 sm:px-5 py-2 text-xs text-gray-600" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2">
        {breadcrumbs.map((item, idx) => (
          <li key={idx} className="flex items-center gap-2">
            {idx > 0 && <span className="text-gray-400">/</span>}
            {item.href ? (
              <Link
                href={item.href}
                className="text-blue-700 hover:text-blue-900 hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-gray-700 font-medium">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"

interface AdminRoute {
  path: string
  label: string
  icon: string
  description: string
}

const ADMIN_ROUTES: AdminRoute[] = [
  {
    path: "/admin/system",
    label: "System Settings",
    icon: "⚙️",
    description: "Manage users, communities, notification recipients, and system configuration",
  },
  {
    path: "/admin/community-policies",
    label: "Community Policies",
    icon: "📋",
    description: "Configure community-specific settings, templates, and policies",
  },
  {
    path: "/admin/post-orders",
    label: "Post Orders",
    icon: "📝",
    description: "Manage operational procedures and post orders for communities",
  },
]

/**
 * Admin section layout with tab navigation.
 * Provides quick access to all administrative functions with descriptive help text.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <>
      {/* Admin sidebar tabs */}
      <div className="flex gap-2 border-b border-gray-300 px-4 sm:px-5 pt-3 overflow-x-auto bg-white">
        {ADMIN_ROUTES.map(route => {
          const isActive = pathname.startsWith(route.path)
          return (
            <Link
              key={route.path}
              href={route.path}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-blue-800 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              title={route.description}
            >
              <span className="mr-1.5">{route.icon}</span>
              {route.label}
            </Link>
          )
        })}
      </div>

      {/* Description */}
      {pathname && (
        <div className="text-xs text-gray-500 px-5 py-2 border-b border-gray-100">
          {ADMIN_ROUTES.find(r => pathname.startsWith(r.path))?.description}
        </div>
      )}

      {/* Content */}
      {children}
    </>
  )
}

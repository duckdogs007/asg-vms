"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface NavItem {
  id: string
  label: string
  icon: string
  path: string
  category: "Core" | "VMS" | "Dashboard" | "Property" | "Admin"
  keywords: string[]
}

// Flatten all navigation items for search
const ALL_NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: "🏠",
    path: "/",
    category: "Core",
    keywords: ["home", "dashboard", "main"],
  },
  {
    id: "vms",
    label: "Visitor Management",
    icon: "🛂",
    path: "/vms",
    category: "VMS",
    keywords: ["vms", "visitor", "check-in", "checkin"],
  },
  {
    id: "vms-scan",
    label: "Scan License",
    icon: "📷",
    path: "/vms/scan",
    category: "VMS",
    keywords: ["scan", "license", "driver", "ocr"],
  },
  {
    id: "vms-search",
    label: "Visitor Search",
    icon: "🔎",
    path: "/vms/search",
    category: "VMS",
    keywords: ["search", "visitor", "find"],
  },
  {
    id: "vms-log",
    label: "Scan Log",
    icon: "📜",
    path: "/vms/log",
    category: "VMS",
    keywords: ["log", "history", "entries"],
  },
  {
    id: "intel",
    label: "Intel Hub",
    icon: "🔎",
    path: "/vms/intel",
    category: "VMS",
    keywords: ["intel", "background", "history"],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "📊",
    path: "/vms/reports",
    category: "VMS",
    keywords: ["reports", "analytics", "data"],
  },
  {
    id: "userdash",
    label: "User Dashboard",
    icon: "📋",
    path: "/userdash",
    category: "Dashboard",
    keywords: ["dashboard", "reports", "watchlist", "passdown", "bolo"],
  },
  {
    id: "property",
    label: "Property Hub",
    icon: "🏢",
    path: "/vms/property",
    category: "Property",
    keywords: ["property", "community", "rent roll", "violations"],
  },
  {
    id: "alerts",
    label: "Alert Log",
    icon: "🔔",
    path: "/alerts",
    category: "Core",
    keywords: ["alerts", "notifications", "messages"],
  },
  {
    id: "chat",
    label: "Chat",
    icon: "💬",
    path: "/chat",
    category: "Core",
    keywords: ["chat", "messages", "communication"],
  },
  {
    id: "admin",
    label: "Admin Dashboard",
    icon: "⚙️",
    path: "/admin/system",
    category: "Admin",
    keywords: ["admin", "settings", "system"],
  },
]

interface QuickNavProps {
  isOpen: boolean
  onClose: () => void
  isAdmin: boolean
}

/**
 * Quick navigation modal accessible via Cmd+K or Ctrl+K.
 * Provides fuzzy search over all main navigation pages.
 */
export default function QuickNav({ isOpen, onClose, isAdmin }: QuickNavProps) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [selectedIdx, setSelectedIdx] = useState(0)

  // Filter items by search query
  const items = ALL_NAV_ITEMS.filter(item => {
    if (!isAdmin && item.category === "Admin") return false
    const query = search.toLowerCase()
    return (
      item.label.toLowerCase().includes(query) ||
      item.keywords.some(k => k.includes(query))
    )
  })

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIdx(prev => (prev + 1) % items.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIdx(prev => (prev - 1 + items.length) % items.length)
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (items[selectedIdx]) {
          router.push(items[selectedIdx].path)
          onClose()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, items, selectedIdx, router, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
        <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-hidden">
          
          {/* Search Input */}
          <div className="border-b border-gray-200 p-4">
            <input
              autoFocus
              type="text"
              placeholder="Search pages, reports, features... (Press Esc to close)"
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setSelectedIdx(0)
              }}
              className="w-full text-lg px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-2">🔍</div>
                <p>No results found for "{search}"</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <Link
                    key={item.id}
                    href={item.path}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      idx === selectedIdx
                        ? "bg-blue-50 border-l-4 border-blue-600"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-2xl">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">{item.label}</div>
                      <div className="text-xs text-gray-500">{item.category}</div>
                    </div>
                    <div className="text-xs text-gray-400">{item.path}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Footer Help */}
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
            <span>↑↓ Navigate • Enter Select • Esc Close</span>
            <span className="hidden sm:inline">Cmd+K or Ctrl+K to open</span>
          </div>
        </div>
      </div>
    </>
  )
}

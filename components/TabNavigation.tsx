"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export interface TabConfig {
  id: string
  label: string
  icon?: string
  description?: string
  href?: string // For URL-based tabs
}

interface TabNavigationProps {
  tabs: readonly TabConfig[]
  activeTab: string
  onChange?: (tabId: string) => void
  variant?: "horizontal" | "card"
  showDescriptions?: boolean
  useUrls?: boolean // If true, use href navigation instead of onChange
}

/**
 * Reusable tab navigation component with consistent styling across all sections.
 * Supports both URL-based tabs (useUrls=true) and state-based tabs (useUrls=false).
 */
export default function TabNavigation({
  tabs,
  activeTab,
  onChange,
  variant = "horizontal",
  showDescriptions = false,
  useUrls = false,
}: TabNavigationProps) {
  const pathname = usePathname()

  // For URL-based tabs, determine active tab from pathname
  const urlActiveTab = useUrls
    ? tabs.find(t => t.href === pathname)?.id || tabs[0]?.id
    : activeTab

  const tabCls = (tabId: string) => {
    const isActive = urlActiveTab === tabId
    return `px-4 py-2 text-sm font-semibold rounded-lg border-none cursor-pointer transition-colors whitespace-nowrap ${
      isActive
        ? "bg-blue-800 text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`
  }

  const activeTabConfig = tabs.find(t => t.id === urlActiveTab)

  return (
    <>
      {/* Tab Bar */}
      <div
        className="flex gap-1 border-b border-gray-300 px-4 sm:px-5 pt-3 overflow-x-auto bg-white"
        role="tablist"
        aria-label="Navigation tabs"
      >
        {useUrls ? (
          tabs.map(tab => (
            <Link
              key={tab.id}
              href={tab.href || "#"}
              role="tab"
              aria-selected={urlActiveTab === tab.id}
              aria-controls={`${tab.id}-panel`}
              className={tabCls(tab.id)}
            >
              {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
              {tab.label}
            </Link>
          ))
        ) : (
          tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tab.id}-panel`}
              onClick={() => onChange?.(tab.id)}
              className={tabCls(tab.id)}
            >
              {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
              {tab.label}
            </button>
          ))
        )}
      </div>

      {/* Description (optional) */}
      {showDescriptions && activeTabConfig?.description && (
        <div className="text-xs text-gray-500 px-5 py-2 border-b border-gray-100">
          {activeTabConfig.description}
        </div>
      )}
    </>
  )
}

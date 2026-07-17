import { useSearchParams, useRouter } from "next/navigation"
import { useCallback } from "react"

/**
 * Manages tab state via URL query parameter (?tab=).
 * Provides better UX than state-based tabs:
 * - Browser back/forward works naturally
 * - Links to specific tabs are shareable
 * - State survives page refresh
 */
export function useUrlTab(defaultTab: string, validTabs: string[]) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get active tab from URL, or default
  const activeTab = (() => {
    const param = searchParams?.get("tab")
    return param && validTabs.includes(param) ? param : defaultTab
  })()

  // Update tab via URL
  const setActiveTab = useCallback(
    (tabId: string) => {
      if (!validTabs.includes(tabId)) return
      const params = new URLSearchParams(searchParams?.toString() || "")
      params.set("tab", tabId)
      router.push(`?${params.toString()}`)
    },
    [router, searchParams, validTabs]
  )

  return [activeTab, setActiveTab] as const
}

import { useState, useEffect } from "react"

/**
 * Manages tab state with sessionStorage persistence.
 * Returns to the previously selected tab when user revisits the page.
 * Uses sessionStorage (not localStorage) so state is fresh per browser session.
 */
export function useTabState(
  pageKey: string, // e.g., "userdash", "property-hub"
  defaultTab: string
) {
  const [activeTab, setActiveTab] = useState(defaultTab)

  // Load from sessionStorage on mount
  useEffect(() => {
    const key = `asg-tab-${pageKey}`
    const saved = typeof window !== "undefined" ? sessionStorage.getItem(key) : null
    if (saved) {
      setActiveTab(saved)
    }
  }, [pageKey])

  // Save to sessionStorage whenever tab changes
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    const key = `asg-tab-${pageKey}`
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key, tabId)
    }
  }

  return [activeTab, handleTabChange] as const
}

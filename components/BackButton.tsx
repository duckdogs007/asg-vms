"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

interface BackButtonProps {
  href?: string
  label?: string
  showBrowserBack?: boolean
}

/**
 * Back navigation button for detail pages.
 * Can navigate to a specific URL or use browser back button.
 */
export default function BackButton({
  href,
  label = "Back",
  showBrowserBack = true,
}: BackButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    if (href) {
      router.push(href)
    } else if (showBrowserBack) {
      router.back()
    }
  }

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-900 font-semibold text-sm mb-4 transition-colors"
      >
        <span>←</span> {label}
      </Link>
    )
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-900 font-semibold text-sm mb-4 transition-colors border-none bg-transparent cursor-pointer p-0"
    >
      <span>←</span> {label}
    </button>
  )
}

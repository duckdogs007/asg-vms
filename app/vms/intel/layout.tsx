import type { Metadata } from "next"

export const metadata: Metadata = { title: "Intel Terminal" }

export default function IntelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

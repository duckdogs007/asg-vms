import type { Metadata } from "next"

export const metadata: Metadata = { title: "Property Hub" }

export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

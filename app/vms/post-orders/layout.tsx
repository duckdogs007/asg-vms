import type { Metadata } from "next"

export const metadata: Metadata = { title: "Post Orders" }

export default function PostOrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

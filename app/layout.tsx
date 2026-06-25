import "./globals.css"
import type { Metadata } from "next"
import TopNav from "@/components/TopNav"

export const metadata: Metadata = {
  title: {
    template: "%s — ASG VMS",
    default:  "ASG VMS — Visitor Management",
  },
  description: "American Security Group — Property Solutions Platform",
}

export const dynamic = "force-dynamic"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        <div className="p-5">
          {children}
        </div>
      </body>
    </html>
  )
}

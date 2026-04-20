import "./globals.css"
import TopNav from "@/components/TopNav"

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

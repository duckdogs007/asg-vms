import type { NextConfig } from "next";

// Format build date as MM.DD.YYYY in America/New_York (Vercel builds in UTC,
// which would otherwise roll over to the next day in late-evening US deploys).
const buildDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
}).formatToParts(new Date())
const buildDate =
  `${buildDateParts.find(p => p.type === "month")?.value}.` +
  `${buildDateParts.find(p => p.type === "day")?.value}.` +
  `${buildDateParts.find(p => p.type === "year")?.value}`

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate,
  },
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  // Backwards-compat: User Dashboard moved /admin → /userdash on 2026-05-23
  // so the URL reflects its purpose (the system Admin Dashboard lives at
  // /admin/system). Only the exact /admin path redirects — sub-routes like
  // /admin/system and /admin/post-orders are unaffected.
  async redirects() {
    return [
      { source: "/admin", destination: "/userdash", permanent: true },
    ]
  },
};

export default nextConfig;

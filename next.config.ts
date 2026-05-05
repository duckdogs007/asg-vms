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
};

export default nextConfig;

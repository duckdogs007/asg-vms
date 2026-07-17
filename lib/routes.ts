/**
 * Centralized route definitions — single source of truth for all navigation links.
 * Eliminates hardcoded strings throughout the codebase and enables consistency.
 */

export const ROUTES = {
  home:                { path: "/",                      label: "Home",              icon: "🏠" },
  login:               { path: "/login",                 label: "Login",             icon: "🔑" },
  confirmLocation:     { path: "/confirm-location",      label: "Confirm Location",  icon: "📍" },
  changelog:           { path: "/changelog",             label: "What's New",        icon: "📣" },
  chat:                { path: "/chat",                  label: "Chat",             icon: "💬" },
  alerts:              { path: "/alerts",                label: "Alert Log",        icon: "🔔" },
  userdash:            { path: "/userdash",              label: "User Dashboard",   icon: "📋" },
  vms:                 { path: "/vms",                   label: "VMS",              icon: "🛂" },
  vmsScan:             { path: "/vms/scan",              label: "Scan License",     icon: "📷" },
  vmsSearch:           { path: "/vms/search",            label: "Search",           icon: "🔎" },
  vmsLog:              { path: "/vms/log",               label: "Scan Log",         icon: "📜" },
  vmsIntel:            { path: "/vms/intel",             label: "Intel Hub",        icon: "🔎" },
  vmsReports:          { path: "/vms/reports",           label: "Reports",          icon: "📊" },
  vmsProperty:         { path: "/vms/property",          label: "Property Hub",     icon: "🏢" },
  adminSystem:         { path: "/admin/system",          label: "Admin",            icon: "⚙️" },
} as const

// VMS workflow tabs — only shown on specific pages
export const VMS_TABS = [
  { id: "checkin",  href: ROUTES.vms.path,       label: "Check-In",     icon: "🛂" },
  { id: "scan",     href: ROUTES.vmsScan.path,   label: "Scan License", icon: "📷" },
  { id: "search",   href: ROUTES.vmsSearch.path, label: "Search",       icon: "🔎" },
  { id: "log",      href: ROUTES.vmsLog.path,    label: "Scan Log",     icon: "📜" },
] as const

// Pages where VMS tab bar should appear
export const VMS_TAB_PATHS = new Set([
  ROUTES.vms.path,
  ROUTES.vmsScan.path,
  ROUTES.vmsSearch.path,
  ROUTES.vmsLog.path,
])

// User Dashboard tabs with descriptions
export const USERDASH_TABS = [
  {
    id: "reports",
    label: "Reports",
    icon: "📋",
    description: "File and review Daily Logs, Incident Reports, Field Contacts, Vehicle FIs, Parking Violations, and Maintenance Reports.",
  },
  {
    id: "onduty",
    label: "On Duty",
    icon: "👥",
    description: "Officers currently signed on, grouped by assigned property — live status.",
  },
  {
    id: "watchlist",
    label: "Watchlist",
    icon: "🚨",
    description: "Persons barred from the property — checked during visitor and ID-scan check-in.",
  },
  {
    id: "passdown",
    label: "Passdown",
    icon: "📝",
    description: "Shift-to-shift notes so the next officer knows what happened on the prior watch.",
  },
  {
    id: "bolo",
    label: "BOLO",
    icon: "⚠️",
    description: "Be-On-the-Lookout alerts for persons or vehicles of interest at the property.",
  },
  {
    id: "gatecheck",
    label: "Gate Check",
    icon: "🚪",
    description: "Per-tour security gate inspection — operation, locks, and damage for each numbered gate.",
  },
] as const

// Property Hub tabs with descriptions
export const PROPERTY_HUB_TABS = [
  {
    id: "post-orders",
    label: "Post Orders",
    icon: "📋",
    description: "Community post orders and operational procedures.",
  },
  {
    id: "info",
    label: "Community Info",
    icon: "🏘️",
    description: "Address, phone, jurisdiction, and contact information.",
  },
  {
    id: "documents",
    label: "Documents",
    icon: "📁",
    description: "Lease agreements, house rules, property maps, and floor plans.",
  },
  {
    id: "vehicles",
    label: "Vehicles",
    icon: "🚗",
    description: "Resident and visitor vehicle registry with permits.",
  },
  {
    id: "rentroll",
    label: "Rent Roll",
    icon: "🏠",
    description: "Resident and unit information with contact details.",
  },
  {
    id: "history",
    label: "Unit History",
    icon: "🗂️",
    description: "Unit activity tracking and historical logs.",
  },
  {
    id: "violations",
    label: "Lease Violations",
    icon: "⚖️",
    description: "Lease violation records and management.",
  },
  {
    id: "maintenance",
    label: "Maintenance Tickets",
    icon: "🔧",
    description: "Maintenance issue tracking and resolution.",
  },
] as const

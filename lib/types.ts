export interface Community {
  id: string
  name: string
}

export interface Unit {
  id: string
  community_id: string
  unit_number: string
}

export interface Resident {
  id: string
  community_id: string
  unit_number: string
  name: string
  relationship?: string | null
  move_in?: string | null
}

export interface Visitor {
  id: string
  first_name: string
  last_name: string
  dob?: string | null
  oln?: string | null
  plate?: string | null
  created_at?: string
}

export interface VisitorLog {
  id: string
  visitor_id?: string | null
  first_name: string
  last_name: string
  person_type: string
  community_id?: string | null
  unit_number?: string | null
  apartment?: string | null
  resident_name?: string | null
  visitor_type?: string | null
  created_at: string
}

export interface WatchlistEntry {
  id: string
  first_name: string
  last_name: string
  dob?: string | null
  oln?: string | null
  ssn?: string | null
  sex?: string | null
  race?: string | null
  reason?: string | null
  notes?: string | null
  comments?: string | null
  ban_date?: string | null
  banned_date?: string | null
  date_banned?: string | null
  flagged_by?: string | null
  banned_by?: string | null
  firearm_flag?: boolean | null
  property?: string | null
  status?: string | null
  match_level?: string
  confidence?: number
}

export interface VehicleWatchlistEntry {
  id: string
  plate: string
  state: string
  reason?: string | null
  notes?: string | null
  match_level?: string
  confidence?: number
}

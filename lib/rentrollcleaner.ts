"use client"

import { useState } from "react"
import Papa from "papaparse"
import { cleanWatchlistRow } from "@/lib/watchlistCleaner"

export function cleanRentRollRow(row: any){

const trim = (v: any)=> v ? v.toString().trim() : null

const splitName = (name: any)=>{

if(!name) return {first:null,last:null}

const parts = name.split(" ")

return {
first: parts[0],
last: parts.slice(1).join(" ")
}

}

const formatDate = (date: any)=>{

if(!date) return null

const d = new Date(date)

if (isNaN(d.getTime())) return null

return d.toISOString().split("T")[0]

}

const name = splitName(row.resident_name)

return {

property: trim(row.property),

unit: trim(row.unit),

resident_name: trim(row.resident_name),

first_name: name.first,

last_name: name.last,

phone: trim(row.phone),

email: trim(row.email),

lease_start: formatDate(row.lease_start),

lease_end: formatDate(row.lease_end),

status: trim(row.status) || "Active"

}

}
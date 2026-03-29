"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { supabase } from "../../../lib/supabaseClient"
import CommunitySelector from "../../../components/CommunitySelector"
import SecurityAlert from "../../../components/SecurityAlert"

export default function ManualEntry(){

const [community,setCommunity] = useState("")
const [firstName,setFirstName] = useState("")
const [lastName,setLastName] = useState("")
const [dob,setDob] = useState("")
const [oln,setOln] = useState("")
const [plate,setPlate] = useState("")
const [plateState,setPlateState] = useState("VA")
const [apartment,setApartment] = useState("")
const [residentName,setResidentName] = useState("")
const [visitorType,setVisitorType] = useState("Visitor")

const [alertPerson,setAlertPerson] = useState<any>(null)
const [returningVisitor,setReturningVisitor] = useState<any>(null)
const [visitStats,setVisitStats] = useState<any>(null)

const [message,setMessage] = useState("")
const [saving,setSaving] = useState(false)

const firstRef = useRef<HTMLInputElement>(null)



/* INITIAL LOAD */

useEffect(()=>{

const saved = localStorage.getItem("asg-community")

if(saved){
setCommunity(saved)
}else{
setCommunity("St Luke Apartments")
}

firstRef.current?.focus()

},[])



/* WATCHLIST MATCH ENGINE */

async function checkWatchlist(first:string,last:string,dobValue?:string,olnValue?:string){

try{

const firstLower = first.toLowerCase().trim()
const lastLower = last.toLowerCase().trim()

if(olnValue){

const { data } = await supabase
.from("watchlist")
.select("*")
.ilike("oln",olnValue)

if(data && data.length > 0){

data[0].match_level = "Driver License Match"
data[0].confidence = 100

return data[0]

}

}


if(dobValue){

const { data } = await supabase
.from("watchlist")
.select("*")
.ilike("first_name",firstLower)
.ilike("last_name",lastLower)
.eq("dob",dobValue)

if(data && data.length > 0){

data[0].match_level = "Name + DOB"
data[0].confidence = 90

return data[0]

}

}


const { data } = await supabase
.from("watchlist")
.select("*")
.ilike("first_name",firstLower)
.ilike("last_name",lastLower)

if(data && data.length > 0){

data[0].match_level = "Name Only"
data[0].confidence = 60

return data[0]

}

return null

}
catch(err){

console.error("Watchlist exception",err)
return null

}

}



/* VEHICLE WATCHLIST */

async function checkVehicleWatchlist(plateValue:string,stateValue:string){

if(!plateValue) return null

const { data } = await supabase
.from("vehicle_watchlist")
.select("*")
.ilike("plate",plateValue)
.ilike("state",stateValue)

if(data && data.length > 0){

data[0].match_level = "Vehicle Plate Match"
data[0].confidence = 95

return data[0]

}

return null

}



/* RETURNING VISITOR DETECTION */

async function checkReturningVisitor(first:string,last:string){

const { data:visitor } = await supabase
.from("visitors")
.select("*")
.ilike("first_name",first)
.ilike("last_name",last)
.limit(1)

if(!visitor || visitor.length === 0) return

const visitorId = visitor[0].id

const { data:logs } = await supabase
.from("visitor_logs")
.select("*")
.eq("visitor_id",visitorId)
.order("created_at",{ascending:false})

if(logs && logs.length > 0){

setReturningVisitor(visitor[0])

setVisitStats({
total:logs.length,
lastVisit:logs[0].created_at,
apartment:logs[0].apartment
})

}

}



/* REAL TIME ALERT CHECK */

useEffect(()=>{

async function runChecks(){

if(firstName.length >= 2 && lastName.length >= 2){

checkReturningVisitor(firstName,lastName)

const banned = await checkWatchlist(firstName,lastName,dob,oln)

if(banned){
setAlertPerson(banned)
return
}

}

if(plate.length >= 3){

const vehicle = await checkVehicleWatchlist(plate,plateState)

if(vehicle){
setAlertPerson(vehicle)
return
}

}

}

runChecks()

},[firstName,lastName,dob,oln,plate,plateState])



/* SAVE VISITOR */

async function saveVisitor(){

try{

setSaving(true)

if(!firstName || !lastName){
setMessage("First and last name required")
return
}

const { data:visitor,error:visitorError } = await supabase
.from("visitors")
.insert([
{
first_name:firstName,
last_name:lastName,
dob:dob || null,
oln:oln || null,
plate:plate || null
}
])
.select()

if(visitorError){
setMessage(visitorError.message)
return
}


const { error:logError } = await supabase
.from("visitor_logs")
.insert([
{
visitor_id:visitor[0].id,
apartment:apartment,
resident_name:residentName || null,
visitor_type:visitorType
}
])

if(logError){
setMessage(logError.message)
return
}

setMessage("Visitor logged")

setFirstName("")
setLastName("")
setDob("")
setOln("")
setPlate("")
setApartment("")
setResidentName("")
setVisitorType("Visitor")

firstRef.current?.focus()

}
finally{

setSaving(false)

}

}



return(

<main style={{padding:"40px",fontFamily:"Arial"}}>

<SecurityAlert
person={alertPerson}
onClose={()=>setAlertPerson(null)}
/>

<h1 style={{fontSize:"28px",marginBottom:"20px"}}>
Visitor Entry
</h1>


<CommunitySelector
selected={community}
onChange={(value)=>{
setCommunity(value)
localStorage.setItem("asg-community",value)
}}
/>



{returningVisitor && visitStats && (

<div style={{
background:"#eef2ff",
padding:"15px",
borderRadius:"8px",
marginBottom:"20px"
}}>

<strong>Returning Visitor Detected</strong>

<div style={{marginTop:"10px"}}>

<div>
{returningVisitor.first_name} {returningVisitor.last_name}
</div>

<div>
Visits: {visitStats.total}
</div>

<div>
Last Visit: {new Date(visitStats.lastVisit).toLocaleDateString()}
</div>

<div>
Last Apartment: {visitStats.apartment}
</div>

</div>

<button
onClick={()=>{
setApartment(visitStats.apartment)
}}
style={{
marginTop:"10px",
padding:"8px 14px",
background:"#1e40af",
color:"white",
border:"none",
borderRadius:"6px"
}}
>
Use Previous Apartment
</button>

</div>

)}



<div style={{
display:"flex",
flexDirection:"column",
gap:"12px",
maxWidth:"420px"
}}>


<input
ref={firstRef}
value={firstName}
placeholder="First Name"
onChange={(e)=>setFirstName(e.target.value)}
style={field}
/>

<input
value={lastName}
placeholder="Last Name"
onChange={(e)=>setLastName(e.target.value)}
style={field}
/>

<input
value={dob}
placeholder="DOB"
onChange={(e)=>setDob(e.target.value)}
style={field}
/>

<input
value={oln}
placeholder="Driver License #"
onChange={(e)=>setOln(e.target.value)}
style={field}
/>

<input
value={plate}
placeholder="Vehicle Plate"
onChange={(e)=>setPlate(e.target.value)}
style={field}
/>

<input
value={plateState}
placeholder="Plate State"
onChange={(e)=>setPlateState(e.target.value)}
style={field}
/>

<input
value={apartment}
placeholder="Apartment Visiting"
onChange={(e)=>setApartment(e.target.value)}
style={field}
/>

<input
value={residentName}
placeholder="Resident Name"
onChange={(e)=>setResidentName(e.target.value)}
style={field}
/>

<select
value={visitorType}
onChange={(e)=>setVisitorType(e.target.value)}
style={field}
>

<option value="Visitor">Visitor</option>
<option value="Contractor">Contractor</option>
<option value="Delivery Driver">Delivery Driver</option>

</select>


<button
onClick={saveVisitor}
disabled={saving}
style={{
padding:"12px",
background:"#1e40af",
color:"white",
borderRadius:"6px",
border:"none",
cursor:"pointer"
}}
>

{saving ? "Saving..." : "Save Entry"}

</button>


<Link href="/vms">

<div style={{
padding:"12px",
background:"#374151",
color:"white",
borderRadius:"6px",
textAlign:"center"
}}>
Back to VMS
</div>

</Link>


{message && (

<div style={{
marginTop:"10px",
padding:"12px",
background:"#f3f4f6",
borderRadius:"6px"
}}>
{message}
</div>

)}

</div>

</main>

)

}



const field:React.CSSProperties={
padding:"10px",
fontSize:"16px",
border:"1px solid #ccc",
borderRadius:"6px"
}
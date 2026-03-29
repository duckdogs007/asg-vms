"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"
import SecurityAlert from "../../../components/SecurityAlert"

export default function ScanID(){

const router = useRouter()

const [barcode,setBarcode] = useState("")
const [person,setPerson] = useState<any>(null)
const [alertPerson,setAlertPerson] = useState<any>(null)



/* DRIVER LICENSE PARSER */

function parseLicense(data:string){

function get(field:string){
const match = data.match(new RegExp(field + "([^\n]+)"))
return match ? match[1].trim() : ""
}

return {

first_name:get("DAC"),
last_name:get("DCS"),
middle_name:get("DAD"),

dob:get("DBB"),

oln:get("DAQ"),

address:get("DAG"),
city:get("DAI"),
state:get("DAJ"),
zip:get("DAK"),

sex:get("DBC"),
height:get("DAU"),
eye_color:get("DAY")

}

}



/* WATCHLIST CHECK */

async function checkWatchlist(first:string,last:string,oln:string){

if(oln){

const { data } = await supabase
.from("watchlist")
.select("*")
.ilike("oln",oln)

if(data && data.length > 0){

setAlertPerson(data[0])
return

}

}

const { data } = await supabase
.from("watchlist")
.select("*")
.ilike("first_name",first)
.ilike("last_name",last)

if(data && data.length > 0){

setAlertPerson(data[0])

}

}



/* PROCESS SCAN */

async function processScan(scan:string){

const parsed = parseLicense(scan)

setPerson(parsed)

await checkWatchlist(
parsed.first_name,
parsed.last_name,
parsed.oln
)

}



/* AUTO DETECT ENTER FROM SCANNER */

function handleKeyDown(e:any){

if(e.key === "Enter"){

e.preventDefault()

processScan(barcode)

}

}



function continueEntry(){

router.push(`/vms/manual?first=${person.first_name}&last=${person.last_name}&dob=${person.dob}&oln=${person.oln}`)

}



return(

<main style={{padding:"40px",fontFamily:"Arial"}}>

<SecurityAlert
person={alertPerson}
onClose={()=>setAlertPerson(null)}
/>

<h1>Scan Driver License</h1>

<textarea
autoFocus
value={barcode}
placeholder="Scan driver license"
onChange={(e)=>setBarcode(e.target.value)}
onKeyDown={handleKeyDown}
style={{
width:"420px",
height:"120px",
padding:"10px"
}}
/>


{person && (

<div style={{
marginTop:"30px",
background:"#f3f4f6",
padding:"20px",
borderRadius:"8px",
maxWidth:"420px"
}}>

<h3>License Data</h3>

<div>{person.first_name} {person.last_name}</div>

<div>DOB: {person.dob}</div>

<div>License: {person.oln}</div>

<div>{person.address}</div>
<div>{person.city}, {person.state} {person.zip}</div>

<button
onClick={continueEntry}
style={{
marginTop:"15px",
padding:"12px 18px",
background:"#16a34a",
color:"white",
border:"none",
borderRadius:"6px"
}}
>
Continue Visitor Entry
</button>

</div>

)}

</main>

)

}
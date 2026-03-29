"use client"

import { useState,useEffect } from "react"
import { supabase } from "../../../lib/supabaseClient"
import CommunitySelector from "../../../components/CommunitySelector"

export default function IntelTerminal(){

  const [community,setCommunity] = useState("")
  const [query,setQuery] = useState("")
  const [results,setResults] = useState<any[]>([])

  useEffect(()=>{

    const saved = localStorage.getItem("asg-community")

    if(saved){
      setCommunity(saved)
    }else{
      setCommunity("St Luke Apartments")
    }

  },[])

  async function runSearch(){

    if(!query) return

    let output:any[] = []

    // VISITOR SEARCH

    const { data:visitors } = await supabase
      .from("visitors")
      .select(`
        id,
        first_name,
        last_name,
        visitor_logs (
          apartment,
          timestamp
        )
      `)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)

    if(visitors){

      visitors.forEach(v=>{

        output.push({

          type:"Visitor",
          name:`${v.first_name} ${v.last_name}`,
          detail:v.visitor_logs?.[0]?.apartment || "",
          date:v.visitor_logs?.[0]?.timestamp || ""

        })

      })

    }


    // RESIDENT SEARCH

    const { data:residents } = await supabase
      .from("residents")
      .select("*")
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,apartment.ilike.%${query}%`)

    if(residents){

      residents.forEach(r=>{

        output.push({

          type:"Resident",
          name:`${r.first_name} ${r.last_name}`,
          detail:`Apt ${r.apartment}`

        })

      })

    }


    // WATCHLIST SEARCH

    const { data:watch } = await supabase
      .from("watchlist")
      .select("*")
      .or(`
        first_name.ilike.%${query}%,
        last_name.ilike.%${query}%,
        oln.ilike.%${query}%,
        property.ilike.%${query}%
      `)

    if(watch){

      watch.forEach(w=>{

        output.push({

          type:"Watchlist",
          name:`${w.first_name} ${w.last_name}`,
          detail:w.reason,
          firearm:w.firearm_flag

        })

      })

    }


    // VEHICLE WATCHLIST

    const { data:vehicles } = await supabase
      .from("vehicle_watchlist")
      .select("*")
      .ilike("plate",`%${query}%`)

    if(vehicles){

      vehicles.forEach(v=>{

        output.push({

          type:"Vehicle Alert",
          name:v.plate,
          detail:v.reason

        })

      })

    }

    setResults(output)

  }


  return(

    <main style={{padding:"40px",fontFamily:"Arial"}}>

      <h1 style={{fontSize:"28px",marginBottom:"20px"}}>
        Intel Terminal
      </h1>

      <CommunitySelector
        selected={community}
        onChange={(value)=>{
          setCommunity(value)
          localStorage.setItem("asg-community",value)
        }}
      />

      <div style={{marginTop:"20px"}}>

        <input
          value={query}
          placeholder="Search Name, Apartment, OLN, Plate"
          onChange={(e)=>setQuery(e.target.value)}
          style={{
            padding:"10px",
            width:"320px",
            border:"1px solid #ccc",
            borderRadius:"6px"
          }}
        />

        <button
          onClick={runSearch}
          style={{
            marginLeft:"10px",
            padding:"10px 16px",
            background:"#1e3a8a",
            color:"white",
            border:"none",
            borderRadius:"6px"
          }}
        >
          Search
        </button>

      </div>


      <div style={{marginTop:"30px"}}>

        {results.length===0 && (
          <div>No results</div>
        )}

        {results.map((r,i)=>(

          <div
            key={i}
            style={{
              borderBottom:"1px solid #eee",
              padding:"10px 0",
              background:r.firearm ? "#fee2e2" : "transparent"
            }}
          >

            <strong>{r.name}</strong>

            {r.firearm && (
              <span style={{
                color:"#b91c1c",
                marginLeft:"10px"
              }}>
                🚨 FIREARM
              </span>
            )}

            <div style={{fontSize:"13px",color:"#666"}}>
              {r.type}
            </div>

            <div style={{fontSize:"12px"}}>
              {r.detail}
            </div>

          </div>

        ))}

      </div>

    </main>

  )

}
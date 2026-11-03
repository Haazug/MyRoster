'use client'
import {useState} from 'react'
type A={iata:string;city:string;name:string}
const n=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export default function AirportPicker({airports,onPick,placeholder}:{airports:A[];onPick:(iata:string)=>void;placeholder:string}){
 const [q,setQ]=useState('')
 const s=n(q.trim())
 const rows=s.length<2?[]:airports.filter(a=>a.iata&&n([a.iata,a.city,a.name].join(' ')).includes(s)).slice(0,6)
 return <div>
  <input value={q} onChange={e=>setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="min-h-11 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm outline-none placeholder:text-white/30"/>
  {rows.length>0&&<div className="mt-1 overflow-hidden rounded-lg border border-white/10">{rows.map(a=><button key={a.iata} type="button" onClick={()=>{onPick(a.iata);setQ('')}} className="flex min-h-11 w-full items-center gap-3 border-b border-white/[.06] px-3 text-left text-sm last:border-0"><span className="board-code w-10 shrink-0">{a.iata}</span><span className="min-w-0 truncate text-white/60">{a.city} · {a.name}</span></button>)}</div>}
 </div>
}

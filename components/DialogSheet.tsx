'use client'

import {useEffect,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'

// The native top layer escapes transformed page containers and stays above navigation.
export default function DialogSheet({open,onClose,label,children}:{open:boolean;onClose:()=>void;label:string;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null)
 const [mounted,setMounted]=useState(false)
 useEffect(()=>setMounted(true),[])
 useEffect(()=>{
  const dialog=ref.current
  if(!open||!dialog)return
  const previous=document.body.style.overflow
  document.body.style.overflow='hidden'
  dialog.showModal()
  return()=>{dialog.close();document.body.style.overflow=previous}
 },[open,mounted])
 if(!mounted||!open)return null
 return createPortal(<dialog ref={ref} aria-label={label} aria-modal="true" className="dialog-sheet" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}>
  {children}
 </dialog>,document.body)
}

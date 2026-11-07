"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const SYNCED = ["myroster.logs", "myroster.favourites", "myroster.bookings", "myroster.customRoutes", "myroster.seenRoutes", "myroster.favAirlines", "myroster.favAirports", "myroster.recents"]

const merge = (a: any[], b: any[]) => {
  const m = new Map<string, any>()
  ;[...b, ...a].forEach((x, i) => m.set(String(x?.id ?? i), x))
  return Array.from(m.values())
}

async function push(key: string, value: unknown) {
  if (!SYNCED.includes(key)) return
  try {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user.id
    if (!uid) return
    await supabase.from("user_data").upsert({ user_id: uid, key, value, updated_at: new Date().toISOString() })
  } catch {}
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let local: any = null
    try { const raw = window.localStorage.getItem(key); if (raw) { local = JSON.parse(raw); setValue(local) } } catch {}
    const refresh = (event: Event) => {
      if(event instanceof StorageEvent && event.key!==key)return
      if(event instanceof CustomEvent && event.detail?.key!==key)return
      try {const raw=window.localStorage.getItem(key);if(raw)setValue(JSON.parse(raw))}catch{}
    }
    window.addEventListener('storage',refresh)
    window.addEventListener('myroster:data-changed',refresh)
    setHydrated(true)
    if (!SYNCED.includes(key)) return () => {window.removeEventListener('storage',refresh);window.removeEventListener('myroster:data-changed',refresh)}
    let cancelled = false
    ;(async () => {
      try {
        const { data: s } = await supabase.auth.getSession()
        const uid = s.session?.user.id
        if (!uid) return
        const { data, error } = await supabase.from("user_data").select("value").eq("user_id", uid).eq("key", key).maybeSingle()
        if (error || cancelled) return
        const mark = `myroster.synced.${uid}.${key}`
        const first = !window.localStorage.getItem(mark)
        const cloud = Array.isArray(data?.value) ? (data!.value as any[]) : null
        const mine = Array.isArray(local) ? local : []
        // first sync on this device merges; afterwards the account is the source of truth
        const next = cloud === null ? mine : first ? merge(mine, cloud) : cloud
        window.localStorage.setItem(key, JSON.stringify(next))
        window.localStorage.setItem(mark, "1")
        if (!cancelled) setValue(next as T)
        if (cloud === null || first) push(key, next)
      } catch {}
    })()
    return () => { cancelled = true;window.removeEventListener('storage',refresh);window.removeEventListener('myroster:data-changed',refresh) }
  }, [key])

  const update = useCallback((next: T | ((current: T) => T)) => {
    setValue(current => {
      const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next
      try { window.localStorage.setItem(key, JSON.stringify(resolved)) } catch {}
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent('myroster:data-changed',{detail:{key}})))
      push(key, resolved)
      return resolved
    })
  }, [key])

  return [value, update, hydrated] as const
}
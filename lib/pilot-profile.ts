import { supabase } from '@/lib/supabase'

export type PilotProfile = {
  id: string
  name: string
  username?: string
  nationality: string
  avatar?: string
  developer?: boolean
  createdAt: number
  totalFlights: number
  totalHours: number
  airline?: { id: string; name: string; initials: string; shape: "circle" | "square" | "shield" | "diamond"; color1: string; color2: string }
}

export type PilotFriend = {
  profileId: string
  addedAt: number
}

export type SharedFlight = {
  id: string
  sharedBy: string
  sharedByName: string
  sharedAt: number
}

const STORAGE_KEY = 'myroster.profile'
const FRIENDS_KEY = 'myroster.friends'
const SHARED_KEY = 'myroster.shared'

export function getProfile(): PilotProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const p = localStorage.getItem(STORAGE_KEY)
    return p ? JSON.parse(p) : null
  } catch {
    return null
  }
}

export function saveProfile(p: PilotProfile) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch (e) {
    console.error('Failed to save profile:', e)
  }
}

export function getFriends(): PilotFriend[] {
  if (typeof window === 'undefined') return []
  try {
    const f = localStorage.getItem(FRIENDS_KEY)
    return f ? JSON.parse(f) : []
  } catch {
    return []
  }
}

export function addFriend(profileId: string) {
  const friends = getFriends()
  if (!friends.find((f) => f.profileId === profileId)) {
    friends.push({ profileId, addedAt: Date.now() })
    try {
      localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends))
    } catch (e) {
      console.error('Failed to save friends:', e)
    }
    pushAccountData()
  }
}

export function removeFriend(profileId: string) {
  const friends = getFriends().filter((f) => f.profileId !== profileId)
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends))
  } catch (e) {
    console.error('Failed to remove friend:', e)
  }
  pushAccountData()
}

export function generateShareCode(profile: PilotProfile): string {
  const short = profile.id.replace('pilot_', '').substring(0, 8)
  return btoa(unescape(encodeURIComponent(JSON.stringify({ id: profile.id, name: profile.name, username: profile.username, nationality: profile.nationality, avatar: profile.avatar, developer: profile.developer }))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function decodeShareCode(code: string): PilotProfile | null {
  try {
    const json = decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/'))))
    const p = JSON.parse(json)
    return p && p.id && p.name ? (p as PilotProfile) : null
  } catch {
    return null
  }
}

export function getPilotStats(profile: PilotProfile) {
  return {
    totalFlights: profile.totalFlights || 0,
    totalHours: profile.totalHours || 0,
    avgFlightTime: profile.totalFlights > 0 ? Math.round((profile.totalHours / profile.totalFlights) * 100) / 100 : 0,
  }
}

export function recordSharedFlight(flightId: string, sharedByProfile: PilotProfile) {
  if (typeof window === 'undefined') return
  try {
    const shared = localStorage.getItem(SHARED_KEY)
    const list: SharedFlight[] = shared ? JSON.parse(shared) : []
    list.push({
      id: flightId,
      sharedBy: sharedByProfile.id,
      sharedByName: sharedByProfile.username || sharedByProfile.name,
      sharedAt: Date.now(),
    })
    localStorage.setItem(SHARED_KEY, JSON.stringify(list))
  } catch (e) {
    console.error('Failed to record shared flight:', e)
  }
}

export function getSharedFlightInfo(flightId: string): SharedFlight | null {
  if (typeof window === 'undefined') return null
  try {
    const shared = localStorage.getItem(SHARED_KEY)
    const list: SharedFlight[] = shared ? JSON.parse(shared) : []
    return list.find((s) => s.id === flightId) || null
  } catch {
    return null
  }
}


const CLOUD_PROFILE = 'myroster.profile'
const CLOUD_FRIENDS = 'myroster.friends'
const CLOUD_FRIEND_PROFILES = 'myroster.friendProfiles'
const CLOUD_KEYS = [CLOUD_PROFILE, CLOUD_FRIENDS, CLOUD_FRIEND_PROFILES]

export async function pushAccountData() {
  if (typeof window === 'undefined') return
  try {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user.id
    if (!uid) return
    const now = new Date().toISOString()
    const rows: { user_id: string; key: string; value: unknown; updated_at: string }[] = []
    for (const key of CLOUD_KEYS) {
      const raw = localStorage.getItem(key)
      if (raw) rows.push({ user_id: uid, key, value: JSON.parse(raw), updated_at: now })
    }
    if (rows.length) await supabase.from('user_data').upsert(rows)
  } catch (e) {
    console.error('Failed to push account data:', e)
  }
}

// devolve true se o localStorage mudou (a pagina deve recarregar)
export async function pullAccountData(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const { data: s } = await supabase.auth.getSession()
    const uid = s.session?.user.id
    if (!uid) return false
    const { data, error } = await supabase.from('user_data').select('key,value').eq('user_id', uid).in('key', CLOUD_KEYS)
    if (error) return false

    const cloud: Record<string, any> = {}
    ;(data || []).forEach((r: any) => { cloud[r.key] = r.value })

    const mark = `myroster.acct.${uid}`
    const first = !localStorage.getItem(mark)
    let changed = false
    const set = (k: string, v: unknown) => {
      const str = JSON.stringify(v)
      if (localStorage.getItem(k) !== str) {
        localStorage.setItem(k, str)
        changed = true
      }
    }

    if (cloud[CLOUD_PROFILE]) set(CLOUD_PROFILE, cloud[CLOUD_PROFILE])

    if (Array.isArray(cloud[CLOUD_FRIENDS])) {
      const cf = cloud[CLOUD_FRIENDS] as PilotFriend[]
      if (first) {
        const m = new Map<string, PilotFriend>()
        ;[...cf, ...getFriends()].forEach((f) => m.set(f.profileId, f))
        set(CLOUD_FRIENDS, Array.from(m.values()))
      } else {
        set(CLOUD_FRIENDS, cf)
      }
    }

    if (cloud[CLOUD_FRIEND_PROFILES] && typeof cloud[CLOUD_FRIEND_PROFILES] === 'object') {
      let local: Record<string, unknown> = {}
      try { local = JSON.parse(localStorage.getItem(CLOUD_FRIEND_PROFILES) || '{}') } catch {}
      set(CLOUD_FRIEND_PROFILES, first ? { ...cloud[CLOUD_FRIEND_PROFILES], ...local } : cloud[CLOUD_FRIEND_PROFILES])
    }

    localStorage.setItem(mark, '1')
    await pushAccountData()
    return changed
  } catch (e) {
    console.error('Failed to pull account data:', e)
    return false
  }
}

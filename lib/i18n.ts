'use client'

import { useCallback } from 'react'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { canStorePreferences } from '@/lib/consent'
import { interfaceText, interfaceLanguages } from '@/lib/interface-i18n'
import { en, pt, it, fr, es, type Dict } from '@/lib/i18n-dict'
import { V230 } from '@/lib/i18n-v230'
import { V230B } from '@/lib/i18n-v230b'
import { V230C } from '@/lib/i18n-community'

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
] as const
export type Lang = (typeof LANGS)[number]['code']

const DICTS: Record<Lang, Dict> = { en: { ...en }, pt: { ...pt }, it: { ...it }, fr: { ...fr }, es: { ...es } }
for (const [key, values] of Object.entries(interfaceText)) interfaceLanguages.forEach((lang, i) => { DICTS[lang][key] = values[i] })
for (const l of LANGS) Object.assign(DICTS[l.code], V230[l.code], V230B[l.code], V230C[l.code])
const KEY = 'myroster.lang'
const valid = (v: unknown): v is Lang => LANGS.some((l) => l.code === v)

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>) {
  let s = DICTS[lang]?.[key] ?? en[key] ?? key
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]))
  return s
}

type LangStore = { lang: Lang; chosen: boolean; apply: (l: Lang) => void }
export const useLang = create<LangStore>((set) => ({
  lang: 'en',
  chosen: false,
  apply: (lang) => set({ lang, chosen: true }),
}))

export function useT() {
  const lang = useLang((s) => s.lang)
  return useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])
}

function readLocal(): Lang | null {
  try {
    const a = window.sessionStorage.getItem(KEY)
    if (valid(a)) return a
    const b = window.localStorage.getItem(KEY)
    if (valid(b)) return b
  } catch {}
  return null
}

// session storage always (needed while browsing); local storage only with the "preferences" consent
function writeLocal(l: Lang) {
  try {
    window.sessionStorage.setItem(KEY, l)
    if (canStorePreferences()) window.localStorage.setItem(KEY, l)
  } catch {}
}

async function pushCloud(l: Lang) {
  try {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user.id
    if (!uid) return
    await supabase.from('user_data').upsert({ user_id: uid, key: KEY, value: l, updated_at: new Date().toISOString() })
  } catch {}
}

async function pullCloud(uid: string): Promise<Lang | null> {
  try {
    const { data } = await supabase.from('user_data').select('value').eq('user_id', uid).eq('key', KEY).maybeSingle()
    return valid(data?.value) ? (data!.value as Lang) : null
  } catch {
    return null
  }
}

// run once at start and after every login: a language chosen on this device wins and is saved to the account;
// otherwise the account language (if any) is used
export async function syncLang() {
  const st = useLang.getState()
  const local = st.chosen ? st.lang : readLocal()
  if (local && !st.chosen) st.apply(local)
  try {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user.id
    if (!uid) return
    if (local) {
      writeLocal(local)
      pushCloud(local)
    } else {
      const cloud = await pullCloud(uid)
      if (cloud && !useLang.getState().chosen) {
        useLang.getState().apply(cloud)
        writeLocal(cloud)
      }
    }
  } catch {}
}

export function chooseLang(l: Lang) {
  useLang.getState().apply(l)
  writeLocal(l)
  pushCloud(l)
}

export function persistLangIfAllowed() {
  const { chosen, lang } = useLang.getState()
  try {
    if (chosen && canStorePreferences()) window.localStorage.setItem(KEY, lang)
  } catch {}
}
'use client'

import PushSettings from '@/components/PushSettings'
import {APP_VERSION} from '@/lib/release'
import {clearDevicePush} from '@/lib/push-client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Camera, Copy, Users, LogOut, LogIn, Lock } from 'lucide-react'
import { CookieSettingsButton } from '@/components/CookieBanner'
import { LanguageSelect } from '@/components/LanguageGate'
import { useT, useLang } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { getProfile, getFriends, saveProfile, generateShareCode, getPilotStats, pullAccountData, pushAccountData, decodeShareCode, type PilotProfile } from '@/lib/pilot-profile'

const DEVELOPER_SECRET = "13442018"

export default function ProfilePage() {
  const t = useT()
  const lang=useLang(s=>s.lang)
  const regions = new Intl.DisplayNames([lang],{type:'region'})
  const [profile, setProfile] = useState<PilotProfile | null>(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [nationality, setNationality] = useState('')
  const [avatar, setAvatar] = useState('')
  const [developer, setDeveloper] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [friendCount, setFriendCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [devUnlocked, setDevUnlocked] = useState(false)
  const [devCode, setDevCode] = useState('')
  const [devError, setDevError] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    try {
      const p = getProfile()
      if (!p) {
        const newId = `pilot_${Date.now()}`
        const newProfile: PilotProfile = {
          id: newId,
          name: 'Pilot',
          nationality: '',
          createdAt: Date.now(),
          totalFlights: 0,
          totalHours: 0,
        }
        saveProfile(newProfile)
        setProfile(newProfile)
        setName(newProfile.name)
      } else {
        setProfile(p)
        setName(p.name)
        setUsername(p.username || '')
        setNationality(p.nationality || '')
        setAvatar(p.avatar || '')
        setDeveloper(p.developer || false)
        setDevUnlocked(p.developer || false)
        setFriendCount(getFriends().length)
      }
    } catch (e) {
      console.error('Load failed:', e)
      setError('Erro ao carregar perfil')
    }
  }, [])

  useEffect(() => {
    let live = true
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      const mail = data.session?.user.email ?? null
      setEmail(mail)
      setAuthReady(true)
      if (mail) {
        pullAccountData().then((changed) => { if (changed) window.location.reload() })
        const p = getProfile()
        if (p && p.name === 'Pilot') {
          const updated = { ...p, name: mail.split('@')[0] }
          saveProfile(updated)
          setProfile(updated)
          setName(updated.name)
        }
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null)
    })
    return () => {
      live = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSave = async () => {
    if (!profile || !name.trim()) return
    setSaving(true)
    setError('')
    try {
      const updated: PilotProfile = { 
        ...profile, 
        name: name.trim(), 
        username: username.trim() || undefined,
        nationality, 
        avatar,
        developer,
      }
      saveProfile(updated)
      pushAccountData()
      setProfile(updated)
      setTimeout(() => setSaving(false), 500)
    } catch (e) {
      console.error('Save failed:', e)
      setError('Erro ao guardar. Imagem muito grande?')
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    if (!window.confirm('Terminar sessão?')) return
    try {
      await clearDevicePush().catch(()=>{})
      await supabase.auth.signOut()
      localStorage.removeItem('myroster.profile')
      localStorage.removeItem('myroster.friends')
      window.location.href = '/login'
    } catch (e) {
      console.error('Logout failed:', e)
    }
  }

  const handleUnlockDeveloper = () => {
    setDevError('')
    if (devCode === DEVELOPER_SECRET) {
      setDevUnlocked(true)
      setDevCode('')
    } else {
      setDevError('Código incorreto')
    }
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (file.size > 500000) {
      setError('Imagem muito grande (máx 500KB)')
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result as string
        setAvatar(data)
        setError('')
      } catch (err) {
        setError('Erro ao processar imagem')
      }
    }
    reader.readAsDataURL(file)
  }

  const stats = profile ? getPilotStats(profile) : null
  const displayName = developer ? `${name}${username ? ` (@${username})` : ''} • Developer` : name

  const makeThumb = (src: string) =>
    new Promise<string | undefined>((resolve) => {
      if (!src) return resolve(undefined)
      const img = new window.Image()
      img.onload = () => {
        try {
          const size = 64
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(undefined)
          const side = Math.min(img.width, img.height)
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
          resolve(canvas.toDataURL('image/jpeg', 0.6))
        } catch {
          resolve(undefined)
        }
      }
      img.onerror = () => resolve(undefined)
      img.src = src
    })

  const handleCopyLink = async () => {
    if (!profile) return
    const thumb = await makeThumb(avatar || profile.avatar || '')
    const code = generateShareCode({
      ...profile,
      name: name.trim() || profile.name,
      username: username.trim() || undefined,
      nationality,
      avatar: thumb,
      developer,
    })
    let link = `${window.location.origin}/invite/${code}`
    try {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id
      const prof = decodeShareCode(code)
      if (uid && prof) {
        const short = uid.replace(/-/g, '').slice(0, 8)
        const { error } = await supabase
          .from('pilot_invites')
          .upsert({ code: short, user_id: uid, profile: prof, updated_at: new Date().toISOString() })
        if (!error) link = `${window.location.origin}/invite/${short}`
      }
    } catch {}
    navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const input = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-[#1f88ff]'
  const label = 'text-xs font-semibold uppercase tracking-[.2em] text-[#55a7ff]'

  if (!profile) return <section className="min-h-screen p-5 text-white/40">{t('loading')}</section>

  return (
    <section className="min-h-screen p-5 pb-32 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className={label}>{t('profile.title')}</p>
          <h1 className="mt-2 text-4xl font-semibold">{displayName}</h1>
          {email && <p className="mt-1 text-sm text-white/50">{email}</p>}
        </div>
{email ? (
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-red-300/30 bg-red-300/10 px-3 py-2 text-sm text-red-300 hover:bg-red-300/20"
          >
            <LogOut className="size-4" /> {t('profile.signOut')}
          </button>
        ) : authReady ? (
          <Link
            href="/login?next=/profile"
            className="flex items-center gap-2 rounded-lg border border-[#1f88ff]/40 bg-[#1f88ff]/10 px-3 py-2 text-sm text-[#55a7ff] hover:bg-[#1f88ff]/20"
          >
            <LogIn className="size-4" /> {t('profile.signIn')}
          </Link>
        ) : null}
      </div>

      <Link href="#settings" className="mt-5 inline-flex min-h-11 items-center text-sm text-white/60">{t('settings.title')}</Link>
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0a0a0acc] p-6">
        {/* Avatar */}
        <label className="flex flex-col items-center gap-3 cursor-pointer group">
          <div className="relative size-24 rounded-full bg-[#1f88ff]/20 flex items-center justify-center overflow-hidden">
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <Camera className="size-8 text-[#1f88ff]" />
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-full" />
          </div>
          <span className="text-xs text-white/50">{t('profile.photo')}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </label>

        {error && <p className="mt-4 text-sm text-red-300 text-center">{error}</p>}

        {/* Nome */}
        <div className="mt-6">
          <p className={label}>{t('profile.name')}</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('profile.name')}
            className={input}
          />
        </div>

        {/* Username */}
        <div className="mt-4">
          <p className={label}>Username</p>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/g, '').toLowerCase())}
            placeholder="username"
            className={input}
          />
          {username && <p className="mt-1 text-xs text-white/40">@{username}</p>}
        </div>

        {/* Nacionalidade */}
        <div className="mt-4">
          <p className={label}>{t('profile.nationality')}</p>
          <select
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className={input + ' cursor-pointer'}
          >
            <option value="">{t('profile.select')}</option>
            <option value="Angola">{regions.of('AO')}</option>
            <option value="Portugal">{regions.of('PT')}</option>
            <option value="Brazil">{regions.of('BR')}</option>
            <option value="United States">{regions.of('US')}</option>
            <option value="United Kingdom">{regions.of('GB')}</option>
            <option value="France">{regions.of('FR')}</option>
            <option value="Germany">{regions.of('DE')}</option>
            <option value="Spain">{regions.of('ES')}</option>
            <option value="Italy">{regions.of('IT')}</option>
            <option value="Netherlands">{regions.of('NL')}</option>
            <option value="Belgium">{regions.of('BE')}</option>
            <option value="Switzerland">{regions.of('CH')}</option>
            <option value="Austria">{regions.of('AT')}</option>
            <option value="Poland">{regions.of('PL')}</option>
            <option value="Sweden">{regions.of('SE')}</option>
            <option value="Norway">{regions.of('NO')}</option>
            <option value="Denmark">{regions.of('DK')}</option>
            <option value="Finland">{regions.of('FI')}</option>
            <option value="Greece">{regions.of('GR')}</option>
            <option value="Turkey">{regions.of('TR')}</option>
            <option value="Russia">{regions.of('RU')}</option>
            <option value="Japan">{regions.of('JP')}</option>
            <option value="South Korea">{regions.of('KR')}</option>
            <option value="China">{regions.of('CN')}</option>
            <option value="India">{regions.of('IN')}</option>
            <option value="Australia">{regions.of('AU')}</option>
            <option value="New Zealand">{regions.of('NZ')}</option>
            <option value="Canada">{regions.of('CA')}</option>
            <option value="Mexico">{regions.of('MX')}</option>
            <option value="Argentina">{regions.of('AR')}</option>
            <option value="South Africa">{regions.of('ZA')}</option>
            <option value="Egypt">{regions.of('EG')}</option>
            <option value="Nigeria">{regions.of('NG')}</option>
            <option value="Kenya">{regions.of('KE')}</option>
            <option value="Morocco">{regions.of('MA')}</option>
            <option value="United Arab Emirates">{regions.of('AE')}</option>
            <option value="Saudi Arabia">{regions.of('SA')}</option>
            <option value="Israel">{regions.of('IL')}</option>
            <option value="Thailand">{regions.of('TH')}</option>
            <option value="Vietnam">{regions.of('VN')}</option>
            <option value="Indonesia">{regions.of('ID')}</option>
            <option value="Malaysia">{regions.of('MY')}</option>
            <option value="Singapore">{regions.of('SG')}</option>
            <option value="Philippines">{regions.of('PH')}</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-[#1f88ff] py-3 font-semibold hover:bg-[#1f88ff]/90 disabled:opacity-50"
        >
          {t(saving?'profile.saving':'profile.save')}
        </button>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-[#0a0a0acc] p-4 text-center">
          <p className="text-2xl font-bold text-[#1f88ff]">{stats?.totalFlights || 0}</p>
          <p className="text-xs text-white/50 mt-1">{t('profile.flights')}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0a0a0acc] p-4 text-center">
          <p className="text-2xl font-bold text-[#1f88ff]">{stats?.totalHours || 0}</p>
          <p className="text-xs text-white/50 mt-1">{t('profile.hours')}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0a0a0acc] p-4 text-center">
          <p className="text-2xl font-bold text-[#1f88ff]">{friendCount}</p>
          <p className="text-xs text-white/50 mt-1">{t('profile.friends')}</p>
        </div>
      </div>

      {/* Partilhar */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0a0a0acc] p-6">
        <p className={label}>{t('profile.share')}</p>
        <h2 className="mt-2 text-lg font-semibold">{t('profile.invite')}</h2>
        <p className="mt-2 text-sm text-white/50">{t('profile.inviteHint')}</p>

        <button
          onClick={handleCopyLink}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-[#1f88ff]/40 bg-[#1f88ff]/10 py-3 text-sm font-semibold hover:border-[#1f88ff]"
        >
          <Copy className="size-4" /> {t(copiedLink?'profile.copied':'profile.copy')}
        </button>

        <Link
          href="/friends"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f88ff] py-3 font-semibold"
        >
          <Users className="size-4" /> {t('profile.friends')} ({friendCount})
        </Link>
      </div>

      {/* Definições Avançadas */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0a0a0acc] p-6">
        <p className={label}>{t('profile.advanced')}</p>
        
        {!devUnlocked ? (
          <div className="mt-4">
            <p className="text-sm text-white/50 mb-3">{t('profile.dev')}</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={devCode}
                onChange={(e) => setDevCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockDeveloper()}
                placeholder={t('profile.code')}
                className={input}
              />
              <button
                onClick={handleUnlockDeveloper}
                className="rounded-xl bg-[#1f88ff] px-4 font-semibold shrink-0 flex items-center gap-2"
              >
                <Lock className="size-4" /> {t('profile.unlock')}
              </button>
            </div>
            {devError && <p className="mt-2 text-sm text-red-300">{devError}</p>}
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-center gap-3 rounded-xl border border-[#1f88ff]/30 bg-[#1f88ff]/10 p-4">
              <input
                type="checkbox"
                checked={developer}
                onChange={(e) => setDeveloper(e.target.checked)}
                className="w-4 h-4 cursor-pointer"
              />
              <label className="text-sm text-white/70">{t('profile.dev')}</label>
            </div>
          </div>
        )}
      </div>
      <PushSettings/>
      <div id="settings" className="mt-8 scroll-mt-16 border-t border-white/10 py-6"><h2 className="text-xl font-semibold">{t('settings.title')}</h2><p className="mt-2 font-mono text-xs text-white/35">MyRoster · v{APP_VERSION}</p><p className="mt-2 text-sm text-white/45">{t('settings.languageHint')}</p><LanguageSelect className="mt-5"/><CookieSettingsButton className="mt-5 min-h-11 text-sm text-white/50"/></div>
    </section>
  )
}

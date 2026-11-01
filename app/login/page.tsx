'use client'
import {clearDevicePush} from '@/lib/push-client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandLogo from '@/components/BrandLogo'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const safeNext = () => {
  try {
    const n = new URLSearchParams(window.location.search).get('next') || '/'
    return n.startsWith('/') && !n.startsWith('//') ? n : '/'
  } catch {
    return '/'
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)

  useEffect(() => {
    setNeedsLogin(new URLSearchParams(window.location.search).has('next'))
    supabase.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null))
  }, [])

  const submit = async () => {
    setBusy(true)
    setMsg('')
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) return setMsg(error.message)
    if (mode === 'up' && !data.session) return setMsg('Check your email to confirm your account, then sign in.')
    router.push(safeNext())
  }

  const signOut = async () => {
    await clearDevicePush().catch(()=>{})
    await supabase.auth.signOut()
    setUser(null)
  }

  const input = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-[#1f88ff]'

  return (
    <section className="min-h-screen p-5 sm:p-8">
      <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-white/10 bg-black/50 p-6">
        <BrandLogo className="h-10 w-10" />
        {user ? (
          <>
            <h1 className="text-2xl font-semibold">Signed in</h1>
            <p className="mt-2 text-sm text-white/60">{user}</p>
            <button onClick={() => router.push(safeNext())} className="mt-6 w-full rounded-xl bg-[#1f88ff] px-4 py-3 text-sm font-semibold">
              Continue
            </button>
            <button onClick={signOut} className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium">
              Sign out
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{mode === 'in' ? 'Sign in' : 'Create account'}</h1>
            {needsLogin && <p className="mt-2 text-sm text-white/50">Sign in to plan and log your flights.</p>}
            <div className="mt-6 space-y-3">
              <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className={input} type="password" placeholder="Password (min. 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {msg && <p className="mt-3 text-sm text-red-300">{msg}</p>}
            <button onClick={submit} disabled={busy || !email || !password} className="mt-5 w-full rounded-xl bg-[#1f88ff] px-4 py-3 text-sm font-semibold disabled:opacity-40">
              {busy ? '...' : mode === 'in' ? 'Sign in' : 'Sign up'}
            </button>
            <button onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className="mt-4 w-full text-sm text-[#55a7ff]">
              {mode === 'in' ? 'No account? Create one' : 'Already have an account? Sign in'}
            </button>
            <p className="mt-5 text-center text-xs leading-relaxed text-white/45">
              By {mode === 'in' ? 'signing in' : 'creating an account'}, you agree to our{' '}
              <Link href="/terms" className="text-[#55a7ff] underline">Terms &amp; Conditions</Link> and{' '}
              <Link href="/privacy" className="text-[#55a7ff] underline">Privacy Policy</Link>. See also our{' '}
              <Link href="/cookies" className="text-[#55a7ff] underline">Cookie Policy</Link>.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
'use client'

import Link from 'next/link'
import { Search, Globe } from 'lucide-react'
import { useT } from '@/lib/i18n'
import WelcomeModals from '@/components/WelcomeModals'
import WhatsNew from '@/components/WhatsNew'

export default function Home() {
  const t = useT()
  return (
    <section className="flex min-h-screen flex-col justify-center p-6 pb-32 sm:p-10">
      <WelcomeModals />
      <WhatsNew />
      <div className="max-w-xl">
        <p className="text-[11px] font-medium uppercase tracking-[.3em] text-white/40">{t('home.kicker')}</p>

        <h1 className="mt-6 text-6xl font-semibold leading-[.95] tracking-[-.05em] text-white sm:text-7xl">
          MyRoster
        </h1>

        <p className="mt-6 max-w-md text-base leading-relaxed text-white/50">{t('home.sub')}</p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/search"
            className="flex min-h-13 items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            <Search className="size-4" />
            {t('home.search')}
          </Link>

          <Link
            href="/airlines"
            className="flex min-h-13 items-center justify-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/50"
          >
            <Globe className="size-4" />
            {t('home.airlines')}
          </Link>
        </div>

        <p className="mt-14 max-w-sm text-xs leading-relaxed text-white/30">{t('home.note')}</p>
      </div>
    </section>
  )
}

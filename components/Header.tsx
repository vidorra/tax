'use client'

import { BookOpen, Calculator, CalendarDays, FolderLock, Menu, Percent, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NAVIGATIE, SITE, isActief } from '@/lib/site'
import type { NavIcoon } from '@/lib/site'
import { cn } from './ui/cn'

const ICONEN: Record<NavIcoon, typeof Calculator> = {
  calculator: Calculator,
  jaar: CalendarDays,
  kennisbank: BookOpen,
  dossier: FolderLock,
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const opEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', opEscape)
    return () => window.removeEventListener('keydown', opEscape)
  }, [menuOpen])

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
        <Link
          href="/"
          className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-lg text-gray-900 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <span aria-hidden="true" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <Percent className="h-4 w-4" />
          </span>
          <span className="truncate text-base font-medium sm:text-lg">{SITE.naam}</span>
        </Link>

        <nav aria-label="Hoofdmenu" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAVIGATIE.map((item) => {
              const Icoon = ICONEN[item.icoon]
              const actief = isActief(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.omschrijving}
                    aria-current={actief ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      actief ? 'bg-primary/10 text-primary-dark' : 'text-gray-600 hover:bg-gray-50 hover:text-primary',
                    )}
                  >
                    <Icoon aria-hidden="true" className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobiel-menu"
          aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-gray-700 transition-colors hover:bg-gray-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
        >
          {menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>

      <nav id="mobiel-menu" aria-label="Hoofdmenu" hidden={!menuOpen} className="border-t border-gray-100 bg-white md:hidden">
        <ul className="mx-auto max-w-6xl space-y-1 px-4 py-3">
          {NAVIGATIE.map((item) => {
            const Icoon = ICONEN[item.icoon]
            const actief = isActief(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={actief ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2 transition-colors',
                    actief ? 'bg-primary/10 text-primary-dark' : 'text-gray-700 hover:bg-gray-50 hover:text-primary',
                  )}
                >
                  <Icoon aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    {item.omschrijving && <span className="block text-xs text-gray-500">{item.omschrijving}</span>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}

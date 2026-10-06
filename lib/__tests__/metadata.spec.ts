import type { Metadata } from 'next'
import { describe, expect, it, vi } from 'vitest'
import { metadata as rootMetadata } from '@/app/layout'
import { SITE } from '@/lib/site'

vi.mock('next/font/google', () => ({ Lexend_Deca: () => ({ variable: 'font', className: 'font' }) }))

/**
 * Next voegt openGraph van layout en pagina niet diep samen: een pagina met
 * een eigen openGraph verliest siteName en locale van de layout, en een
 * pagina zonder openGraph erft og:url '/' van de homepage. Daarom zet elke
 * publieke pagina een volledige openGraph met dezelfde url als de canonical.
 */

const PAGINAS: Record<string, () => Promise<{ metadata: Metadata }>> = {
  '/over/': () => import('@/app/over/page'),
  '/privacy/': () => import('@/app/privacy/page'),
  '/disclaimer/': () => import('@/app/disclaimer/page'),
  '/jaarruimte/': () => import('@/app/jaarruimte/page'),
  '/kinderopvangtoeslag/': () => import('@/app/kinderopvangtoeslag/page'),
  '/box-3/': () => import('@/app/box-3/page'),
  '/bv-of-eenmanszaak/': () => import('@/app/bv-of-eenmanszaak/page'),
  '/middeling/': () => import('@/app/middeling/page'),
  '/kennisbank/': () => import('@/app/kennisbank/page'),
}

function controleer(pad: string, m: Metadata) {
  expect(m.alternates?.canonical, pad).toBe(pad)
  const og = m.openGraph as Record<string, unknown> | undefined
  expect(og, pad).toBeDefined()
  expect(og?.url, pad).toBe(pad)
  expect(og?.siteName, pad).toBe(SITE.naam)
  expect(og?.locale, pad).toBe(SITE.locale)
  expect(og?.title, pad).toBeTruthy()
  expect(og?.description, pad).toBe(m.description)
}

describe('metadata per pagina', () => {
  for (const [pad, laad] of Object.entries(PAGINAS)) {
    it(`${pad} heeft een volledige openGraph gelijk aan de canonical`, async () => {
      const { metadata } = await laad()
      controleer(pad, metadata)
    })
  }

  it('jaarpagina\'s hebben een volledige openGraph', async () => {
    const { generateMetadata } = await import('@/app/[jaar]/page')
    for (const jaar of ['2026', '2027']) {
      const m = await generateMetadata({ params: Promise.resolve({ jaar }) })
      controleer(`/${jaar}/`, m)
    }
  })

  it('de layout zet geen vaste twittertitel die elke pagina overschrijft', () => {
    const tw = rootMetadata.twitter as Record<string, unknown> | undefined
    expect(tw?.title).toBeUndefined()
    expect(tw?.description).toBeUndefined()
  })
})

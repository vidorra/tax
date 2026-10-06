/**
 * Ronde 2 (A4), test 1: elk voorbeeldbestand tegen verwacht.json (posities, stromen, bronbelasting per land, standen,
 * meldingen). De bestanden zijn synthetisch (ronde2/csv-voorbeelden), met de echte kolomkoppen.
 */
import { describe, expect, it } from 'vitest'
import verwacht from './fixtures/verwacht.json'
import { leegInvoer } from '@/lib/dossier/leeg'
import { csv, aantallen, lees, rendement, som } from './hulp'
import { herkenPreset } from '../presets'
import { maakVoorstel } from '../voorstel'
import { leesGeneriek, stelKoppelingVoor } from '../generiek'
import { metRekening } from '../presets/hulp'

const V = verwacht as Record<string, Record<string, unknown>>
const n = (x: unknown) => Number(x)
const invoer2025 = () => leegInvoer(2025)

describe('herkenning', () => {
  it.each([
    ['degiro-rekeningoverzicht-2025-nl.csv', 'degiro-rekening', ',', ','],
    ['degiro-account-2025-en.csv', 'degiro-rekening', ',', '.'],
    ['degiro-portefeuille-2024-12-31-nl.csv', 'degiro-portefeuille', ',', ','],
    ['ibkr-activity-statement-2025.csv', 'ibkr-activity', ',', '.'],
    ['trading212-history-2025.csv', 'trading212', ',', '.'],
    ['saxo-transacties-2025.csv', 'saxo', ',', ','],
    ['bux-transactions-2025.csv', 'bux', ',', '.'],
    ['rabobank-beleggen-transacties-2025.csv', 'rabobank', ';', ','],
    ['bitvavo-transacties-2025.csv', 'bitvavo', ',', '.'],
    ['coinbase-transactions-2025.csv', 'coinbase', ',', '.'],
  ])('%s is %s', (naam, formaat, scheiding, decimaal) => {
    const b = csv(naam)
    expect(herkenPreset(b)?.formaat).toBe(formaat)
    expect(b.scheiding).toBe(scheiding)
    expect(b.decimaal).toBe(decimaal)
  })

  it('het generieke bestand herkent geen preset', () => {
    expect(herkenPreset(csv('generiek-puntkomma.csv'))).toBeNull()
  })
})

describe('DEGIRO (rekeningoverzicht en twee portefeuilles)', () => {
  const e = V['degiro-rekeningoverzicht-2025-nl.csv + degiro-portefeuille-*.csv'] as {
    rekening: Record<string, string>
    posities: Array<Record<string, unknown>>
  }
  const uitkomsten = ['degiro-rekeningoverzicht-2025-nl.csv', 'degiro-portefeuille-2024-12-31-nl.csv', 'degiro-portefeuille-2025-12-31-nl.csv'].map((f) => lees(f))
  // Zonder landentabel: verwacht.json legt het land uit het ISIN vast. Met de echte tabel volgt hieronder de vraag.
  const [v] = maakVoorstel(uitkomsten, { invoer: invoer2025(), jaar: 2025, tabel: [] })

  it('met de echte landentabel: 25% op een Frans dividend past niet bij 12,8% of 15%, dus de vraag naar het land', () => {
    const [echt] = maakVoorstel(uitkomsten, { invoer: invoer2025(), jaar: 2025 })
    const vraag = echt.vragen.find((q) => q.id === 'land:FR009999LV12')
    expect(vraag?.opties?.[0]).toMatchObject({ waarde: 'FR', label: 'Frankrijk' })
    const [beantwoord] = maakVoorstel(uitkomsten, { invoer: invoer2025(), jaar: 2025, keuzes: { [echt.rekening]: { antwoorden: { 'land:FR009999LV12': 'FR' } } } })
    const landen = beantwoord.posities.find((p) => p.rol === 'effecten')!.wordt.bronbelastingen!.map((b) => b.land).sort()
    expect(landen).toEqual(['FR', 'US'])
  })

  it('rekening als geheel', () => {
    expect(v.samenvatting.gestort).toBe(n(e.rekening.externeStortingen))
    expect(v.samenvatting.opgenomen).toBe(n(e.rekening.externeOpnames))
    expect(v.samenvatting.kosten).toBe(n(e.rekening.kosten))
    expect(v.samenvatting.rente).toBe(n(e.rekening.rente))
    expect(v.samenvatting.dividendBruto).toBe(n(e.rekening.brutoDividend))
    expect(v.samenvatting.waardeBegin).toBe(n(e.rekening.waardeBegin_totaal))
    expect(v.samenvatting.waardeEind).toBe(n(e.rekening.waardeEind_totaal))
  })

  it('effecten en geld zoals verwacht', () => {
    const eff = v.posities.find((p) => p.rol === 'effecten')!.wordt
    const geld = v.posities.find((p) => p.rol === 'geld')!.wordt
    const [ve, vg] = e.posities
    expect(eff.categorie).toBe(ve.categorie)
    for (const veld of ['waardeBegin', 'waardeEind', 'stortingen', 'onttrekkingen', 'directeOpbrengsten', 'dividendbelasting'] as const) expect(eff[veld], veld).toBe(n(ve[veld]))
    const bron = (ve.bronbelasting as Array<Record<string, string>>).map((b) => ({ land: b.land, bedrag: n(b.bedrag), bruto: n(b.brutoInkomsten) }))
    expect(eff.bronbelastingen!.map((b) => ({ land: b.land, bedrag: b.bedrag, bruto: b.brutoInkomsten })).sort((a, b) => a.land.localeCompare(b.land))).toEqual(bron.sort((a, b) => a.land.localeCompare(b.land)))
    expect(eff.bronbelastingen!.every((b) => b.soort === 'dividend' && /^bb-/.test(b.id))).toBe(true)
    expect(geld.categorie).toBe(vg.categorie)
    expect(geld.omschrijving).toBe(vg.omschrijving)
    for (const veld of ['waardeBegin', 'waardeEind', 'stortingen', 'onttrekkingen', 'directeOpbrengsten'] as const) expect(geld[veld], veld).toBe(n(vg[veld]))
  })

  it('de som over de posities is het rendement van de rekening: € 367,25', () => {
    const totaal = v.posities.reduce((s, p) => s + rendement(p.wordt), 0)
    expect(Math.round(totaal * 100) / 100).toBe(n(e.rekening.werkelijkRendement))
    expect(Math.round(totaal * 100) / 100).toBe(367.25)
  })

  it('netto dividend op het geld is wat er werkelijk binnenkwam (FX-afronding € 0,02)', () => {
    const r = uitkomsten[0]
    const netto = som(r, 'dividend') + som(r, 'dividendbelasting') + som(r, 'valutaIntern')
    expect(Math.round(netto * 100) / 100).toBe(n(e.rekening.nettoDividendGecrediteerdEUR))
    expect(som(r, 'valutaIntern')).toBe(0.02)
  })

  it('de info-regel zonder bedrag telt niet; de portefeuille-datum komt uit de bestandsnaam', () => {
    expect(uitkomsten[0].gebeurtenissen.some((g) => /overboeking/i.test(g.omschrijving))).toBe(false)
    expect(uitkomsten[1].standen[0].datum).toBe('2024-12-31')
    expect(uitkomsten[2].standen[0].regels.find((r) => r.soort === 'geld')?.eur).toBe(207.71)
    expect(v.vragen.filter((q) => q.id.startsWith('peildatum:')).map((q) => q.gekozen)).toEqual(['begin', 'eind'])
    expect(v.ontbreekt).toEqual([])
    expect(v.meldingen).toEqual([])
  })

  it('Engelse export met punt als decimaal', () => {
    const e2 = V['degiro-account-2025-en.csv']
    const r = lees('degiro-account-2025-en.csv')
    expect(som(r, 'storting')).toBe(n(e2.externeStortingen))
    expect(r.gebeurtenissen.filter((g) => g.soort === 'dividend')).toHaveLength(Number(e2.brutoDividendRegels) - 1)
    expect(r.gebeurtenissen.filter((g) => g.soort === 'dividend' || g.soort === 'dividendbelasting')).toHaveLength(Number(e2.brutoDividendRegels) + 2)
    expect(r.gebeurtenissen.find((g) => g.soort === 'dividend' && g.valuta === 'USD')?.eur).toBe(5.53)
  })
})

describe('Interactive Brokers', () => {
  const e = V['ibkr-activity-statement-2025.csv'] as { rekening: Record<string, string>; bronbelastingPerLandLokaal: Record<string, string>; brutoPerLandLokaal: Record<string, string> }
  const u = lees('ibkr-activity-statement-2025.csv', 'ibkr:0123456789abcdef')
  const [v] = maakVoorstel([u], { invoer: invoer2025(), jaar: 2025 })

  it('standen uit Net Asset Value, cash naar het geld', () => {
    const eff = v.posities.find((p) => p.rol === 'effecten')!.wordt
    const geld = v.posities.find((p) => p.rol === 'geld')!.wordt
    expect(eff.waardeBegin + geld.waardeBegin).toBe(n(e.rekening.waardeBegin))
    expect(centen((eff.waardeEind ?? 0) + (geld.waardeEind ?? 0))).toBe(n(e.rekening.waardeEind))
    expect(geld.waardeBegin).toBe(n(e.rekening.kasBegin))
    expect(geld.waardeEind).toBe(n(e.rekening.kasEind))
  })

  it('stromen in euro’s uit de regels "Total in EUR"', () => {
    expect(v.samenvatting.gestort).toBe(n(e.rekening.stortingenExtern))
    expect(v.samenvatting.opgenomen).toBe(n(e.rekening.opnamesExtern))
    expect(v.samenvatting.dividendBruto).toBe(n(e.rekening.dividendBrutoEUR))
    expect(v.samenvatting.rente).toBe(n(e.rekening.renteEUR))
    expect(v.samenvatting.kosten).toBe(n(e.rekening.kostenEUR))
    expect(v.samenvatting.bronbelasting).toBe(n(e.rekening.bronbelastingEUR))
    expect(centen(som(u, 'dividend') + som(u, 'dividendbelasting') + som(u, 'rente'))).toBe(n(e.rekening.nettoOpbrengstGecrediteerd))
  })

  it('bronbelasting per land in lokale valuta: land uit "- XX Tax", correctie gesaldeerd', () => {
    const per: Record<string, number> = {}
    for (const g of u.gebeurtenissen.filter((x) => x.soort === 'dividendbelasting')) {
      const sleutel = `${g.opRente ? 'onbekend' : g.land}/${g.valuta}`
      per[sleutel] = centen((per[sleutel] ?? 0) - g.bedrag)
    }
    expect(per).toEqual(Object.fromEntries(Object.entries(e.bronbelastingPerLandLokaal).map(([k, x]) => [k, n(x)])))
    // De GDR met een US-ISIN had KR-belasting.
    expect(u.gebeurtenissen.find((g) => g.soort === 'dividend' && g.isin === 'USY99999HM15')?.land).toBe('KR')
  })

  it('bruto per land in lokale valuta; payment in lieu en een fonds zonder inhouding apart', () => {
    const per: Record<string, number> = {}
    for (const g of u.gebeurtenissen.filter((x) => x.soort === 'dividend')) {
      const sleutel = g.geenVerdragsdividend ? `payment-in-lieu/${g.valuta}` : `${g.land ?? 'geen'}/${g.valuta}`
      per[sleutel] = centen((per[sleutel] ?? 0) + g.bedrag)
    }
    // Zonder inhouding geen land van de broker: het Ierse fonds staat bij 'geen'.
    expect(per).toEqual(Object.fromEntries(Object.entries(e.brutoPerLandLokaal).map(([k, x]) => [k, n(x)])))
    const eff = v.posities.find((p) => p.rol === 'effecten')!.wordt
    expect(eff.bronbelastingen?.map((b) => b.land).sort()).toEqual(['CA', 'CH', 'KR', 'US'])
    const geld = v.posities.find((p) => p.rol === 'geld')!.wordt
    // 0,31 USD op rente, naar rato van "Total in EUR" (grootste rest): 0,27 of 0,28.
    expect(geld.bronbelastingen).toEqual([expect.objectContaining({ land: '', soort: 'rente', brutoInkomsten: 1.38 })])
    expect(geld.bronbelastingen![0].bedrag).toBeCloseTo(0.28, 1)
    expect(v.vragen.map((q) => q.id)).toContain('land-rente')
    expect(v.meldingen.map((m) => m.id)).toEqual(expect.arrayContaining(['payment-in-lieu', 'afgeleid']))
  })

  it('werkelijk rendement van de rekening: € 2.426,42', () => {
    const totaal = v.posities.reduce((s, p) => s + rendement(p.wordt), 0)
    expect(centen(totaal)).toBe(n(e.rekening.werkelijkRendement))
  })

  it('het rekeningnummer komt uit het bestand, de naam nergens in de uitkomst', () => {
    const p = herkenPreset(csv('ibkr-activity-statement-2025.csv'))!
    expect(p.rekeningnummer?.(csv('ibkr-activity-statement-2025.csv'))).toBe('U0000000')
    expect(JSON.stringify(u)).not.toContain('Voorbeeld Belegger')
    expect(JSON.stringify(v)).not.toContain('U0000000')
  })
})

describe('Trading 212', () => {
  const e = V['trading212-history-2025.csv'] as Record<string, unknown> & { dividend: Array<Record<string, string>>; aantallenEind: Record<string, string> }
  const u = lees('trading212-history-2025.csv', 'trading212:r-test0001')

  it('stortingen, opnames en rente', () => {
    expect(som(u, 'storting')).toBe(n(e.stortingen))
    expect(-som(u, 'opname')).toBe(n(e.opnames))
    expect(som(u, 'rente')).toBe(n(e.renteEUR))
  })

  it('dividend: bruto en belasting lokaal, netto in euro’s', () => {
    const [us, nl] = e.dividend
    const dUs = u.gebeurtenissen.find((g) => g.soort === 'dividend' && g.isin === us.isin)!
    const bUs = u.gebeurtenissen.find((g) => g.soort === 'dividendbelasting' && g.isin === us.isin)!
    expect(`${dUs.bedrag.toFixed(2)} ${dUs.valuta}`).toBe(us.brutoLokaal)
    expect(`${(-bUs.bedrag).toFixed(2)} ${bUs.valuta}`).toBe(us.bronbelastingLokaal)
    expect(centen(dUs.eur! + bUs.eur!)).toBe(n(us.nettoEUR))
    const dNl = u.gebeurtenissen.find((g) => g.soort === 'dividend' && g.isin === nl.isin)!
    const bNl = u.gebeurtenissen.find((g) => g.soort === 'dividendbelasting' && g.isin === nl.isin)!
    expect(dNl.eur).toBe(n(nl.bruto))
    expect(-bNl.eur!).toBe(n(nl.dividendbelasting))
    const [v] = maakVoorstel([u], { invoer: invoer2025(), jaar: 2025 })
    const eff = v.posities.find((p) => p.rol === 'effecten')!.wordt
    expect(eff.dividendbelasting).toBe(n(nl.dividendbelasting))
    expect(eff.bronbelastingen?.map((b) => b.land)).toEqual([us.land])
  })

  it('aantallen aan het eind; UTC wordt Europe/Amsterdam', () => {
    expect(aantallen(u)).toEqual(Object.fromEntries(Object.entries(e.aantallenEind).map(([k, x]) => [k, n(x)])))
    // 2025-03-31 22:06 UTC is 1 april in Nederland (zomertijd).
    expect(u.gebeurtenissen.find((g) => g.soort === 'rente')?.datum).toBe('2025-04-01')
  })

  it('Notes (rekeningnummer van de bank) komt niet mee', () => {
    expect(JSON.stringify(u)).not.toContain('NL00TEST')
  })
})

describe('Saxo', () => {
  const e = V['saxo-transacties-2025.csv'] as Record<string, unknown>
  const u = lees('saxo-transacties-2025.csv', 'saxo:r-test0001')
  it('stortingen, opnames, kosten; dividend netto met de koers uit het bestand', () => {
    expect(som(u, 'storting')).toBe(n(e.stortingen))
    expect(-som(u, 'opname')).toBe(n(e.opnames))
    expect(-som(u, 'kosten')).toBe(n(e.kosten))
    const div = u.gebeurtenissen.filter((g) => g.soort === 'dividend')
    expect(div.map((d) => d.eur)).toEqual([centen(30.24 * 0.92139706), 15.94])
    expect(div.every((d) => d.brutoOnbekend)).toBe(true)
    expect(u.meldingen.map((m) => m.id)).toContain('bruto-onbekend')
    expect(u.gebeurtenissen.find((g) => g.soort === 'koop' && g.isin === 'NL0099990010')?.datum).toBe('2025-03-18')
  })
})

describe('BUX', () => {
  const e = V['bux-transactions-2025.csv'] as Record<string, unknown> & { dividend: Array<Record<string, string | null>> }
  const u = lees('bux-transactions-2025.csv', 'bux:r-test0001')
  it('stromen en dividend met en zonder bruto', () => {
    expect(som(u, 'storting')).toBe(n(e.stortingen))
    expect(-som(u, 'opname')).toBe(n(e.opnames))
    expect(-som(u, 'kosten')).toBe(n(e.kosten))
    expect(som(u, 'rente')).toBe(n(e.renteEUR))
    const [met, zonder] = e.dividend
    const d = u.gebeurtenissen.filter((g) => g.soort === 'dividend')
    expect(d[0].eur).toBe(n(met.bruto))
    expect(-som(u, 'dividendbelasting')).toBe(n(met.dividendbelasting))
    expect(d[1]).toMatchObject({ eur: n(zonder.netto), brutoOnbekend: true })
    expect(u.meldingen.find((m) => m.id === 'bruto-onbekend')?.regels).toEqual([d[1].regel])
  })
})

describe('Rabobank', () => {
  const e = V['rabobank-beleggen-transacties-2025.csv'] as Record<string, unknown> & { dividend: Record<string, string> }
  const u = lees('rabobank-beleggen-transacties-2025.csv', 'rabobank:0123456789abcdef')
  it('puntkomma, BOM, CRLF; bruto in Waarde en netto in Bedrag', () => {
    expect(som(u, 'storting')).toBe(n(e.stortingen))
    expect(-som(u, 'opname')).toBe(n(e.opnames))
    expect(-som(u, 'kosten')).toBe(n(e.kosten))
    expect(som(u, 'rente')).toBe(n(e.renteEUR))
    expect(-som(u, 'koop')).toBe(n(e.aankopen))
    expect(som(u, 'verkoop')).toBe(n(e.verkopen))
    expect(som(u, 'dividend')).toBe(n(e.dividend.bruto))
    expect(-som(u, 'dividendbelasting')).toBe(n(e.dividend.dividendbelasting))
    const [v] = maakVoorstel([u], { invoer: invoer2025(), jaar: 2025 })
    expect(v.posities.find((p) => p.rol === 'effecten')!.wordt.dividendbelasting).toBe(n(e.dividend.dividendbelasting))
    expect(v.posities.find((p) => p.rol === 'geld')!.wordt.categorie).toBe('bankNL')
  })
  it('het portefeuillenummer is alleen beschikbaar voor de sleutel', () => {
    expect(herkenPreset(csv('rabobank-beleggen-transacties-2025.csv'))!.rekeningnummer?.(csv('rabobank-beleggen-transacties-2025.csv'))).toBe('99990001')
  })
})

describe('Bitvavo', () => {
  const e = V['bitvavo-transacties-2025.csv'] as Record<string, unknown> & { aantallenEind: Record<string, string> }
  const u = lees('bitvavo-transacties-2025.csv', 'bitvavo:r-test0001')
  it('euro’s, aantallen, staking en de vraag over het externe adres', () => {
    expect(som(u, 'storting')).toBe(n(e.stortingenEUR))
    expect(-som(u, 'opname')).toBe(n(e.opnamesEUR))
    const a = aantallen(u)
    expect(a.BTC).toBe(n(e.aantallenEind.BTC))
    expect(a.ETH).toBe(n(e.aantallenEind.ETH))
    const euroSaldo = centen(u.gebeurtenissen.filter((g) => g.valuta === 'EUR').reduce((s, g) => s + (g.eur ?? 0), 0))
    expect(euroSaldo).toBe(n(e.aantallenEind.EUR))
    expect(u.gebeurtenissen.filter((g) => g.soort === 'staking').reduce((t, g) => t + (g.aantal ?? 0), 0)).toBe(n(e.stakingETH))
    const [v] = maakVoorstel([u], { invoer: invoer2025(), jaar: 2025 })
    expect(v.vragen.some((q) => q.id.startsWith('wallet:'))).toBe(true)
    expect(v.vragen.find((q) => q.id === 'geld-bank')?.verplicht).toBe(true)
    expect(v.ontbreekt.filter((o) => o.veld === 'koers').map((o) => (o as { valuta?: string }).valuta)).toEqual(['ETH'])
    expect(JSON.stringify(u)).not.toContain('NL00***00')
  })
})

describe('Coinbase', () => {
  const e = V['coinbase-transactions-2025.csv'] as Record<string, unknown> & { aantallenEind: Record<string, string> }
  const u = lees('coinbase-transactions-2025.csv', 'coinbase:r-test0001')
  it('voorloopregels, valutateken, Convert', () => {
    expect(csv('coinbase-transactions-2025.csv').voorloop).toHaveLength(Number(e.voorloopregels))
    expect(som(u, 'storting')).toBe(n(e.stortingenEUR))
    const a = aantallen(u)
    expect(a.BTC).toBe(n(e.aantallenEind.BTC))
    expect(a.XRP).toBe(n(e.aantallenEind.XRP))
    expect(u.gebeurtenissen.find((g) => g.soort === 'cryptoUit')).toMatchObject({ eur: -86, extern: true })
    expect(u.meldingen.map((m) => m.id)).toContain('omwisseling')
    expect(JSON.stringify(u)).not.toContain('Voorbeeld Gebruiker')
  })
})

describe('generieke koppeling', () => {
  const e = V['generiek-puntkomma.csv'] as Record<string, unknown> & { koppeling: Record<string, string>; waardenSoort: Record<string, string>; bronbelasting: Record<string, string> }
  const b = csv('generiek-puntkomma.csv')
  const k = stelKoppelingVoor(b)
  it('voorstel uit de kopnamen en de waarden', () => {
    for (const [betekenis, kop] of Object.entries(e.koppeling)) expect(k.kolommen[b.kop.indexOf(kop)], kop).toBe(betekenis)
    expect(k.waarden).toEqual(e.waardenSoort)
    expect(b.decimaal).toBe(e.decimaal)
  })
  it('bedragen met duizendtalpunt, bronbelasting per land', () => {
    const u = metRekening(leesGeneriek(b, k, { jaar: 2025 }), 'generiek:r-test0001')
    expect(som(u, 'storting')).toBe(n(e.stortingen))
    expect(-som(u, 'opname')).toBe(n(e.opnames))
    expect(som(u, 'dividend')).toBe(n(e.dividendBruto))
    expect(som(u, 'rente')).toBe(n(e.rente))
    const [v] = maakVoorstel([u], { invoer: invoer2025(), jaar: 2025 })
    const eff = v.posities.find((p) => p.rol === 'effecten')!.wordt
    expect(eff.bronbelastingen).toEqual([expect.objectContaining({ land: 'DE', bedrag: n(e.bronbelasting.DE), brutoInkomsten: 42 })])
  })
})

function centen(x: number) {
  return Math.round(x * 100) / 100
}

/**
 * Ronde 2 (A3): controles op de invoer zelf. Ontbrekende gegevens die de berekening of het aangifteprogramma nodig heeft
 * zijn een fout die je niet kunt negeren ('nee': invullen); beperkingen van het online programma een let op; bestaande
 * meldingen van de engine die iets te doen geven (urencriterium, tegenbewijs, jaarruimte) komen hier als let op of info
 * terug en staan dan niet ook bij Meldingen (`Controle.melding`). Zie taak-A3 hoofdstuk 5. Puur: geen React, geen I/O.
 */
import type { HuishoudenInvoer, OndernemingResultaat, PersoonInvoer, Waarschuwing } from '@/lib/tax/types'
import { itemSleutel } from '@/lib/dossier/ids'
import { leegPersoon } from '@/lib/dossier/leeg'
import { veldVan, type VeldId } from '@/lib/dossier/veld'
import { euro } from '@/lib/tax/uitleg'
import { ONLINE_PROGRAMMA, type Controle, type ControleGebied, type ControleRegel } from '../types'
import { bedragVingerafdruk, lijstVingerafdruk } from '../vingerafdruk'
import { SECTIE, alleOndernemingen, ondernemingNaam, persoonNaam, waarOnderneming, waarPersoon } from './hulp'

const leeg = (x: string | undefined | null) => typeof x !== 'string' || x.trim() === ''

/** Geboortedatum ontbreekt: zonder kan de tool de AOW-leeftijd en de heffingskortingen niet bepalen. */
export const geboortedatumRegel: ControleRegel = ({ invoer }) =>
  invoer.personen
    .filter((p) => leeg(p.geboortedatum))
    .map(
      (p): Controle => ({
        id: `geboortedatum:${p.id}`,
        regel: 'geboortedatum',
        ernst: 'fout',
        titel: 'Geboortedatum ontbreekt',
        uitleg: `Zonder geboortedatum kan de tool de AOW-leeftijd en de heffingskortingen van ${persoonNaam(p)} niet bepalen.`,
        waar: persoonNaam(p),
        persoon: p.id,
        gebied: 'huishouden',
        veld: veldVan.persoon(p.id, 'geboortedatum'),
        sectie: SECTIE.huishouden,
        negeren: 'nee',
        vingerafdruk: 'leeg',
      }),
    )

/** Fiscaal partner aan, maar persoon B ontbreekt. Een lege geboortedatum van B vangt `geboortedatum:B`. */
export const partnerZonderBRegel: ControleRegel = ({ invoer }) => {
  if (!invoer.fiscaalPartner || invoer.personen.some((p) => p.id === 'B')) return []
  return [
    {
      id: 'partner-zonder-b',
      regel: 'partner-zonder-b',
      ernst: 'fout',
      titel: 'Gegevens van je partner ontbreken',
      uitleg: 'Je hebt fiscaal partner aangezet, maar de gegevens van Persoon B zijn niet compleet.',
      gebied: 'huishouden',
      veld: 'huishouden/fiscaalPartner',
      sectie: SECTIE.huishouden,
      negeren: 'nee',
      vingerafdruk: lijstVingerafdruk(['persoon B']),
      oplossing: {
        label: 'Persoon B toevoegen',
        pas: (d) => {
          if (!d.personen.some((p) => p.id === 'B')) d.personen.push(leegPersoon('B', d.jaar))
        },
      },
    },
  ]
}

interface LeegVeld {
  veld: VeldId
  label: string
  gebied: ControleGebied
  sectie: string
  persoon?: PersoonInvoer['id']
}

/** Alle lege namen en omschrijvingen die het aangifteprogramma vraagt, in de volgorde van de pagina. */
export function legeVerplichteVelden(invoer: HuishoudenInvoer): LeegVeld[] {
  const uit: LeegVeld[] = []
  const tweePersonen = invoer.personen.length > 1
  const bij = (p: PersoonInvoer) => (tweePersonen ? `, ${persoonNaam(p)}` : '')
  for (const p of invoer.personen) {
    ;(p.ondernemingen ?? []).forEach((o, i) => {
      const k = itemSleutel(o, i)
      const plek = { gebied: 'onderneming' as const, sectie: SECTIE.ondernemingen(p.id), persoon: p.id }
      if (leeg(o.naam)) uit.push({ ...plek, veld: veldVan.onderneming(p.id, k, 'naam'), label: `Naam van onderneming ${i + 1}${bij(p)}` })
      const naam = ondernemingNaam(o)
      ;(o.activa ?? []).forEach((a, j) => {
        if (leeg(a.omschrijving)) uit.push({ ...plek, veld: veldVan.onderneming(p.id, k, `activa:${j}`, 'omschrijving'), label: `Omschrijving van bedrijfsmiddel ${j + 1} bij ${naam}` })
      })
      ;(o.investeringen ?? []).forEach((inv, j) => {
        if (leeg(inv.omschrijving)) uit.push({ ...plek, veld: veldVan.onderneming(p.id, k, `investering:${itemSleutel(inv, j)}`, 'omschrijving'), label: `Omschrijving van investering ${j + 1} bij ${naam}` })
      })
      ;(o.desinvesteringen ?? []).forEach((d, j) => {
        if (leeg(d.omschrijving)) uit.push({ ...plek, veld: veldVan.onderneming(p.id, k, `desinvestering:${j}`, 'omschrijving'), label: `Omschrijving van verkoop ${j + 1} bij ${naam}` })
      })
      ;(o.opdrachtgevers ?? []).forEach((og, j) => {
        if (leeg(og.naam)) uit.push({ ...plek, veld: veldVan.onderneming(p.id, k, `opdrachtgever:${j}`, 'naam'), label: `Naam van opdrachtgever ${j + 1} bij ${naam}` })
      })
    })
    ;(p.loon ?? []).forEach((l, i) => {
      if (leeg(l.omschrijving)) {
        uit.push({ veld: veldVan.persoon(p.id, `loon:${itemSleutel(l, i)}`, 'omschrijving'), label: `Omschrijving van loon of uitkering ${i + 1}${bij(p)}`, gebied: 'loon', sectie: SECTIE.loon(p.id), persoon: p.id })
      }
    })
  }
  ;(invoer.eigenWoning?.leningdelen ?? []).forEach((l, i) => {
    if (leeg(l.omschrijving)) uit.push({ veld: veldVan.eigenWoning(`leningdeel:${itemSleutel(l, i)}`, 'omschrijving'), label: `Omschrijving van leningdeel ${i + 1}`, gebied: 'woning', sectie: SECTIE.woning })
  })
  invoer.box3.posities.forEach((x, i) => {
    if (leeg(x.omschrijving)) uit.push({ veld: veldVan.positie(x.id, 'omschrijving'), label: `Omschrijving van bezitting ${i + 1}`, gebied: 'box3', sectie: SECTIE.vermogen })
  })
  invoer.box3.schulden.forEach((x, i) => {
    if (leeg(x.omschrijving)) uit.push({ veld: veldVan.schuld(x.id, 'omschrijving'), label: `Omschrijving van schuld ${i + 1}`, gebied: 'box3', sectie: SECTIE.vermogen })
  })
  return uit
}

const MAX_VELDEN = 5

/** Naam of omschrijving leeg: het aangifteprogramma vraagt ze (besluit na de nacontrole: niet te negeren). */
export const verplichtLeegRegel: ControleRegel = ({ invoer }) => {
  const lijst = legeVerplichteVelden(invoer)
  if (lijst.length === 0) return []
  const n = lijst.length
  const eerste = lijst[0]
  const getoond = lijst.slice(0, MAX_VELDEN)
  const rest = n - getoond.length
  return [
    {
      id: 'verplicht-leeg',
      regel: 'verplicht-leeg',
      ernst: 'fout',
      titel: n === 1 ? '1 verplicht veld is leeg' : `${n} verplichte velden zijn leeg`,
      uitleg: `Het aangifteprogramma vraagt een naam of omschrijving bij ${n === 1 ? 'dit veld' : 'deze velden'}: ${getoond.map((x) => x.label).join('; ')}${rest > 0 ? `; en nog ${rest}` : ''}.`,
      ...(eerste.persoon ? { persoon: eerste.persoon } : {}),
      gebied: eerste.gebied,
      veld: eerste.veld,
      sectie: eerste.sectie,
      negeren: 'nee',
      vingerafdruk: lijstVingerafdruk(lijst.map((x) => x.veld)),
      velden: getoond.map((x) => ({ veld: x.veld, label: x.label })),
    },
  ]
}

const normNaam = (s: string | undefined) => (s ?? '').trim().toLocaleLowerCase('nl-NL')
const jaarVan = (iso: string | undefined) => (typeof iso === 'string' && /^\d{4}-/.test(iso) ? Number(iso.slice(0, 4)) : NaN)

/**
 * Verkoop van een bedrijfsmiddel uit het register binnen de termijn van de desinvesteringsbijtelling, zonder vastgelegde
 * investeringsaftrek. Alleen als de verkopen van het jaar samen boven de drempel komen (anders volgt er nooit een
 * bijtelling), als het middel duur genoeg was voor investeringsaftrek en als dezelfde verkoop niet al met het percentage
 * in de lijst "Verkochte bedrijfsmiddelen buiten het register" staat (de engine telt dan die regel).
 */
export const desinvesteringPctRegel: ControleRegel = ({ invoer, params, jaar }) => {
  const d = params.ondernemer.waarde.desinvestering
  const kiaMin = params.ondernemer.waarde.kia.minPerBedrijfsmiddel
  const uit: Controle[] = []
  for (const { p, o, sleutel } of alleOndernemingen(invoer)) {
    const verkochtDitJaar = (o.activa ?? []).filter((a) => a.verkocht && jaarVan(a.verkocht.datum) === jaar)
    const totaal =
      verkochtDitJaar.reduce((s, a) => s + Math.max(0, a.verkocht?.verkoopprijs ?? 0), 0) +
      (o.desinvesteringen ?? []).reduce((s, x) => s + Math.max(0, x.verkoopprijs), 0) +
      Math.max(0, o.overigeVerkopen ?? 0)
    if (totaal <= d.drempel) continue
    const handmatig = new Set((o.desinvesteringen ?? []).map((x) => normNaam(x.omschrijving)).filter(Boolean))
    ;(o.activa ?? []).forEach((a, i) => {
      if (!a.verkocht || jaarVan(a.verkocht.datum) !== jaar || a.investeringsaftrek) return
      const aanschafjaar = jaarVan(a.aanschafdatum)
      if (!Number.isFinite(aanschafjaar) || aanschafjaar > jaar || jaar - aanschafjaar >= d.jaren) return
      if (a.aanschafwaarde < kiaMin) return
      if (handmatig.has(normNaam(a.omschrijving))) return
      const actief = a.herkomst ?? String(i)
      const middel = a.omschrijving?.trim() || `bedrijfsmiddel ${i + 1}`
      uit.push({
        id: `desinvestering-pct:${p.id}:${sleutel}:${actief}`,
        regel: 'desinvestering-pct',
        ernst: 'fout',
        titel: 'Investeringsaftrek bij een verkoop ontbreekt',
        uitleg: `Bij de verkoop van ${middel} staat niet welke investeringsaftrek je in ${aanschafjaar} kreeg. Zonder dat kan de desinvesteringsbijtelling niet worden berekend. Kreeg je toen wel investeringsaftrek, zet de verkoop dan met het percentage bij Verkochte bedrijfsmiddelen buiten het register, met dezelfde omschrijving.`,
        waar: waarOnderneming(invoer, p, o),
        persoon: p.id,
        gebied: 'onderneming',
        veld: veldVan.onderneming(p.id, sleutel, `activa:${i}`, 'verkocht.verkoopprijs'),
        sectie: SECTIE.ondernemingen(p.id),
        negeren: 'nee',
        vingerafdruk: `actief=${actief}`,
        oplossing: {
          label: 'Ik kreeg er geen investeringsaftrek over',
          pas: (x) => {
            const doel = x.personen.find((q) => q.id === p.id)?.ondernemingen.find((q, k) => itemSleutel(q, k) === sleutel)?.activa?.[i]
            if (doel && !doel.investeringsaftrek) doel.investeringsaftrek = { regeling: 'kia', jaar: aanschafjaar, genotenPct: 0 }
          },
        },
      })
    })
  }
  return uit
}

/** Tegenbewijs aan, maar bij een bezitting ontbreekt de waarde aan het eind van het jaar. */
export const tegenbewijsEindRegel: ControleRegel = ({ invoer, params, jaar }) => {
  const tb = params.box3.waarde.tegenbewijs
  if (invoer.box3.tegenbewijs !== true || !tb.beschikbaar || tb.kanaal === 'geen') return []
  const zonder = invoer.box3.posities.filter((x) => x.waardeEind === undefined && !(x.categorie === 'onroerend' && x.woz))
  if (zonder.length === 0) return []
  const naam = (x: (typeof zonder)[number]) => x.omschrijving?.trim() || 'een bezitting'
  const getoond = zonder.slice(0, MAX_VELDEN)
  return [
    {
      id: 'tegenbewijs-eind',
      regel: 'tegenbewijs-eind',
      ernst: 'fout',
      titel: `Waarde op 1 januari ${jaar + 1} ontbreekt`,
      uitleg:
        zonder.length === 1
          ? `Voor tegenbewijs is per bezitting de waarde aan het eind nodig. Bij ${naam(zonder[0])} ontbreekt die.`
          : `Voor tegenbewijs is per bezitting de waarde aan het eind nodig. Bij ${zonder.length} bezittingen ontbreekt die.`,
      gebied: 'box3',
      veld: veldVan.positie(zonder[0].id, 'waardeEind'),
      sectie: SECTIE.vermogen,
      negeren: 'nee',
      vingerafdruk: lijstVingerafdruk(zonder.map((x) => x.id)),
      ...(zonder.length > 1 ? { velden: getoond.map((x) => ({ veld: veldVan.positie(x.id, 'waardeEind'), label: `Waarde op 1 januari ${jaar + 1} van ${naam(x)}` })) } : {}),
    },
  ]
}

/** Meer ondernemingen dan het online programma per persoon kent: een let op (de berekening klopt wel). */
export const ondernemingenMaxRegel: ControleRegel = ({ invoer }) => {
  const max = ONLINE_PROGRAMMA.maxOndernemingenPerPersoon
  return invoer.personen
    .filter((p) => (p.ondernemingen?.length ?? 0) > max)
    .map(
      (p): Controle => ({
        id: `ondernemingen-max:${p.id}`,
        regel: 'ondernemingen-max',
        ernst: 'let-op',
        titel: 'Meer ondernemingen dan het online programma kent',
        uitleg: `Het online programma kent hooguit drie ondernemingen per persoon. Bij ${persoonNaam(p)} staan er ${p.ondernemingen.length}.`,
        ...(waarPersoon(invoer, p) ? { waar: waarPersoon(invoer, p) } : {}),
        persoon: p.id,
        gebied: 'onderneming',
        veld: null,
        sectie: SECTIE.ondernemingen(p.id),
        linkLabel: 'Naar de ondernemingen',
        negeren: 'gezien',
        vingerafdruk: `aantal=${p.ondernemingen.length}`,
      }),
    )
}

/** Melding van de engine bij een onderneming waarvan het id op `achtervoegsel` eindigt. */
function ondernemingMelding(r: OndernemingResultaat | undefined, achtervoegsel: string): Waarschuwing | undefined {
  return r?.waarschuwingen?.find((w) => w.id.endsWith(achtervoegsel))
}

/** Bestaande melding: urencriterium zelf opgegeven, maar de ingevulde uren wijzen op het tegendeel. */
export const urencriteriumUrenRegel: ControleRegel = ({ invoer, resultaat }) => {
  if (!resultaat) return []
  const uit: Controle[] = []
  for (const { p, o, index, sleutel } of alleOndernemingen(invoer)) {
    const r = resultaat.personen.find((x) => x.id === p.id)?.ondernemingen[index]
    const w = ondernemingMelding(r, '.uren.afwijkend')
    if (!w) continue
    uit.push({
      id: `urencriterium-uren:${p.id}:${sleutel}`,
      regel: 'urencriterium-uren',
      ernst: 'let-op',
      titel: 'Urencriterium en uren passen niet bij elkaar',
      uitleg: w.tekst,
      waar: waarOnderneming(invoer, p, o),
      persoon: p.id,
      gebied: 'onderneming',
      veld: veldVan.onderneming(p.id, sleutel, 'uren.onderneming'),
      sectie: SECTIE.ondernemingen(p.id),
      negeren: 'gezien',
      vingerafdruk: bedragVingerafdruk('uren', o.uren.onderneming),
      melding: w.id,
    })
  }
  return uit
}

/** Bestaande melding van box 3: het werkelijk rendement is lager dan het forfait (info). */
export const tegenbewijsLoontRegel: ControleRegel = ({ resultaat }) => {
  if (!resultaat) return []
  const w = [...resultaat.waarschuwingen, ...(resultaat.box3?.waarschuwingen ?? [])].find((x) => x.id === 'box3-tegenbewijs-loont')
  if (!w) return []
  return [
    {
      id: 'tegenbewijs-loont',
      regel: 'tegenbewijs-loont',
      ernst: 'info',
      titel: 'Tegenbewijs lijkt te lonen',
      uitleg: w.tekst,
      gebied: 'box3',
      veld: null,
      sectie: SECTIE.vermogen,
      linkLabel: 'Naar box 3',
      negeren: 'gezien',
      vingerafdruk: 'loont',
      melding: w.id,
    },
  ]
}

/** Bestaande melding van de lijfrente: er staat nog niet-gebruikte jaarruimte open (info). */
export const jaarruimteRegel: ControleRegel = ({ invoer, resultaat, jaar }) => {
  if (!resultaat) return []
  const uit: Controle[] = []
  for (const r of resultaat.personen) {
    const iv = r.inkomensvoorziening
    const w = [...(iv?.waarschuwingen ?? []), ...r.waarschuwingen].find((x) => x.id === 'lijfrente.openstaand')
    if (!w) continue
    const openstaand = (iv?.tabel ?? []).reduce((s, t) => s + (t.vervaltNa > jaar ? t.resterend : 0), 0)
    const p = invoer.personen.find((x) => x.id === r.id)
    uit.push({
      id: `jaarruimte:${r.id}`,
      regel: 'jaarruimte',
      ernst: 'info',
      titel: `Nog ${euro(openstaand)} lijfrenteruimte`,
      uitleg: w.tekst,
      ...(p && waarPersoon(invoer, p) ? { waar: waarPersoon(invoer, p) } : {}),
      persoon: r.id,
      gebied: 'planning',
      veld: null,
      href: `/dossier/${jaar}/planning/#jaarruimte`,
      linkLabel: 'Naar de planning',
      negeren: 'gezien',
      vingerafdruk: bedragVingerafdruk('ruimte', openstaand),
      melding: w.id,
    })
  }
  return uit
}

/** De regels van dit bestand in de volgorde binnen een gebied. */
export const INVOER_REGELS: ControleRegel[] = [
  geboortedatumRegel,
  partnerZonderBRegel,
  verplichtLeegRegel,
  desinvesteringPctRegel,
  tegenbewijsEindRegel,
  ondernemingenMaxRegel,
  urencriteriumUrenRegel,
  tegenbewijsLoontRegel,
  jaarruimteRegel,
]


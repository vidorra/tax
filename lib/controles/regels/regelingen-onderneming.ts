/**
 * Ronde 2 (A6): controles voor de regelingen van de onderneming.
 *
 * | Regel                  | Ernst  | Negeren   | Wanneer                                                                 |
 * |------------------------|--------|-----------|-------------------------------------------------------------------------|
 * | hir-afboeking          | fout   | met-reden | gevraagde afboeking boven het maximum (stand, boekwaarde-eis)            |
 * | hir-functie            | fout   | met-reden | afboeking op een nieuw langlopend middel zonder dezelfde functie         |
 * | hir-boekwinst          | fout   | met-reden | reserve hoger dan de boekwinst zonder willekeurige afschrijving          |
 * | hir-vervalt            | let-op | gezien    | laatste jaar van de termijn: de rest valt vrij                          |
 * | hir-verlengd           | let-op | gezien    | verlengde termijn                                                       |
 * | staking-datum          | fout   | nee       | staking zonder datum in dit jaar                                        |
 * | staking-eerder         | let-op | gezien    | eerder genoten stakingsaftrek (of aangenomen uit het oude veld)          |
 * | stakingslijfrente-max  | let-op | gezien    | premie boven de ruimte voor een stakingslijfrente                       |
 * | youngtimer-dagwaarde   | fout   | nee       | youngtimer zonder dagwaarde, als er een bijtelling is                   |
 * | auto-btw               | let-op | gezien    | auto van de zaak zonder btw-gegevens: geen btw-correctie berekend       |
 * | staking-uren           | info   |           | stakingsjaar met uren onder het urencriterium                           |
 *
 * Id's: `${regel}:${persoon}:${ondernemingId}` plus de id van de reserve of investering. De vingerafdruk is alleen het
 * beslissende gegeven. Puur: geen React, geen I/O.
 */
import type { HuishoudenInvoer, OndernemingInvoer, PersoonId, PersoonInvoer } from '@/lib/tax/types'
import { euro } from '@/lib/tax/uitleg'
import { itemSleutel } from '@/lib/dossier/ids'
import { veldVan } from '@/lib/dossier/veld'
import { parseDatum } from '@/lib/tax/datum'
import { youngtimerMaandIndex, youngtimerOvergang, zonderBijtellingDoorRitten } from '@/lib/tax/modules/onderneming/auto'
import { toetsUrencriterium } from '@/lib/tax/modules/onderneming/urencriterium'
import type { Controle, ControleContext, ControleRegel } from '../types'

const naamVan = (p: PersoonInvoer) => (p.naam?.trim() ? p.naam.trim() : `Persoon ${p.id}`)
const LAATSTE_MAAND = 11

/** Wijzig de onderneming met deze id in een kopie van de invoer (voor een snelle oplossing). */
function opOnderneming(d: HuishoudenInvoer, persoon: PersoonId, ondId: string, fn: (o: OndernemingInvoer) => void): void {
  const p = d.personen.find((x) => x.id === persoon)
  const o = p?.ondernemingen.find((x, i) => itemSleutel(x, i) === ondId)
  if (o) fn(o)
}

export const regelingenOnderneming: ControleRegel = (ctx: ControleContext): Controle[] => {
  const uit: Controle[] = []
  const { invoer, resultaat, params, jaar } = ctx
  for (const p of invoer.personen) {
    const pr = resultaat?.personen.find((x) => x.id === p.id)
    p.ondernemingen.forEach((o, i) => {
      const ondId = itemSleutel(o, i)
      const ro = pr?.ondernemingen[i]
      const waar = `${o.naam.trim() || 'Onderneming'} · ${naamVan(p)}`
      const basis = { persoon: p.id, gebied: 'onderneming' as const, waar }
      const veld = (...rest: string[]) => veldVan.onderneming(p.id, ondId, ...rest)
      const invSleutel = (sleutel: string) => {
        const k = (o.investeringen ?? []).findIndex((x, j) => itemSleutel(x, j) === sleutel || x.id === sleutel || String(j) === sleutel)
        return k >= 0 ? itemSleutel(o.investeringen![k], k) : sleutel
      }

      // Herinvesteringsreserve (uit de uitkomst).
      for (const h of ro?.herinvesteringsreserves ?? []) {
        const invoerReserve = (o.herinvesteringsreserves ?? []).find((r) => r.id === h.id)
        const gevraagd = (h.perInvestering ?? []).reduce((s, x) => s + x.gevraagd, 0)
        if (gevraagd > h.afboeking) {
          const eerste = (h.perInvestering ?? []).find((x) => x.gevraagd > x.bedrag)
          const max = h.maxAfboeking ?? h.afboeking
          uit.push({
            ...basis,
            id: `hir-afboeking:${p.id}:${ondId}:${h.id}`,
            regel: 'hir-afboeking',
            ernst: 'fout',
            titel: 'Afboeking herinvesteringsreserve te hoog',
            uitleg: `Je boekt ${euro(gevraagd)} af op de ${h.omschrijving.charAt(0).toLowerCase()}${h.omschrijving.slice(1)}, maar het kan tot ${euro(max)}: niet meer dan de stand en niet meer dan de aanschafprijs van het nieuwe bedrijfsmiddel min de boekwaarde van het oude. We rekenen met ${euro(h.afboeking)}.`,
            veld: eerste ? veld(`investering:${invSleutel(eerste.investering)}`, 'herinvesteringsreserve.afboeking') : null,
            sectie: `ondernemingen-${p.id}`,
            negeren: 'met-reden',
            vingerafdruk: `afboeking=${gevraagd}|max=${max}`,
            oplossing: {
              label: `Boek ${euro(h.afboeking)} af`,
              pas: (d) =>
                opOnderneming(d, p.id, ondId, (x) => {
                  for (const pi of h.perInvestering ?? []) {
                    const inv = (x.investeringen ?? []).find((y, j) => itemSleutel(y, j) === pi.investering || y.id === pi.investering)
                    if (inv?.herinvesteringsreserve) inv.herinvesteringsreserve.afboeking = pi.bedrag
                  }
                }),
            },
          })
        }
        for (const pi of h.perInvestering ?? []) {
          if (!(pi.bedrag > 0) || !pi.nieuwLanglopend || pi.zelfdeFunctie) continue
          uit.push({
            ...basis,
            id: `hir-functie:${p.id}:${ondId}:${h.id}:${pi.investering}`,
            regel: 'hir-functie',
            ernst: 'fout',
            titel: 'Herinvesteringsreserve op een pand of grond',
            uitleg: `${pi.omschrijving.trim() || 'Het nieuwe bedrijfsmiddel'} schrijf je niet of in meer dan ${params.ondernemer.waarde.hir.langlopendVanafJaren} jaar af. Daarop mag je de reserve alleen afboeken als het verkochte bedrijfsmiddel dezelfde economische functie had. Klopt dat, vink het dan aan bij de investering; anders kies je een ander bedrijfsmiddel.`,
            veld: veld(`investering:${invSleutel(pi.investering)}`, 'herinvesteringsreserve.zelfdeFunctie'),
            negeren: 'met-reden',
            vingerafdruk: `investering=${pi.investering}|afboeking=${pi.bedrag}`,
          })
        }
        if (h.begrensd) {
          uit.push({
            ...basis,
            id: `hir-boekwinst:${p.id}:${ondId}:${h.id}`,
            regel: 'hir-boekwinst',
            ernst: 'fout',
            titel: 'Herinvesteringsreserve hoger dan de boekwinst',
            uitleg: `De reserve (${euro(h.begrensd.gevraagd)}) is hoger dan de boekwinst: de opbrengst min de boekwaarde zonder willekeurige afschrijving is ${euro(h.begrensd.boekwinst)}. We rekenen met ${euro(h.begrensd.boekwinst)}; het deel dat uit willekeurige afschrijving komt, is gewone winst.`,
            veld: veld(`herinvesteringsreserve:${h.id}`, 'bedragOntstaan'),
            negeren: 'met-reden',
            vingerafdruk: `gevraagd=${h.begrensd.gevraagd}|boekwinst=${h.begrensd.boekwinst}`,
            oplossing: {
              label: `Zet de reserve op ${euro(h.begrensd.boekwinst)}`,
              pas: (d) => opOnderneming(d, p.id, ondId, (x) => void (x.herinvesteringsreserves ?? []).filter((r) => r.id === h.id).forEach((r) => (r.bedragOntstaan = h.begrensd!.boekwinst))),
            },
          })
        }
        if (h.reden === 'termijn' && h.vrijval > 0) {
          uit.push({
            ...basis,
            id: `hir-vervalt:${p.id}:${ondId}:${h.id}`,
            regel: 'hir-vervalt',
            ernst: 'let-op',
            titel: 'Herinvesteringsreserve valt vrij',
            uitleg: `${h.uiterlijkJaar} is het laatste jaar om de ${h.omschrijving.charAt(0).toLowerCase()}${h.omschrijving.slice(1)} te gebruiken. Wat je dit jaar niet afboekt op een nieuwe investering, valt vrij in de winst: nu ${euro(h.vrijval)}.`,
            veld: veld(`herinvesteringsreserve:${h.id}`, 'voornemen'),
            negeren: 'gezien',
            vingerafdruk: `vrijval=${h.vrijval}`,
          })
        }
        if (invoerReserve?.termijnVerlengdTot !== undefined) {
          uit.push({
            ...basis,
            id: `hir-verlengd:${p.id}:${ondId}:${h.id}`,
            regel: 'hir-verlengd',
            ernst: 'let-op',
            titel: 'Termijn herinvesteringsreserve verlengd',
            uitleg: `Je gebruikt de reserve tot en met ${invoerReserve.termijnVerlengdTot} in plaats van ${invoerReserve.ontstaanJaar + params.ondernemer.waarde.hir.termijnJaren}. Dat mag alleen als de aard van de nieuwe investering meer tijd vraagt, of als de aanschaf door bijzondere omstandigheden is vertraagd terwijl je er al mee was begonnen. Bewaar de onderbouwing.`,
            veld: veld(`herinvesteringsreserve:${h.id}`, 'termijnVerlengdTot'),
            negeren: 'gezien',
            vingerafdruk: `tot=${invoerReserve.termijnVerlengdTot}`,
          })
        }
      }

      // Staking.
      const s = o.staking
      if (s) {
        if (!s.datum || parseDatum(s.datum).getUTCFullYear() !== jaar) {
          uit.push({
            ...basis,
            id: `staking-datum:${p.id}:${ondId}`,
            regel: 'staking-datum',
            ernst: 'fout',
            titel: 'Datum van de staking ontbreekt',
            uitleg: s.datum
              ? `De datum van de staking (${s.datum}) ligt niet in ${jaar}. Een staking vul je in bij het jaar waarin je stopte.`
              : `Vul de datum in waarop je stopte, iets verkocht of omzette. Het aangifteprogramma vraagt erom, en de ruimte voor een stakingslijfrente hangt af van je leeftijd op die datum.`,
            veld: veld('staking.datum'),
            negeren: 'nee',
            vingerafdruk: `datum=${s.datum ?? ''}`,
          })
        }
        const st = ro?.staking
        const eerder = st?.eerderGenoten ?? 0
        if (st && (st.soort === 'geheel' || st.soort === 'geruisloosBV') && (st.eerderAangenomen || eerder > 0)) {
          const max = params.ondernemer.waarde.stakingsaftrek
          uit.push({
            ...basis,
            id: `staking-eerder:${p.id}:${ondId}`,
            regel: 'staking-eerder',
            ernst: 'let-op',
            titel: 'Stakingsaftrek eerder gebruikt',
            uitleg: st.eerderAangenomen
              ? `Je gaf aan dat je de stakingsaftrek al eerder hebt gebruikt, zonder bedrag. We gaan ervan uit dat je de hele ${euro(max)} al had. Was het minder, vul dan het bedrag in.`
              : `Je hebt in eerdere jaren ${euro(eerder)} stakingsaftrek gehad. Dit jaar kun je nog ${euro(Math.max(0, max - eerder))} aftrekken. Klopt dat bedrag?`,
            veld: veld('staking.eerderGenotenStakingsaftrek'),
            negeren: 'gezien',
            vingerafdruk: st.eerderAangenomen ? 'eerder=aangenomen' : `eerder=${eerder}`,
          })
        }
        // Urencriterium in het stakingsjaar: het hele kalenderjaar, zonder tijdsevenredigheid.
        if ((o.uren?.onderneming ?? 0) > 0) {
          const t = toetsUrencriterium({ ...o.uren, urencriteriumGehaald: undefined }, { params, jaar, startjaar: o.startjaar, urenLoondienst: o.uren.loondienst ?? 0 })
          const nodig = params.ondernemer.waarde.urencriterium.uren
          if (!t.gehaald && t.uren < nodig) {
            uit.push({
              ...basis,
              id: `staking-uren:${p.id}:${ondId}`,
              regel: 'staking-uren',
              ernst: 'info',
              titel: 'Urencriterium in het jaar van staking',
              uitleg: `Je haalt het urencriterium dit jaar waarschijnlijk niet (${t.uren.toLocaleString('nl-NL')} van ${nodig.toLocaleString('nl-NL')} uur). Ook in het jaar dat je stopt, telt het hele kalenderjaar: zonder urencriterium geen zelfstandigenaftrek. De stakingsaftrek krijg je wel.`,
              veld: veld('uren.onderneming'),
              negeren: 'gezien',
              vingerafdruk: `uren=${t.uren}`,
            })
          }
        }
      }

      // Auto van de zaak.
      const a = o.auto
      if (a) {
        const idx = youngtimerMaandIndex(a.datumEersteToelating, params.ondernemer.waarde.auto.youngtimerLeeftijd)
        const og = youngtimerOvergang(a, params, jaar)
        const youngtimer = jaar * 12 + LAATSTE_MAAND >= idx || (og !== null && og.terBeschikking !== 'nee' && og.terBeschikking !== 'onbekend')
        // Geen bijtelling (rittenregistratie met niet meer dan priveKmGrens privékilometers, of niet ter beschikking in dit
        // jaar): dan speelt de dagwaarde geen rol en is er niets te verbeteren (review ronde 2, bevinding 7).
        const geenBijtelling = ro?.auto ? ro.auto.soort === 'geen' : zonderBijtellingDoorRitten(a, params)
        if (youngtimer && a.dagwaarde === undefined && !geenBijtelling) {
          uit.push({
            ...basis,
            id: `youngtimer-dagwaarde:${p.id}:${ondId}`,
            regel: 'youngtimer-dagwaarde',
            ernst: 'fout',
            titel: 'Dagwaarde van de youngtimer ontbreekt',
            uitleg: 'Deze auto is (een deel van) dit jaar een youngtimer: de bijtelling gaat dan over de dagwaarde. Zonder dagwaarde rekenen we met de cataloguswaarde, en dat is meestal veel te hoog.',
            veld: veld('auto.dagwaarde'),
            negeren: 'nee',
            vingerafdruk: 'dagwaarde=leeg',
          })
        }
        if (!a.btw) {
          uit.push({
            ...basis,
            id: `auto-btw:${p.id}:${ondId}`,
            regel: 'auto-btw',
            ernst: 'let-op',
            titel: 'Btw-correctie auto niet ingevuld',
            uitleg: 'Gebruik je de auto van de zaak ook privé en trek je btw af, dan betaal je bij de laatste btw-aangifte van het jaar een btw-correctie. Die is een autokost. Vul de btw-gegevens in, dan rekenen we hem uit.',
            veld: veld('auto.btw'),
            negeren: 'gezien',
            vingerafdruk: 'btw=leeg',
          })
        }
      }
    })

    // Stakingslijfrente (persoon).
    const sl = pr?.inkomensvoorziening.stakingslijfrente
    const premie = p.inkomensvoorziening.stakingslijfrente?.premie ?? 0
    if (sl && premie > sl.ruimte) {
      uit.push({
        id: `stakingslijfrente-max:${p.id}`,
        regel: 'stakingslijfrente-max',
        ernst: 'let-op',
        titel: 'Premie stakingslijfrente boven de ruimte',
        uitleg: `De premie (${euro(premie)}) is hoger dan de ruimte voor een stakingslijfrente (${euro(sl.ruimte)}). Het meerdere is hier niet aftrekbaar. Past het in je jaar- of reserveringsruimte, tel het dan bij je gewone lijfrentepremies.`,
        persoon: p.id,
        gebied: 'pensioen',
        waar: naamVan(p),
        veld: veldVan.persoon(p.id, 'inkomensvoorziening.stakingslijfrente.premie'),
        negeren: 'gezien',
        vingerafdruk: `premie=${premie}|ruimte=${sl.ruimte}`,
      })
    }
  }
  return uit
}

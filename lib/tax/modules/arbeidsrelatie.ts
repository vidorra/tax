/**
 * Signalen rond de arbeidsrelatie per opdrachtgever. Deze module geeft GEEN oordeel
 * over de arbeidsrelatie; ze somt signalen op en verwijst altijd naar de webmodule
 * Beoordeling arbeidsrelatie van de overheid.
 *
 * Signalen (alle grenzen uit `params.arbeidsrelatie`):
 *  - concentratie: grootste opdrachtgever boven concentratieWaarschuwingPct van de omzet;
 *  - uurtarief op of onder de drempel van het rechtsvermoeden (art. 7:610aa BW), zodra
 *    dat rechtsvermoeden in het jaar (of op 31 december van het jaar) geldt;
 *  - minder opdrachtgevers dan de Zelfstandigenwet vraagt, als die wet actief is;
 *  - werk via een digitaal platform;
 *  - opdrachten van meer dan een jaar.
 * Het handhavingsregime van het jaar staat als tekst in de uitleg.
 *
 * ctx.urenOnderneming (optioneel): gewerkte uren aan de onderneming; geeft een
 * indicatief gemiddeld uurtarief (omzet gedeeld door uren, inclusief indirecte uren).
 */
import type { Bron, ModuleUitkomst, OpdrachtgeverInvoer, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { regel, waarschuwing, eur, pct, datumNL } from '../uitleg'

const BRON_HANDHAVING: Bron = {
  titel: 'Belastingdienst, handhaving arbeidsrelaties',
  url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/arbeidsrelaties/content/handhaving',
  datum: '2026-10-03',
}
const BRON_WEBMODULE: Bron = {
  titel: 'Webmodule Beoordeling arbeidsrelatie (Belastingdienst, via belastingdienst.nl/arbeidsrelaties)',
  datum: '2026-10-03',
}

/** Opdrachten langer dan dit aantal maanden geven een signaal (vuistregel, geen wettelijke grens). */
const LANGE_OPDRACHT_MAANDEN = 12

const eur2 = (n: number): string => n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type ArbeidsrelatieUitkomst = ModuleUitkomst & { grootsteAandeel: number; laagsteUurtarief: number | null; aantalOpdrachtgevers: number }

export function beoordeelArbeidsrelatie(
  opdrachtgevers: OpdrachtgeverInvoer[],
  ctx: { params: TaxYearParams; jaar: number; urenOnderneming?: number },
): ArbeidsrelatieUitkomst {
  const a = ctx.params.arbeidsrelatie.waarde
  const status = ctx.params.arbeidsrelatie.status
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const eindeJaar = `${ctx.jaar}-12-31`

  const actief = opdrachtgevers.filter((o) => o.omzet > 0)
  const totaal = actief.reduce((s, o) => s + o.omzet, 0)
  const grootste = actief.reduce<OpdrachtgeverInvoer | null>((g, o) => (!g || o.omzet > g.omzet ? o : g), null)
  const grootsteAandeel = totaal > 0 && grootste ? grootste.omzet / totaal : 0
  const metTarief = actief.filter((o) => o.uurtarief !== undefined && o.uurtarief > 0)
  const laagsteUurtarief = metTarief.length > 0 ? Math.min(...metTarief.map((o) => o.uurtarief!)) : null

  uitleg.push(
    regel('arbeidsrelatie', `Omzet bij ${actief.length} ${actief.length === 1 ? 'opdrachtgever' : 'opdrachtgevers'}`, totaal, 'info', {
      niveau: 0,
      formule: grootste ? `grootste opdrachtgever ${pct(grootsteAandeel, 0)} van de omzet` : 'geen opdrachtgevers ingevuld',
      parameter: 'arbeidsrelatie.concentratieWaarschuwingPct',
      status,
    }),
  )
  for (const o of actief) {
    uitleg.push(
      regel(`arbeidsrelatie.${o.naam}`, o.naam, o.omzet, 'info', {
        niveau: 1,
        formule: [
          `${pct(totaal > 0 ? o.omzet / totaal : 0, 0)} van de omzet`,
          o.uurtarief ? `uurtarief ${eur2(o.uurtarief)}` : null,
          o.duurMaanden ? `${o.duurMaanden} maanden` : null,
          o.viaPlatform ? 'via een platform' : null,
        ]
          .filter(Boolean)
          .join(', '),
      }),
    )
  }
  if (ctx.urenOnderneming && ctx.urenOnderneming > 0 && totaal > 0) {
    const gemiddeld = totaal / ctx.urenOnderneming
    uitleg.push(
      regel('arbeidsrelatie.gemiddeld-uurtarief', 'Gemiddelde omzet per gewerkt uur (indicatie)', gemiddeld, 'info', {
        niveau: 1,
        formule: `${eur(totaal)} / ${eur(ctx.urenOnderneming)} uur = ${eur2(gemiddeld)}; inclusief indirecte uren, dus lager dan je uurtarief`,
      }),
    )
  }

  // Concentratie
  if (grootste && actief.length > 0 && grootsteAandeel > a.concentratieWaarschuwingPct) {
    waarschuwingen.push(
      waarschuwing(
        'arbeidsrelatie-concentratie',
        'let-op',
        `${pct(grootsteAandeel, 0)} van je omzet komt van ${grootste.naam} (signaalgrens ${pct(a.concentratieWaarschuwingPct, 0)}). Veel werk voor één opdrachtgever is een van de signalen waar de Belastingdienst naar kijkt. Wordt de relatie als dienstbetrekking gezien, dan vervallen voor die inkomsten de zelfstandigenaftrek en de MKB-winstvrijstelling.`,
        BRON_HANDHAVING,
      ),
    )
  }

  // Rechtsvermoeden op basis van uurtarief
  const rv = a.rechtsvermoedenUurtarief
  if (rv.actiefVanaf && rv.actiefVanaf <= eindeJaar) {
    const laag = metTarief.filter((o) => o.uurtarief! <= rv.drempel)
    const vanafTekst = rv.actiefVanaf > `${ctx.jaar}-01-01` ? `Vanaf ${datumNL(rv.actiefVanaf)} geldt` : 'Er geldt'
    if (laag.length > 0) {
      waarschuwingen.push(
        waarschuwing(
          'arbeidsrelatie-rechtsvermoeden',
          'actie',
          `${vanafTekst} een rechtsvermoeden van een arbeidsovereenkomst bij een uurtarief van € ${eur2(rv.drempel)} of minder. Dat geldt voor: ${laag.map((o) => `${o.naam} (€ ${eur2(o.uurtarief!)})`).join(', ')}. De opdrachtgever moet dan aantonen dat er geen arbeidsovereenkomst is.`,
        ),
      )
    }
    uitleg.push(
      regel('arbeidsrelatie.rechtsvermoeden', 'Rechtsvermoeden arbeidsovereenkomst bij een laag uurtarief', rv.drempel, 'info', {
        niveau: 1,
        formule: `${vanafTekst.toLowerCase()} bij een uurtarief tot en met ${eur2(rv.drempel)}`,
        parameter: 'arbeidsrelatie.rechtsvermoedenUurtarief',
        status,
      }),
    )
  }

  // Zelfstandigenwet
  const zw = a.zelfstandigenwet
  if (zw.actief && zw.minOpdrachtgevers !== undefined && actief.length < zw.minOpdrachtgevers) {
    waarschuwingen.push(
      waarschuwing(
        'arbeidsrelatie-zelfstandigenwet',
        'let-op',
        `De Zelfstandigenwet vraagt ten minste ${zw.minOpdrachtgevers} opdrachtgevers${zw.toetsJaren ? ` in ${zw.toetsJaren} kalenderjaren` : ''}. In dit jaar staan er ${actief.length} ingevuld. Tel opdrachtgevers uit het vorige jaar mee als de wet een periode van meerdere jaren toetst.`,
      ),
    )
  }

  // Platformwerk
  const platform = actief.filter((o) => o.viaPlatform)
  if (platform.length > 0) {
    waarschuwingen.push(
      waarschuwing(
        'arbeidsrelatie-platform',
        'let-op',
        `Je werkt via een digitaal platform (${platform.map((o) => o.naam).join(', ')}). Voor platformwerk komt een apart rechtsvermoeden van een arbeidsrelatie, op basis van de Europese richtlijn platformwerk. Bekijk of het platform uw werk aanstuurt of controleert.`,
      ),
    )
  }

  // Lange opdrachten
  const lang = actief.filter((o) => (o.duurMaanden ?? 0) > LANGE_OPDRACHT_MAANDEN)
  if (lang.length > 0) {
    waarschuwingen.push(
      waarschuwing(
        'arbeidsrelatie-duur',
        'info',
        `Opdrachten van meer dan een jaar (${lang.map((o) => o.naam).join(', ')}) wegen mee bij de vraag of u ingebed bent in de organisatie van de opdrachtgever.`,
      ),
    )
  }

  // Handhavingsregime
  const h = a.handhaving
  const boetes =
    h.verzuimboetes && h.vergrijpboetes
      ? 'verzuimboetes en vergrijpboetes zijn mogelijk'
      : h.vergrijpboetes
        ? 'vergrijpboetes zijn mogelijk bij opzet of grove schuld, verzuimboetes niet'
        : h.verzuimboetes
          ? 'verzuimboetes zijn mogelijk, vergrijpboetes niet'
          : 'er worden geen boetes opgelegd'
  const regimeTekst =
    h.regime === 'moratorium'
      ? `In ${ctx.jaar} gold een handhavingsmoratorium: de Belastingdienst gaf alleen aanwijzingen en legde geen correcties op.`
      : h.regime === 'overgang'
        ? `In ${ctx.jaar} handhaaft de Belastingdienst met een overgangsregime: correcties en naheffingen loonheffingen zijn mogelijk, ${boetes}.`
        : `In ${ctx.jaar} handhaaft de Belastingdienst volledig: correcties en naheffingen zijn mogelijk, ${boetes}.`
  waarschuwingen.push(waarschuwing('arbeidsrelatie-handhaving', 'info', regimeTekst, BRON_HANDHAVING))
  if (a.modelovereenkomstenGeldigTot >= `${ctx.jaar}-01-01`) {
    uitleg.push(
      regel('arbeidsrelatie.modelovereenkomsten', 'Bestaande modelovereenkomsten blijven geldig', 0, 'info', {
        niveau: 1,
        formule: `tot en met ${a.modelovereenkomstenGeldigTot}; nieuwe worden niet meer beoordeeld`,
        parameter: 'arbeidsrelatie.modelovereenkomstenGeldigTot',
      }),
    )
  }

  // Altijd: geen oordeel
  waarschuwingen.push(
    waarschuwing(
      'arbeidsrelatie-geen-oordeel',
      'info',
      'Dit zijn signalen, geen oordeel over je arbeidsrelatie. Of er sprake is van een dienstbetrekking hangt af van alle omstandigheden samen. Doe per opdracht de webmodule Beoordeling arbeidsrelatie van de overheid; ook die geeft geen zekerheid, maar wel een indicatie.',
      BRON_WEBMODULE,
    ),
  )

  return { uitleg, waarschuwingen, grootsteAandeel, laagsteUurtarief, aantalOpdrachtgevers: actief.length }
}

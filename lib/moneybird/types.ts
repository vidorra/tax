/**
 * Contract van de Moneybird-koppeling (alleen lezen).
 *
 * Werking:
 *  1. De gebruiker maakt in Moneybird een persoonlijke API-token (Instellingen > Ontwikkelaars) met de
 *     scopes `sales_invoices`, `documents`, `bank`, `time_entries` en `settings`, en voegt die in het dossier
 *     toe als koppeling. Het token wordt versleuteld opgeslagen (lib/crypto.ts, met AAD) en nooit naar de
 *     browser teruggestuurd. Daarnaast kan de server een koppeling uit de omgeving hebben:
 *     MONEYBIRD_TOKEN + MONEYBIRD_ADMINISTRATION_ID, id 'env'.
 *  2. Per koppeling kiest de gebruiker één administratie (één onderneming).
 *  3. Per dossierjaar en onderneming haalt de server de cijfers op en zet ze om in een MbJaarImport:
 *     winst- en verliesrekening per grootboekrekening met een voorgestelde fiscale categorie (op basis van
 *     de RGS-code en de naam), balans (ondernemingsvermogen, FOR, onderhanden werk), vaste activa
 *     (investeringen en desinvesteringen van het jaar), omzet per klant en geregistreerde uren, en de
 *     jaarrekening voor het fiscaal rapport (balans per post op 31-12 van het vorige jaar en van dit jaar,
 *     specificaties, privémutaties en de winst- en verliesrekening in rubrieken; zie jaarrekening.ts).
 *  4. De gebruiker controleert de indeling per grootboekrekening, past waar nodig aan (de keuzes worden per
 *     koppeling bewaard voor volgende jaren) en neemt de cijfers over in de onderneming in het dossier.
 *
 * API-routes (allemaal achter sessie en herkomstcontrole, via metDossier):
 *  GET    /api/dossier/koppelingen                      → { koppelingen: MbKoppelingPubliek[] }
 *  POST   /api/dossier/koppelingen          { token, label }        → { koppeling: MbKoppelingPubliek, administraties: MbAdministratie[] }
 *  PATCH  /api/dossier/koppelingen/[id]     { administratieId, label? } → { koppeling: MbKoppelingPubliek }
 *  DELETE /api/dossier/koppelingen/[id]                              → { ok: true }
 *  GET    /api/dossier/koppelingen/[id]/administraties               → { administraties: MbAdministratie[] }
 *  POST   /api/dossier/koppelingen/[id]/import      { jaar }         → { import: MbJaarImport }
 *  PUT    /api/dossier/koppelingen/[id]/indeling    { indeling: MbIndelingWijziging } → { indeling: MbIndeling }
 *         (samenvoegen met de bewaarde indeling; null zet een rekening terug naar het voorstel)
 * Fouten: { fout: string } met 400/401/403/404/409/422/429/502/503; 502 als Moneybird een fout geeft
 * (met een Nederlandse uitleg: token ongeldig, scope ontbreekt, administratie niet gevonden, te veel verzoeken).
 */
import type { DesinvesteringInvoer, InvesteringInvoer, JaarrekeningInvoer, OpdrachtgeverInvoer, Waarschuwing } from '../tax/types'

/** Fiscale categorie van een grootboekrekening uit de winst- en verliesrekening. */
export type MbCategorie =
  | 'omzet'
  | 'kosten'
  | 'afschrijving'
  | 'beperktAftrekbaar'
  | 'autokosten'
  | 'financieel'
  | 'negeren'

export const MB_CATEGORIEEN: Array<{ waarde: MbCategorie; label: string; uitleg: string }> = [
  { waarde: 'omzet', label: 'Omzet', uitleg: 'Opbrengsten uit de onderneming.' },
  { waarde: 'kosten', label: 'Kosten', uitleg: 'Volledig aftrekbare bedrijfskosten.' },
  { waarde: 'afschrijving', label: 'Afschrijving', uitleg: 'Afschrijvingen op bedrijfsmiddelen.' },
  {
    waarde: 'beperktAftrekbaar',
    label: 'Beperkt aftrekbaar',
    uitleg: 'Voedsel, drank, representatie, congressen en studiereizen: 80% aftrekbaar of boven de drempel.',
  },
  { waarde: 'autokosten', label: 'Autokosten', uitleg: 'Kosten van een auto van de zaak (maximum voor de bijtelling).' },
  { waarde: 'financieel', label: 'Financiële baten en lasten', uitleg: 'Rente en bankkosten die als financieel resultaat tellen.' },
  { waarde: 'negeren', label: 'Niet meenemen', uitleg: 'Bijvoorbeeld een privéboeking die per ongeluk in de winst staat.' },
]

/** Keuzes van de gebruiker per grootboekrekening (ledger_account_id → categorie), bewaard per koppeling. */
export type MbIndeling = Record<string, MbCategorie>

/** Wijziging van de bewaarde indeling: een categorie zet een keuze, null wist de keuze (terug naar het voorstel). */
export type MbIndelingWijziging = Record<string, MbCategorie | null>

export interface MbAdministratie {
  id: string
  naam: string
  valuta?: string
  land?: string
}

export interface MbKoppelingPubliek {
  /** Database-id als string, of 'env' voor de koppeling uit de omgeving. */
  id: string
  label: string
  bron: 'dossier' | 'env'
  /** Gemaskeerd token, bijvoorbeeld '••••••3f9a'. Het echte token komt nooit naar de browser. */
  tokenMasker: string
  administratieId: string | null
  administratieNaam: string | null
  aangemaakt: string | null
  laatstGebruikt: string | null
}

export interface MbGrootboekRegel {
  ledgerAccountId: string
  naam: string
  /** RGS-code uit taxonomy_item.code, als die er is. */
  rgsCode: string | null
  /** account_type uit Moneybird (revenue, direct_costs, expenses, other_income_expenses). */
  soort: string
  /** Bedrag in hele euro's, positief voor opbrengsten en voor kosten (teken volgt de categorie). */
  bedrag: number
  /** Gebruikte categorie (keuze van de gebruiker, anders het voorstel). */
  categorie: MbCategorie
  voorstel: MbCategorie
  /** Waarom dit voorstel (bijv. "RGS WAfs: afschrijvingen" of "naam bevat 'representatie'"). */
  reden: string
  /** true als de gebruiker deze regel zelf heeft ingedeeld. */
  aangepast: boolean
  /**
   * Effect op de netto winst in hele euro's (positief = winst omhoog), zoals Moneybird het boekt. Verandert
   * niet bij herindelen, ook niet als een indeling in de browser alleen de categorie aanpast. Ontbreekt bij
   * oudere imports; dan volgt het uit bedrag en categorie (bijdrageVan).
   */
  bijdrage?: number
}

/** Een privéboeking voor de kapitaalsvergelijking: naam van de grootboekrekening en het bedrag (positief). */
export interface MbPriveRegel {
  omschrijving: string
  bedrag: number
}

export interface MbJaarImport {
  koppelingId: string
  administratie: MbAdministratie
  jaar: number
  /** ISO-tijdstip van ophalen. */
  opgehaaldOp: string
  regels: MbGrootboekRegel[]
  totalen: {
    omzet: number
    kosten: number
    afschrijvingen: number
    beperktAftrekbaar: number
    autokosten: number
    /** Saldo financiële baten en lasten (positief = per saldo opbrengst). */
    financieel: number
    /** Netto winst volgens Moneybird (net_profit). */
    nettoWinstMoneybird: number
    /** Netto winst volgens de indeling (omzet − kosten − afschrijvingen − beperkt − auto + financieel, zonder 'negeren'). */
    nettoWinstIndeling: number
    /** Verschil door regels die op 'negeren' staan of door afronding. */
    verschil: number
  }
  balans: {
    ondernemingsvermogenBegin: number | null
    ondernemingsvermogenEinde: number | null
    /**
     * Oudedagsreserve op de eindbalans (31-12, of de dag van ophalen in een lopend jaar). Alleen ter controle: de
     * overname rekent met de stand op 1 januari (`forStandBegin`).
     */
    forStand: number | null
    /**
     * Oudedagsreserve op de beginbalans (31-12 van het vorige jaar), dus de stand op 1 januari waarmee de engine
     * rekent. null als die niet op de beginbalans staat of de beginbalans ontbreekt. Ontbreekt bij oudere imports.
     */
    forStandBegin?: number | null
    onderhandenWerkBegin: number | null
    onderhandenWerkEind: number | null
  }
  investeringen: InvesteringInvoer[]
  desinvesteringen: DesinvesteringInvoer[]
  /**
   * De bedrijfsmiddelen achter `desinvesteringen`, in dezelfde volgorde: aanschafdatum en -waarde en de datum en
   * prijs van de afstoting. Daarmee koppelt de overname een afgestoten middel aan het activaregister. Ontbreekt bij
   * oudere imports.
   */
  afgestoten?: Array<{ naam: string; aanschafdatum: string; aanschafwaarde: number; datum: string; verkoopprijs: number; prijsBekend: boolean }>
  activa: Array<{ naam: string; aanschafdatum: string; aanschafwaarde: number; boekwaarde: number; levensduurJaren: number | null; restwaarde: number | null }>
  opdrachtgevers: OpdrachtgeverInvoer[]
  /** Uren uit de urenregistratie van Moneybird (null als er niets geregistreerd is of de scope ontbreekt). */
  uren: { totaal: number; perContact: Record<string, number> } | null
  /**
   * Jaarrekening voor het fiscaal rapport (hoofdstuk 5), met bron 'moneybird': balans per post op beide
   * peildatums, specificaties, aanschaf- en restwaarde van de vaste activa, privé-onttrekkingen en
   * -stortingen en de winst- en verliesrekening in rubrieken volgens de indeling. Ontbreekt als er niets
   * uit te halen viel (geen balans en geen regels).
   */
  jaarrekening?: JaarrekeningInvoer
  /**
   * Privémutaties uit de balans (verschil per privérekening tussen begin en einde, of één saldoregel),
   * zonder de regels op 'niet meenemen'. De onttrekkingen en stortingen in `jaarrekening` zijn deze plus de
   * genegeerde regels; zo kan een andere indeling ze opnieuw samenstellen. Ontbreekt zonder begin- of eindbalans.
   */
  priveMutaties?: { onttrekkingen: MbPriveRegel[]; stortingen: MbPriveRegel[] }
  waarschuwingen: Waarschuwing[]
}

/** Opties bij het overnemen van een import in een onderneming. */
export interface MbOvernameOpties {
  /** Standaard true: investeringen uit de vaste activa vervangen de bestaande lijst. */
  investeringen?: boolean
  /** Standaard true. */
  opdrachtgevers?: boolean
  /**
   * Standaard true: ondernemingsvermogen uit de eindbalans, de FOR-stand op 1 januari uit de beginbalans, en de balansdelen van de jaarrekening
   * (begin, eind, specificaties, mva, onttrekkingen, stortingen). Met false blijven die van de onderneming
   * staan; de winst- en verliesrekening in rubrieken komt altijd uit Moneybird, net als de winstberekening.
   */
  balans?: boolean
  /** Standaard false: uren uit Moneybird overnemen in plaats van de keuze 'urencriterium gehaald'. */
  uren?: boolean
}

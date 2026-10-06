/**
 * Ronde 2 (na de toets): één gedeeld aria-live-gebied per pagina, in plaats van een eigen gebied per knop (een pagina
 * van de invulhulp heeft tientallen kopieerknoppen). `kondigAan(tekst)` zet de tekst in een verborgen
 * `#ib-aankondiging` (role status, polite) dat bij het eerste gebruik onder body komt. Ook voor springen naar een veld,
 * "Opgeslagen" bij afvinken en de melding na Ongedaan maken.
 */
const ID = 'ib-aankondiging'

export function kondigAan(tekst: string): void {
  if (typeof document === 'undefined' || !tekst) return
  let el = document.getElementById(ID)
  if (!el) {
    el = document.createElement('div')
    el.id = ID
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.className = 'sr-only'
    document.body.appendChild(el)
  }
  // Leegmaken en daarna zetten, zodat dezelfde tekst twee keer achter elkaar ook wordt voorgelezen.
  el.textContent = ''
  const doel = el
  window.setTimeout(() => {
    doel.textContent = tekst
  }, 30)
}

/**
 * Verlaagde bijtelling voor nulemissie-auto's per jaar van eerste toelating.
 * Het percentage en de cap gelden 60 maanden vanaf de maand na eerste toelating.
 * Daarboven (en voor fossiele auto's) geldt het algemene percentage (22%).
 */
export const BIJTELLING_NUL_EMISSIE: Record<string, { pct: number; cap: number }> = {
  '2019': { pct: 0.04, cap: 50000 },
  '2020': { pct: 0.08, cap: 45000 },
  '2021': { pct: 0.12, cap: 40000 },
  '2022': { pct: 0.16, cap: 35000 },
  '2023': { pct: 0.16, cap: 30000 },
  '2024': { pct: 0.16, cap: 30000 },
  '2025': { pct: 0.17, cap: 30000 },
  '2026': { pct: 0.18, cap: 30000 },
  '2027': { pct: 0.2, cap: 30000 },
  '2028': { pct: 0.22, cap: 0 },
}

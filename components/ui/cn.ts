/** Voegt classnames samen en slaat lege waarden over. */
export function cn(...delen: Array<string | false | null | undefined | 0>): string {
  return delen.filter(Boolean).join(' ')
}

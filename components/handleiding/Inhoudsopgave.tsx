export interface InhoudItem {
  id: string
  label: string
}

/** Korte inhoudsopgave bovenaan een lange pagina, met ankerlinks naar de koppen. */
export function Inhoudsopgave({ items }: { items: readonly InhoudItem[] }) {
  return (
    <nav aria-labelledby="inhoud-titel" className="mb-8 bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 sm:px-6">
      <h2 id="inhoud-titel" className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Op deze pagina
      </h2>
      <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className="inline-flex min-h-[44px] items-center rounded text-sm font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

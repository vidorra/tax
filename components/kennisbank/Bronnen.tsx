import { ExternalLink } from 'lucide-react'

export interface BronLink {
  titel: string
  url: string
}

/** Lijst met primaire bronnen onder een artikel. */
export function Bronnen({ bronnen }: { bronnen: BronLink[] }) {
  if (bronnen.length === 0) return null
  return (
    <section aria-labelledby="bronnen-titel" className="mt-12 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 id="bronnen-titel" className="text-base font-medium text-gray-900">
        Bronnen
      </h2>
      <ul className="mt-3 space-y-2">
        {bronnen.map((b) => (
          <li key={b.url} className="text-sm">
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1.5 text-gray-700 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary"
            >
              <ExternalLink aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              <span className="break-words">
                {b.titel}
                <span className="sr-only"> (opent in nieuw venster)</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

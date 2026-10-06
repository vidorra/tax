import Link from 'next/link'
import { ButtonLink } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export const metadata = {
  title: 'Pagina niet gevonden',
  robots: { index: false, follow: true },
}

export default function NietGevonden() {
  return (
    <Container breedte="smal" className="py-10 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-gray-900 sm:text-3xl">Deze pagina bestaat niet (meer)</h1>
      <p className="mx-auto mt-3 max-w-md text-gray-600">
        Misschien is de link verouderd of zit er een typfout in het adres. Begin bij de calculator of zoek het op in de kennisbank.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <ButtonLink href="/">Naar de calculator</ButtonLink>
        <ButtonLink href="/kennisbank" variant="secundair">
          Naar de kennisbank
        </ButtonLink>
      </div>
      <p className="mt-8 text-sm text-gray-500">
        Op zoek naar een jaar? Bekijk <Link href="/2026" className="text-primary hover:text-primary-dark hover:underline">2026</Link> of{' '}
        <Link href="/2027" className="text-primary hover:text-primary-dark hover:underline">2027</Link>.
      </p>
    </Container>
  )
}

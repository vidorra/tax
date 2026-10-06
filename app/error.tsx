'use client'

import { useEffect } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export default function Foutmelding({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Container breedte="smal" className="py-10 text-center">
      <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Er ging iets mis</h1>
      <p className="mx-auto mt-3 max-w-md text-gray-600">
        Deze pagina kon niet worden geladen. Probeer het opnieuw. Lukt dat niet, ga dan terug naar de calculator.
      </p>
      {error.digest && <p className="mt-2 text-xs text-gray-500">Foutcode: {error.digest}</p>}
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button onClick={reset}>Opnieuw proberen</Button>
        <ButtonLink href="/" variant="secundair">
          Naar de calculator
        </ButtonLink>
      </div>
    </Container>
  )
}

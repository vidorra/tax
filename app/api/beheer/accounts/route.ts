import { json } from '@/lib/auth/api'
import { lijstAccounts } from '@/lib/auth/gebruiker'
import { lijstUitnodigingen } from '@/lib/auth/uitnodiging'
import { mailerSoort } from '@/lib/mail'
import { metBeheerder } from '../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Accounts, uitnodigingen van de laatste 30 dagen en of er een mailer is. */
export async function GET(req: Request) {
  return metBeheerder('beheer/accounts GET', req, async (b) =>
    json({ accounts: await lijstAccounts(), uitnodigingen: await lijstUitnodigingen(), jij: b.userId, mailer: mailerSoort() !== null }),
  )
}

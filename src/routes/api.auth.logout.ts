import { createFileRoute } from '@tanstack/react-router'
import { clearSessionUser } from '~/lib/auth/session'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async () => {
        await clearSessionUser()

        return Response.json(
          {
            ok: true,
          },
          {
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        )
      },
    },
  },
})

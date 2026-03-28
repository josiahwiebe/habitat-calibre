import { createFileRoute } from '@tanstack/react-router'
import { getCurrentSessionUser } from '~/lib/auth/session'

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: async () => {
        const user = await getCurrentSessionUser()

        return Response.json(
          {
            ok: true,
            user,
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

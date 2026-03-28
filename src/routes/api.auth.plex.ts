import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { evaluatePlexAccess, fetchPlexIdentity } from '~/lib/auth/plex'
import { setSessionUser } from '~/lib/auth/session'

const plexLoginSchema = z.object({
  authToken: z.string().trim().min(8).max(512),
})

export const Route = createFileRoute('/api/auth/plex')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown

        try {
          payload = await request.json()
        } catch {
          return Response.json(
            {
              ok: false,
              error: 'Invalid JSON payload.',
            },
            { status: 400 },
          )
        }

        const parsed = plexLoginSchema.safeParse(payload)

        if (!parsed.success) {
          return Response.json(
            {
              ok: false,
              error: 'Missing Plex auth token.',
            },
            { status: 400 },
          )
        }

        try {
          const identity = await fetchPlexIdentity(parsed.data.authToken)
          const decision = await evaluatePlexAccess(
            identity,
            parsed.data.authToken,
          )

          if (!decision.allowed) {
            return Response.json(
              {
                ok: false,
                error: 'Access denied for this Plex account.',
              },
              { status: 403 },
            )
          }

          await setSessionUser({
            email: identity.email,
            plexUserId: identity.id,
            username: identity.username,
            avatarUrl: identity.avatarUrl,
          })

          return Response.json(
            {
              ok: true,
              user: {
                email: identity.email,
                plexUserId: identity.id,
                username: identity.username,
                avatarUrl: identity.avatarUrl,
              },
            },
            {
              headers: {
                'Cache-Control': 'no-store',
              },
            },
          )
        } catch (error) {
          console.error('Failed Plex authentication', error)

          return Response.json(
            {
              ok: false,
              error: 'Unable to authenticate with Plex right now.',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAuthenticatedRoute } from '~/lib/auth/guard'
import { searchShelfmarkReleases } from '~/lib/requests/shelfmark'

const releaseSearchSchema = z.object({
  title: z.string().trim().min(2).max(180),
  author: z.string().trim().max(140).optional(),
  source: z.string().trim().max(80).optional(),
  manualQuery: z.string().trim().max(280).optional(),
})

export const Route = createFileRoute('/api/request-book/releases')({
  server: {
    middleware: [requireAuthenticatedRoute],
    handlers: {
      POST: async ({ request }) => {
        let rawBody: unknown

        try {
          rawBody = await request.json()
        } catch {
          return Response.json(
            {
              ok: false,
              error: 'Invalid JSON payload.',
            },
            { status: 400 },
          )
        }

        const payload = releaseSearchSchema.safeParse(rawBody)

        if (!payload.success) {
          return Response.json(
            {
              ok: false,
              error: 'Please provide at least a valid book title.',
            },
            { status: 400 },
          )
        }

        const result = await searchShelfmarkReleases({
          title: payload.data.title,
          author: normalizeOptional(payload.data.author),
          source: normalizeOptional(payload.data.source),
          manualQuery: normalizeOptional(payload.data.manualQuery),
        })

        if (!result.ok) {
          return Response.json(
            {
              ok: false,
              error: result.error,
              status: result.status,
            },
            {
              status: result.status === 'unconfigured' ? 503 : 502,
            },
          )
        }

        return Response.json({
          ok: true,
          releases: result.releases,
          sourcesSearched: result.sourcesSearched,
        })
      },
    },
  },
})

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

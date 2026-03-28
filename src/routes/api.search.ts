import { createFileRoute } from '@tanstack/react-router'
import { requireAuthenticatedRoute } from '~/lib/auth/guard'
import { createUnavailableSearchResponse, searchLibrary } from '~/lib/calibre/catalog'
import { parseLibrarySearch } from '~/lib/calibre/search-schema'

export const Route = createFileRoute('/api/search')({
  server: {
    middleware: [requireAuthenticatedRoute],
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const params = Object.fromEntries(url.searchParams.entries())
        const input = parseLibrarySearch(params)
        const payload = (() => {
          try {
            return searchLibrary(input)
          } catch (error) {
            return createUnavailableSearchResponse(
              input,
              error instanceof Error
                ? error.message
                : 'Unable to load library metadata',
            )
          }
        })()

        return Response.json(payload, {
          headers: {
            'Cache-Control': 'private, max-age=0, no-cache',
          },
        })
      },
    },
  },
})

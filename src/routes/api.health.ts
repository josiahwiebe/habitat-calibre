import { createFileRoute } from '@tanstack/react-router'
import { getLibraryHealth } from '~/lib/calibre/catalog'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(getLibraryHealth(), {
          headers: {
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})

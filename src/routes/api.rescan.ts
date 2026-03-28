import { createFileRoute } from '@tanstack/react-router'
import { rescanLibrary } from '~/lib/calibre/catalog'

export const Route = createFileRoute('/api/rescan')({
  server: {
    handlers: {
      POST: async () => {
        const payload = rescanLibrary()

        return Response.json(payload, {
          headers: {
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})

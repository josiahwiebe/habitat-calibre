import { createFileRoute } from '@tanstack/react-router'
import { getDownloadAsset } from '~/lib/calibre/catalog'
import { createFileAssetResponse } from '~/lib/calibre/http'

export const Route = createFileRoute('/download/$bookId/$format')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const match = url.pathname.match(/^\/download\/(\d+)\/([^/]+)$/)

        if (!match) {
          return new Response('Invalid download route', { status: 400 })
        }

        const bookId = Number(match[1])
        const format = decodeURIComponent(match[2])

        if (!Number.isInteger(bookId) || bookId <= 0 || format.length === 0) {
          return new Response('Invalid download request', { status: 400 })
        }

        const asset = getDownloadAsset(bookId, format)

        if (!asset) {
          return new Response('Format not found for this book', { status: 404 })
        }

        return createFileAssetResponse(asset, {
          download: true,
          cacheControl: 'private, max-age=0, no-cache',
        })
      },
    },
  },
})

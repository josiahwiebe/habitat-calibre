import { createFileRoute } from '@tanstack/react-router'
import { getCoverAsset } from '~/lib/calibre/catalog'
import { createFileAssetResponse } from '~/lib/calibre/http'

export const Route = createFileRoute('/covers/$bookId')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const match = url.pathname.match(/^\/covers\/(\d+)$/)
        const bookId = match ? Number(match[1]) : Number.NaN

        if (!Number.isInteger(bookId) || bookId <= 0) {
          return new Response('Invalid book id', { status: 400 })
        }

        const asset = getCoverAsset(bookId)
        const shouldDownload = url.searchParams.get('download') === '1'

        if (!asset) {
          return placeholderCoverResponse()
        }

        return createFileAssetResponse(asset, {
          download: shouldDownload,
          cacheControl: 'public, max-age=86400, stale-while-revalidate=604800',
        })
      },
    },
  },
})

function placeholderCoverResponse() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="480" viewBox="0 0 320 480" fill="none">
    <rect width="320" height="480" rx="20" fill="#E9E3D8"/>
    <rect x="34" y="40" width="252" height="400" rx="14" fill="#F7F4EE" stroke="#D4CABC"/>
    <text x="160" y="230" text-anchor="middle" fill="#7A7366" font-family="sans-serif" font-size="20">No cover</text>
  </svg>
  `.trim()

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

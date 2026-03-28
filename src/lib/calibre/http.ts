import fs from 'node:fs'
import { Readable } from 'node:stream'
import { sanitizeFilename } from '~/lib/utils'
import type { LibraryFileAsset } from './types'

interface FileResponseOptions {
  download?: boolean
  cacheControl?: string
}

/**
 * Creates a streaming HTTP response for library file assets.
 */
export function createFileAssetResponse(
  asset: LibraryFileAsset,
  options: FileResponseOptions = {},
) {
  const stream = Readable.toWeb(fs.createReadStream(asset.absolutePath))
  const headers = new Headers({
    'Content-Type': asset.contentType,
    'Content-Length': String(asset.sizeBytes),
  })

  if (options.cacheControl) {
    headers.set('Cache-Control', options.cacheControl)
  }

  if (options.download) {
    headers.set(
      'Content-Disposition',
      `attachment; filename="${sanitizeFilename(asset.fileName)}"`,
    )
  }

  return new Response(stream as BodyInit, {
    status: 200,
    headers,
  })
}

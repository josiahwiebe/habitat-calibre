import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { requireSessionUser } from '~/lib/auth/session'
import { parseLibrarySearch } from './search-schema'
import {
  createUnavailableSearchResponse,
  getLibraryBookDetail,
  getLibraryHealth,
  rescanLibrary,
  searchLibrary,
} from './catalog'

/**
 * Returns list/search data for the library landing page.
 */
export const getLibrarySearchResult = createServerFn({ method: 'POST' })
  .inputValidator((raw) => parseLibrarySearch(raw))
  .handler(async ({ data }) => {
    await requireSessionUser()

    try {
      return searchLibrary(data)
    } catch (error) {
      return createUnavailableSearchResponse(
        data,
        error instanceof Error ? error.message : 'Unable to load library metadata',
      )
    }
  })

/**
 * Returns book details by Calibre id.
 */
export const getLibraryBookDetailById = createServerFn({ method: 'POST' })
  .inputValidator((input) => {
    const value = Number((input as { bookId?: number }).bookId)

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('Invalid book id')
    }

    return { bookId: value }
  })
  .handler(async ({ data }) => {
    await requireSessionUser()

    const book = getLibraryBookDetail(data.bookId)

    if (!book) {
      throw notFound()
    }

    return book
  })

/**
 * Returns service health and cache metadata.
 */
export const getLibraryRuntimeHealth = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireSessionUser()
    return getLibraryHealth()
  },
)

/**
 * Triggers a fresh metadata scan.
 */
export const forceLibraryRescan = createServerFn({ method: 'POST' }).handler(
  async () => {
    await requireSessionUser()
    return rescanLibrary()
  },
)

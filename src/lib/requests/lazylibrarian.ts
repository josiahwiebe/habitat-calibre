import { normalizeEnvString } from './env'

const DEFAULT_MATCH_THRESHOLD = 84
const MAX_QUEUE_RETRIES = 10
const QUEUE_RETRY_DELAY_MS = 1200

interface LazyLibrarianConfig {
  baseUrl: string
  apiKey: string
  matchThreshold: number
}

interface LazyLibrarianCandidate {
  bookid?: unknown
  bookname?: unknown
  authorname?: unknown
  highest_fuzz?: unknown
  author_fuzz?: unknown
  book_fuzz?: unknown
  bookrate_count?: unknown
  num_reviews?: unknown
}

/**
 * Input payload for a user-submitted book request.
 */
export interface LazyLibrarianRequestInput {
  title: string
  author?: string
}

/**
 * Result states for LazyLibrarian request attempts.
 */
export type LazyLibrarianRequestResult =
  | {
      ok: true
      status: 'queued'
      message: string
    }
  | {
      ok: false
      status: 'no_match' | 'provider_error' | 'unconfigured'
      error: string
    }

/**
 * Returns true when LazyLibrarian API credentials are present.
 */
export function isLazyLibrarianConfigured() {
  return getLazyLibrarianConfig() !== null
}

/**
 * Submits a request into LazyLibrarian and triggers immediate search.
 */
export async function submitBookRequestToLazyLibrarian(
  input: LazyLibrarianRequestInput,
): Promise<LazyLibrarianRequestResult> {
  const config = getLazyLibrarianConfig()

  if (!config) {
    return {
      ok: false,
      status: 'unconfigured',
      error:
        'LazyLibrarian is not configured. Set LAZYLIBRARIAN_BASE_URL and LAZYLIBRARIAN_API_KEY.',
    }
  }

  const normalizedTitle = input.title.trim()
  const normalizedAuthor = input.author?.trim() || undefined

  if (normalizedTitle.length < 2) {
    return {
      ok: false,
      status: 'provider_error',
      error: 'Book title is too short to search.',
    }
  }

  try {
    const query = buildFindBookQuery(normalizedTitle, normalizedAuthor)
    const rawCandidates = await callLazyLibrarianApi(config, {
      cmd: 'findBook',
      name: query,
    })

    const candidates = toCandidateList(rawCandidates)
    const bestMatch = selectBestCandidate(candidates)

    if (!bestMatch || !bestMatch.bookId) {
      return {
        ok: false,
        status: 'no_match',
        error:
          'No strong match found in LazyLibrarian. Try including author name or refine the title.',
      }
    }

    const matchedBookId = bestMatch.bookId

    if (bestMatch.score < config.matchThreshold) {
      return {
        ok: false,
        status: 'no_match',
        error:
          'No confident match found in LazyLibrarian yet. Try a more specific title or include author.',
      }
    }

    await callLazyLibrarianApi(config, {
      cmd: 'addBook',
      id: matchedBookId,
    })

    const queued = await queueBookWithRetry(config, matchedBookId)

    if (!queued) {
      return {
        ok: false,
        status: 'provider_error',
        error:
          'LazyLibrarian found a match but could not queue it yet. Try again in a minute.',
      }
    }

    await callLazyLibrarianApi(config, {
      cmd: 'searchBook',
      id: matchedBookId,
      type: 'eBook',
    }).catch(() => undefined)

    const prettyTitle = bestMatch.bookName || normalizedTitle
    const prettyAuthor = bestMatch.authorName || normalizedAuthor
    const suffix = prettyAuthor ? ` by ${prettyAuthor}` : ''

    return {
      ok: true,
      status: 'queued',
      message: `Queued in LazyLibrarian: ${prettyTitle}${suffix}.`,
    }
  } catch (error) {
    return {
      ok: false,
      status: 'provider_error',
      error:
        error instanceof Error
          ? error.message
          : 'LazyLibrarian request failed unexpectedly.',
    }
  }
}

async function queueBookWithRetry(config: LazyLibrarianConfig, bookId: string) {
  for (let attempt = 0; attempt < MAX_QUEUE_RETRIES; attempt += 1) {
    const response = await callLazyLibrarianApi(config, {
      cmd: 'queueBook',
      id: bookId,
      type: 'eBook',
    })

    if (isOkResponse(response)) {
      return true
    }

    const responseText = asCleanString(response)

    if (responseText && responseText.toLowerCase().includes('invalid id')) {
      await wait(QUEUE_RETRY_DELAY_MS)
      continue
    }

    throw new Error(
      responseText
        ? `LazyLibrarian queueBook failed: ${responseText}`
        : 'LazyLibrarian queueBook returned an unexpected response.',
    )
  }

  return false
}

async function callLazyLibrarianApi(
  config: LazyLibrarianConfig,
  params: Record<string, string>,
) {
  const url = new URL('/api', config.baseUrl)
  url.searchParams.set('apikey', config.apiKey)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
  })

  const rawText = await response.text().catch(() => '')

  if (!response.ok) {
    throw new Error(
      `LazyLibrarian API request failed (${response.status}). ${rawText}`.trim(),
    )
  }

  const parsed = parseLazyLibrarianResponse(rawText)

  const apiError = getApiErrorResponse(parsed)

  if (apiError) {
    throw new Error(apiError)
  }

  return parsed
}

function parseLazyLibrarianResponse(rawText: string) {
  const text = rawText.trim()

  if (!text) {
    return ''
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }

  return text
}

function getApiErrorResponse(response: unknown) {
  const value = asCleanString(response)

  if (!value) {
    return undefined
  }

  const lower = value.toLowerCase()

  const isApiError =
    lower.includes('incorrect api key') ||
    lower.includes('missing parameter') ||
    lower.includes('unknown command') ||
    lower.includes('api not enabled')

  return isApiError ? value : undefined
}

function toCandidateList(response: unknown) {
  if (!Array.isArray(response)) {
    return []
  }

  return response.filter(
    (item): item is LazyLibrarianCandidate =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  )
}

function selectBestCandidate(candidates: Array<LazyLibrarianCandidate>) {
  const ranked = candidates
    .map((candidate) => {
      const score =
        toNumber(candidate.highest_fuzz) ??
        averageNumbers(
          toNumber(candidate.author_fuzz),
          toNumber(candidate.book_fuzz),
        ) ??
        0
      const ratingCount =
        toNumber(candidate.bookrate_count) ?? toNumber(candidate.num_reviews) ?? 0
      const bookId = asCleanString(candidate.bookid)
      const bookName = asCleanString(candidate.bookname)
      const authorName = asCleanString(candidate.authorname)

      return {
        score,
        ratingCount,
        bookId,
        bookName,
        authorName,
      }
    })
    .filter((item) => item.bookId)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return right.ratingCount - left.ratingCount
    })

  return ranked[0]
}

function isOkResponse(response: unknown) {
  const value = asCleanString(response)
  return value === 'OK'
}

function buildFindBookQuery(title: string, author: string | undefined) {
  if (!author) {
    return title
  }

  return `${title} <ll> ${author}`
}

function getLazyLibrarianConfig(): LazyLibrarianConfig | null {
  const baseUrl = normalizeEnvString(process.env.LAZYLIBRARIAN_BASE_URL)
  const apiKey = normalizeEnvString(process.env.LAZYLIBRARIAN_API_KEY)

  if (!baseUrl || !apiKey) {
    return null
  }

  const thresholdInput = Number(
    normalizeEnvString(process.env.LAZYLIBRARIAN_MATCH_THRESHOLD),
  )
  const matchThreshold = Number.isFinite(thresholdInput)
    ? Math.max(0, Math.min(100, thresholdInput))
    : DEFAULT_MATCH_THRESHOLD

  return {
    baseUrl,
    apiKey,
    matchThreshold,
  }
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function averageNumbers(
  first: number | undefined,
  second: number | undefined,
): number | undefined {
  if (typeof first !== 'number' || typeof second !== 'number') {
    return undefined
  }

  return (first + second) / 2
}

function asCleanString(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

import { createHash } from 'node:crypto'
import { normalizeEnvString } from './env'
import type { RequestReleaseSelection } from './types'

const DEFAULT_TIMEOUT_MS = 12000
const MAX_NOTE_LENGTH = 1000

interface ShelfmarkConfig {
  baseUrl: string
  username: string
  password: string
  timeoutMs: number
}

interface ShelfmarkAuthCheckResponse {
  authenticated?: boolean
  auth_required?: boolean
  auth_mode?: string
}

interface ShelfmarkLoginResponse {
  success?: boolean
  error?: string
}

interface ShelfmarkErrorResponse {
  error?: string
  code?: string
  required_mode?: string
}

interface ShelfmarkReleasesResponse {
  releases?: Array<Record<string, unknown>>
  sources_searched?: Array<string>
}

interface ShelfmarkSession {
  cookie: string
}

type ShelfmarkFailure = {
  ok: false
  status: 'provider_error' | 'unconfigured'
  error: string
}

export interface ShelfmarkReleaseSearchInput {
  title: string
  author?: string
  source?: string
  manualQuery?: string
}

export interface ShelfmarkReleaseCandidate extends RequestReleaseSelection {
  sourceLabel: string
}

export type ShelfmarkReleaseSearchResult =
  | {
      ok: true
      releases: Array<ShelfmarkReleaseCandidate>
      sourcesSearched: Array<string>
    }
  | ShelfmarkFailure

/**
 * Input payload for creating a Shelfmark request.
 */
export interface ShelfmarkRequestInput {
  title: string
  author?: string
  selectedRelease?: RequestReleaseSelection
  notes?: string
  requesterIp?: string
  sourceUrl?: string
}

/**
 * Result states for Shelfmark request attempts.
 */
export type ShelfmarkRequestResult =
  | {
      ok: true
      status: 'queued'
      message: string
    }
  | ShelfmarkFailure

/**
 * Returns true when Shelfmark request credentials are available.
 */
export function isShelfmarkConfigured() {
  return getShelfmarkConfig() !== null
}

/**
 * Creates a book-level request in Shelfmark using a service account session.
 */
export async function submitBookRequestToShelfmark(
  input: ShelfmarkRequestInput,
): Promise<ShelfmarkRequestResult> {
  const config = getShelfmarkConfig()

  if (!config) {
    return {
      ok: false,
      status: 'unconfigured',
      error:
        'Shelfmark is not configured. Set SHELFMARK_BASE_URL, SHELFMARK_USERNAME, and SHELFMARK_PASSWORD.',
    }
  }

  const title = input.title.trim()
  const author =
    input.author?.trim() || input.selectedRelease?.author?.trim() || 'Unknown Author'

  if (title.length < 2) {
    return {
      ok: false,
      status: 'provider_error',
      error: 'Book title is too short to submit to Shelfmark.',
    }
  }

  let sessionCookie: string | undefined

  try {
    const session = await openShelfmarkSession(config)

    if (!session.ok) {
      return session
    }

    sessionCookie = session.session.cookie

    const requestBody = buildShelfmarkCreateRequestBody({
      input,
      title,
      author,
    })

    const createRequestResponse = await callShelfmarkJson<ShelfmarkErrorResponse>({
      config,
      method: 'POST',
      path: '/api/requests',
      cookie: sessionCookie,
      body: requestBody,
    })

    if (createRequestResponse.response.ok) {
      return {
        ok: true,
        status: 'queued',
        message: `Queued in Shelfmark: ${title}${author ? ` by ${author}` : ''}.`,
      }
    }

    const errorCode = normalizeErrorMessage(createRequestResponse.body?.code)
    const errorMessage = normalizeErrorMessage(createRequestResponse.body?.error)

    if (
      createRequestResponse.response.status === 409 &&
      errorCode === 'duplicate_pending_request'
    ) {
      return {
        ok: true,
        status: 'queued',
        message: 'This title is already pending in Shelfmark.',
      }
    }

    if (errorCode === 'requests_unavailable') {
      return {
        ok: false,
        status: 'unconfigured',
        error:
          'Shelfmark request workflow is disabled. Enable Requests in Shelfmark Users & Requests settings.',
      }
    }

    if (errorCode === 'user_identity_unavailable') {
      return {
        ok: false,
        status: 'unconfigured',
        error:
          'Shelfmark service account has no request identity. Ensure auth is enabled and the account can access requests.',
      }
    }

    if (errorCode === 'policy_requires_download') {
      return {
        ok: false,
        status: 'provider_error',
        error:
          'Shelfmark policy currently requires direct download selection. Set default ebook mode to Request Book (or Request Release).',
      }
    }

    if (errorCode === 'policy_requires_request') {
      return {
        ok: false,
        status: 'provider_error',
        error:
          'Shelfmark policy requires book-level requests. To submit a selected release, set ebook mode to Request Release.',
      }
    }

    return {
      ok: false,
      status: 'provider_error',
      error:
        errorMessage ||
        `Shelfmark request failed (${createRequestResponse.response.status}).`,
    }
  } catch (error) {
    return {
      ok: false,
      status: 'provider_error',
      error:
        error instanceof Error
          ? error.message
          : 'Shelfmark request failed unexpectedly.',
    }
  } finally {
    if (sessionCookie) {
      await callShelfmarkJson({
        config,
        method: 'POST',
        path: '/api/auth/logout',
        cookie: sessionCookie,
      }).catch(() => undefined)
    }
  }
}

/**
 * Searches Shelfmark release sources and returns selectable release candidates.
 */
export async function searchShelfmarkReleases(
  input: ShelfmarkReleaseSearchInput,
): Promise<ShelfmarkReleaseSearchResult> {
  const config = getShelfmarkConfig()

  if (!config) {
    return {
      ok: false,
      status: 'unconfigured',
      error:
        'Shelfmark is not configured. Set SHELFMARK_BASE_URL, SHELFMARK_USERNAME, and SHELFMARK_PASSWORD.',
    }
  }

  const title = input.title.trim()
  const author = input.author?.trim() || undefined
  const source = input.source?.trim() || undefined
  const manualQuery = input.manualQuery?.trim() || undefined

  if (title.length < 2) {
    return {
      ok: false,
      status: 'provider_error',
      error: 'Book title is too short to search Shelfmark releases.',
    }
  }

  let sessionCookie: string | undefined

  try {
    const session = await openShelfmarkSession(config)

    if (!session.ok) {
      return session
    }

    sessionCookie = session.session.cookie

    const params = new URLSearchParams({
      provider: 'manual',
      book_id: buildManualProviderId(title, author ?? 'Unknown Author'),
      title,
      content_type: 'ebook',
    })

    if (author) {
      params.set('author', author)
    }

    if (source) {
      params.set('source', source)
    }

    if (manualQuery) {
      params.set('manual_query', manualQuery)
    }

    const releasesResponse = await callShelfmarkJson<ShelfmarkReleasesResponse>({
      config,
      method: 'GET',
      path: `/api/releases?${params.toString()}`,
      cookie: sessionCookie,
    })

    if (!releasesResponse.response.ok) {
      const errorMessage = normalizeErrorMessage(
        (releasesResponse.body as ShelfmarkErrorResponse | undefined)?.error,
      )

      return {
        ok: false,
        status: 'provider_error',
        error:
          errorMessage ||
          `Shelfmark release search failed (${releasesResponse.response.status}).`,
      }
    }

    const releases = toShelfmarkReleaseCandidates(releasesResponse.body?.releases)

    return {
      ok: true,
      releases,
      sourcesSearched: Array.isArray(releasesResponse.body?.sources_searched)
        ? releasesResponse.body.sources_searched
        : [],
    }
  } catch (error) {
    return {
      ok: false,
      status: 'provider_error',
      error:
        error instanceof Error
          ? error.message
          : 'Shelfmark release search failed unexpectedly.',
    }
  } finally {
    if (sessionCookie) {
      await callShelfmarkJson({
        config,
        method: 'POST',
        path: '/api/auth/logout',
        cookie: sessionCookie,
      }).catch(() => undefined)
    }
  }
}

async function openShelfmarkSession(
  config: ShelfmarkConfig,
): Promise<{ ok: true; session: ShelfmarkSession } | ShelfmarkFailure> {
  const authCheck = await callShelfmarkJson<ShelfmarkAuthCheckResponse>({
    config,
    method: 'GET',
    path: '/api/auth/check',
  })

  if (!authCheck.response.ok) {
    return {
      ok: false,
      status: 'provider_error',
      error: `Shelfmark auth check failed (${authCheck.response.status}).`,
    }
  }

  const authMode = normalizeShelfmarkAuthMode(authCheck.body?.auth_mode)

  if (authMode === 'none') {
    return {
      ok: false,
      status: 'unconfigured',
      error:
        'Shelfmark request API is disabled in no-auth mode. Enable local/OIDC/CWA auth and request workflow in Shelfmark.',
    }
  }

  if (authMode === 'proxy') {
    return {
      ok: false,
      status: 'unconfigured',
      error:
        'Shelfmark proxy-auth mode is not supported for backend request automation. Use a local service account instead.',
    }
  }

  const login = await callShelfmarkJson<ShelfmarkLoginResponse>({
    config,
    method: 'POST',
    path: '/api/auth/login',
    body: {
      username: config.username,
      password: config.password,
      remember_me: false,
    },
  })

  const sessionCookie = extractSessionCookie(login.response)

  if (!login.response.ok || login.body?.success !== true || !sessionCookie) {
    const loginError = normalizeErrorMessage(login.body?.error)

    return {
      ok: false,
      status: 'provider_error',
      error:
        loginError ||
        'Shelfmark login failed. Check SHELFMARK_USERNAME/SHELFMARK_PASSWORD and service availability.',
    }
  }

  const postLoginAuthCheck = await callShelfmarkJson<ShelfmarkAuthCheckResponse>({
    config,
    method: 'GET',
    path: '/api/auth/check',
    cookie: sessionCookie,
  })

  if (
    !postLoginAuthCheck.response.ok ||
    postLoginAuthCheck.body?.authenticated !== true
  ) {
    return {
      ok: false,
      status: 'provider_error',
      error:
        'Shelfmark login succeeded but session cookie was not accepted. Check reverse proxy, URL base path, and cookie forwarding.',
    }
  }

  return {
    ok: true,
    session: {
      cookie: sessionCookie,
    },
  }
}

function buildShelfmarkCreateRequestBody({
  input,
  title,
  author,
}: {
  input: ShelfmarkRequestInput
  title: string
  author: string
}) {
  const selectedRelease = input.selectedRelease

  if (!selectedRelease) {
    return {
      context: {
        request_level: 'book',
        content_type: 'ebook',
      },
      content_type: 'ebook',
      book_data: {
        title,
        author,
        provider: 'manual',
        provider_id: buildManualProviderId(title, author),
        content_type: 'ebook',
      },
      note: buildShelfmarkNote(input),
    }
  }

  return {
    context: {
      request_level: 'release',
      content_type: 'ebook',
      source: selectedRelease.source,
    },
    content_type: 'ebook',
    book_data: {
      title,
      author,
      provider: 'manual',
      provider_id: buildManualProviderId(title, author),
      content_type: 'ebook',
      source: selectedRelease.source,
      format: selectedRelease.format,
    },
    release_data: {
      source: selectedRelease.source,
      source_id: selectedRelease.sourceId,
      title: selectedRelease.title || title,
      author: selectedRelease.author || author,
      format: selectedRelease.format,
      size: selectedRelease.size,
      indexer: selectedRelease.indexer,
      protocol: selectedRelease.protocol,
      seeders: selectedRelease.seeders,
      download_url: selectedRelease.downloadUrl,
      content_type: 'ebook',
    },
    note: buildShelfmarkNote(input),
  }
}

async function callShelfmarkJson<TBody = unknown>({
  config,
  method,
  path,
  cookie,
  body,
}: {
  config: ShelfmarkConfig
  method: 'GET' | 'POST'
  path: string
  cookie?: string
  body?: Record<string, unknown>
}) {
  const url = resolveShelfmarkUrl(config.baseUrl, path)

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (cookie) {
    headers.Cookie = cookie
  }

  if (body) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetchWithTimeout(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }, config.timeoutMs)

  const parsedBody = (await response
    .json()
    .catch(() => undefined)) as TBody | undefined

  return {
    response,
    body: parsedBody,
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const abortController = new AbortController()
  const timeout = setTimeout(() => {
    abortController.abort()
  }, timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: abortController.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function extractSessionCookie(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => Array<string>
  }

  const setCookies = collectSetCookieHeaders(headers)
  const primaryCookie =
    setCookies.find((cookie) => cookie.toLowerCase().startsWith('session=')) ??
    setCookies[0]

  if (!primaryCookie) {
    return undefined
  }

  const cookieValue = primaryCookie.split(';')[0]?.trim()
  return cookieValue && cookieValue.length > 0 ? cookieValue : undefined
}

function buildManualProviderId(title: string, author: string) {
  const digest = createHash('sha1')
    .update(`${title.toLowerCase()}|${author.toLowerCase()}`)
    .digest('hex')

  return `manual-${digest.slice(0, 20)}`
}

function buildShelfmarkNote(input: ShelfmarkRequestInput) {
  const lines: Array<string> = []
  const note = input.notes?.trim()

  if (note) {
    lines.push(note)
  }

  if (input.requesterIp && input.requesterIp !== 'unknown') {
    lines.push(`Requested from IP: ${input.requesterIp}`)
  }

  if (input.sourceUrl) {
    lines.push(`Source URL: ${input.sourceUrl}`)
  }

  if (input.selectedRelease) {
    lines.push(
      `Selected release: ${input.selectedRelease.source}:${input.selectedRelease.sourceId}`,
    )
  }

  if (lines.length === 0) {
    return undefined
  }

  const joined = lines.join('\n')
  return joined.length > MAX_NOTE_LENGTH
    ? `${joined.slice(0, MAX_NOTE_LENGTH - 3)}...`
    : joined
}

function normalizeShelfmarkAuthMode(value: string | undefined) {
  const normalized = normalizeErrorMessage(value)
  return normalized ? normalized.toLowerCase() : undefined
}

function resolveShelfmarkUrl(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(normalizedPath, normalizedBase).toString()
}

function collectSetCookieHeaders(
  headers: Headers & {
    getSetCookie?: () => Array<string>
  },
) {
  if (typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie().filter((entry) => entry.trim().length > 0)

    if (cookies.length > 0) {
      return cookies
    }
  }

  const combined = headers.get('set-cookie')

  if (!combined || combined.trim().length === 0) {
    return []
  }

  return splitSetCookieHeader(combined)
}

function splitSetCookieHeader(headerValue: string) {
  const cookies: Array<string> = []
  let current = ''
  let inExpiresAttribute = false

  for (let index = 0; index < headerValue.length; index += 1) {
    const character = headerValue[index]

    if (character === ',') {
      if (!inExpiresAttribute) {
        if (current.trim().length > 0) {
          cookies.push(current.trim())
        }

        current = ''
        continue
      }
    }

    current += character

    const lowerCurrent = current.toLowerCase()

    if (lowerCurrent.endsWith('expires=')) {
      inExpiresAttribute = true
      continue
    }

    if (inExpiresAttribute && character === ';') {
      inExpiresAttribute = false
    }
  }

  if (current.trim().length > 0) {
    cookies.push(current.trim())
  }

  return cookies
}

function toShelfmarkReleaseCandidates(raw: unknown) {
  if (!Array.isArray(raw)) {
    return []
  }

  const candidates: Array<ShelfmarkReleaseCandidate> = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }

    const release = entry as Record<string, unknown>
    const source = asCleanString(release.source)
    const sourceId = asCleanString(release.source_id)

    if (!source || !sourceId) {
      continue
    }

    candidates.push({
      source,
      sourceId,
      sourceLabel: source,
      title: asCleanString(release.title),
      author: asCleanString(release.author),
      format: asCleanString(release.format),
      size: asCleanString(release.size),
      indexer: asCleanString(release.indexer),
      protocol: asCleanString(release.protocol),
      seeders: toFiniteNumber(release.seeders),
      downloadUrl: asCleanString(release.download_url),
    })
  }

  return candidates
}

function asCleanString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return undefined
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function normalizeErrorMessage(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function getShelfmarkConfig(): ShelfmarkConfig | null {
  const baseUrl = normalizeEnvString(process.env.SHELFMARK_BASE_URL)
  const username = normalizeEnvString(process.env.SHELFMARK_USERNAME)
  const password = normalizeEnvString(process.env.SHELFMARK_PASSWORD)

  if (!baseUrl || !username || !password) {
    return null
  }

  const configuredTimeout = Number(
    normalizeEnvString(process.env.SHELFMARK_HTTP_TIMEOUT_MS),
  )

  return {
    baseUrl,
    username,
    password,
    timeoutMs:
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS,
  }
}

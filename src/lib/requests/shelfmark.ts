import { createHash } from 'node:crypto'
import { normalizeEnvString } from './env'

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

/**
 * Input payload for creating a Shelfmark request.
 */
export interface ShelfmarkRequestInput {
  title: string
  author?: string
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
  | {
      ok: false
      status: 'provider_error' | 'unconfigured'
      error: string
    }

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
  const author = input.author?.trim() || 'Unknown Author'

  if (title.length < 2) {
    return {
      ok: false,
      status: 'provider_error',
      error: 'Book title is too short to submit to Shelfmark.',
    }
  }

  let sessionCookie: string | undefined

  try {
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

    sessionCookie = extractSessionCookie(login.response)

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

    const createRequestResponse = await callShelfmarkJson<ShelfmarkErrorResponse>({
      config,
      method: 'POST',
      path: '/api/requests',
      cookie: sessionCookie,
      body: {
        context: {
          request_level: 'book',
          content_type: 'ebook',
        },
        content_type: 'ebook',
        book_data: {
          title,
          author,
          provider: 'habitat-calibre',
          provider_id: buildProviderId(title, author),
          content_type: 'ebook',
        },
        note: buildShelfmarkNote(input),
      },
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
  const url = new URL(path, config.baseUrl)

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (cookie) {
    headers.Cookie = cookie
  }

  if (body) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetchWithTimeout(url.toString(), {
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

  const setCookies =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []

  const primaryCookie = setCookies[0] ?? response.headers.get('set-cookie')

  if (!primaryCookie) {
    return undefined
  }

  const cookieValue = primaryCookie.split(';')[0]?.trim()
  return cookieValue && cookieValue.length > 0 ? cookieValue : undefined
}

function buildProviderId(title: string, author: string) {
  const digest = createHash('sha1')
    .update(`${title.toLowerCase()}|${author.toLowerCase()}`)
    .digest('hex')

  return `habitat-${digest.slice(0, 20)}`
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

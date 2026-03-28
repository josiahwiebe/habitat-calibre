const PLEX_ACCOUNT_URL = 'https://plex.tv/users/account.json'
const PLEX_RESOURCES_URL = 'https://plex.tv/api/v2/resources?includeHttps=1'

export type PlexAuthMode = 'allowlist' | 'shared' | 'allowlist_or_shared'

/**
 * Minimal Plex identity payload from plex.tv account lookup.
 */
export interface PlexIdentity {
  id: string
  email: string
  username?: string
  avatarUrl?: string
}

/**
 * Access evaluation details for auth decisions.
 */
export interface PlexAccessDecision {
  allowed: boolean
  mode: PlexAuthMode
  viaAllowlist: boolean
  viaSharedAccess: boolean
}

/**
 * Reads configured Plex auth mode with a safe default.
 */
export function getPlexAuthMode(): PlexAuthMode {
  const value = process.env.AUTH_PLEX_MODE?.trim().toLowerCase()

  if (value === 'allowlist' || value === 'shared' || value === 'allowlist_or_shared') {
    return value
  }

  return 'allowlist_or_shared'
}

/**
 * Resolves a case-insensitive email allowlist from env.
 */
export function getPlexEmailAllowlist() {
  return new Set(
    (process.env.PLEX_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  )
}

/**
 * Returns true when the user email appears in explicit allowlist.
 */
export function isEmailAllowlisted(email: string) {
  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail) {
    return false
  }

  return getPlexEmailAllowlist().has(normalizedEmail)
}

/**
 * Queries plex.tv account endpoint and maps to normalized identity.
 */
export async function fetchPlexIdentity(authToken: string): Promise<PlexIdentity> {
  const response = await fetch(PLEX_ACCOUNT_URL, {
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': authToken,
    },
  })

  if (!response.ok) {
    throw new Error(`Plex account lookup failed (${response.status})`)
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        user?: {
          id?: string | number
          email?: string
          username?: string
          title?: string
          thumb?: string
        }
      }
    | null

  const user = payload?.user
  const id = user?.id ? String(user.id) : ''
  const email = user?.email?.trim().toLowerCase() ?? ''

  if (!id || !email) {
    throw new Error('Plex account payload missing user id or email')
  }

  return {
    id,
    email,
    username: user?.username?.trim() || user?.title?.trim() || undefined,
    avatarUrl: user?.thumb?.trim() || undefined,
  }
}

/**
 * Evaluates access according to configured mode using allowlist and/or shared access.
 */
export async function evaluatePlexAccess(
  identity: PlexIdentity,
  authToken: string,
) {
  const mode = getPlexAuthMode()
  const viaAllowlist = isEmailAllowlisted(identity.email)
  const viaSharedAccess =
    mode === 'allowlist' ? false : await hasPlexSharedServerAccess(authToken)

  const allowed =
    mode === 'allowlist'
      ? viaAllowlist
      : mode === 'shared'
        ? viaSharedAccess
        : viaAllowlist || viaSharedAccess

  const decision: PlexAccessDecision = {
    allowed,
    mode,
    viaAllowlist,
    viaSharedAccess,
  }

  return decision
}

/**
 * Checks whether the Plex token can see the configured server machine id.
 */
export async function hasPlexSharedServerAccess(authToken: string) {
  const machineId = process.env.PLEX_SERVER_MACHINE_ID?.trim().toLowerCase()

  if (!machineId) {
    return false
  }

  try {
    const response = await fetch(PLEX_RESOURCES_URL, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': authToken,
      },
    })

    if (!response.ok) {
      return false
    }

    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null

    if (!payload) {
      return false
    }

    const resources = normalizePlexResources(payload)

    return resources.some((resource) => {
      const identifier =
        asNonEmptyString(resource.clientIdentifier) ??
        asNonEmptyString(resource.machineIdentifier)

      if (!identifier) {
        return false
      }

      const provides = asNonEmptyString(resource.provides)?.toLowerCase() ?? ''
      const product = asNonEmptyString(resource.product)?.toLowerCase() ?? ''
      const resourceType = asNonEmptyString(resource.type)?.toLowerCase() ?? ''
      const isServerResource =
        provides.includes('server') ||
        product.includes('plex media server') ||
        resourceType === 'server'

      return isServerResource && identifier.toLowerCase() === machineId
    })
  } catch {
    return false
  }
}

function normalizePlexResources(
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
) {
  if (Array.isArray(payload)) {
    return payload
  }

  const mediaContainer = asObject(payload.MediaContainer)

  const candidates = [
    payload.resources,
    payload.devices,
    payload.Metadata,
    payload.Device,
    mediaContainer?.resources,
    mediaContainer?.devices,
    mediaContainer?.Metadata,
    mediaContainer?.Device,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> =>
        isRecord(item),
      )
    }
  }

  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asObject(value: unknown) {
  return isRecord(value) ? value : null
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

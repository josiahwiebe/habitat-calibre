import { useSession } from '@tanstack/react-start/server'

const DEV_SESSION_SECRET = 'dev-only-session-secret-change-me-before-production-1234567890'

/**
 * Authenticated Plex user stored in the app session.
 */
export interface SessionUser {
  email: string
  plexUserId: string
  username?: string
  avatarUrl?: string
}

interface AppSessionData {
  user?: SessionUser
  signedInAt?: string
}

/**
 * Returns the configured session secret and validates minimum entropy.
 */
function getSessionSecret() {
  const configuredSecret = process.env.SESSION_SECRET?.trim()

  if (configuredSecret && configuredSecret.length >= 32) {
    return configuredSecret
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_SESSION_SECRET
  }

  throw new Error('SESSION_SECRET must be set to at least 32 characters')
}

/**
 * Opens the HTTP-only cookie session used by Habitat Calibre.
 */
export function useAppSession() {
  return useSession<AppSessionData>({
    name: 'habitat-calibre-session',
    password: getSessionSecret(),
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
}

/**
 * Returns the current signed-in user from session, if any.
 */
export async function getCurrentSessionUser() {
  const session = await useAppSession()
  return session.data.user ?? null
}

/**
 * Requires an authenticated session and returns the user payload.
 */
export async function requireSessionUser() {
  const user = await getCurrentSessionUser()

  if (!user) {
    throw new Response('Unauthorized', { status: 401 })
  }

  return user
}

/**
 * Persists authenticated user details into the app session.
 */
export async function setSessionUser(user: SessionUser) {
  const session = await useAppSession()

  await session.update({
    user,
    signedInAt: new Date().toISOString(),
  })
}

/**
 * Clears the current user session.
 */
export async function clearSessionUser() {
  const session = await useAppSession()
  await session.clear()
}

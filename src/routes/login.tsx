import * as React from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { LoaderCircle, ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { getCurrentSessionUser } from '~/lib/auth/session'

const loginSearchSchema = z.object({
  redirect: z.string().trim().optional(),
})

const getCurrentUserForLogin = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getCurrentSessionUser()
  },
)

type LoginStatus = 'idle' | 'authenticating' | 'signing_in' | 'error'
type LoginSearch = z.infer<typeof loginSearchSchema>

interface LoginResponse {
  ok?: boolean
  error?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search) => loginSearchSchema.parse(search),
  beforeLoad: async ({ search }) => {
    const user = await getCurrentUserForLogin()

    if (!user) {
      return
    }

    throw redirect({
      href: normalizeRedirectTarget(search.redirect),
    })
  },
  component: LoginRoute,
})

/**
 * Sign-in route using Plex PIN OAuth flow.
 */
function LoginRoute() {
  const search = Route.useSearch() as LoginSearch
  const redirectTarget = normalizeRedirectTarget(search.redirect)
  const [status, setStatus] = React.useState<LoginStatus>('idle')
  const [feedback, setFeedback] = React.useState<string | null>(null)

  const isWorking = status === 'authenticating' || status === 'signing_in'

  const handlePlexSignIn = async () => {
    setStatus('authenticating')
    setFeedback(null)

    try {
      const authToken = await loginWithPlexPin()

      setStatus('signing_in')

      const response = await fetch('/api/auth/plex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authToken }),
      })

      const payload = (await response
        .json()
        .catch(() => ({}))) as LoginResponse

      if (!response.ok || payload.ok === false) {
        setStatus('error')
        setFeedback(payload.error || 'Plex sign-in failed.')
        return
      }

      window.location.assign(redirectTarget)
    } catch (error) {
      setStatus('error')
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Plex sign-in failed. Please try again.',
      )
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center px-4 py-12 sm:px-6">
      <section className="rounded-3xl border border-stone-300/90 bg-stone-50/95 p-6 shadow-[0_38px_70px_-50px_rgba(15,23,42,0.75)] sm:p-8">
        <div className="space-y-3">
          <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-teal-800/25 bg-teal-700/10 text-teal-900">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-4xl leading-tight text-stone-900">
            Sign in with Plex
          </h1>
          <p className="text-sm text-stone-600 sm:text-base">
            Access is granted to users in your explicit allowlist or users with
            shared access to your Plex library.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <Button
            className="h-11 w-full"
            onClick={handlePlexSignIn}
            disabled={isWorking}
          >
            {isWorking ? (
              <>
                <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
                Connecting to Plex...
              </>
            ) : (
              <>Continue with Plex</>
            )}
          </Button>

          {feedback ? (
            <p className="rounded-xl border border-rose-700/25 bg-rose-700/10 px-3 py-2 text-sm text-rose-900">
              {feedback}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  )
}

async function loginWithPlexPin() {
  const plexHeaders = createPlexClientHeaders()

  const pinResponse = await fetch('https://plex.tv/api/v2/pins?strong=true', {
    method: 'POST',
    headers: plexHeaders,
  })

  if (!pinResponse.ok) {
    throw new Error('Unable to initiate Plex sign-in.')
  }

  const pinPayload = (await pinResponse
    .json()
    .catch(() => null)) as { id?: number; code?: string } | null

  if (!pinPayload?.id || !pinPayload.code) {
    throw new Error('Plex sign-in did not return a valid PIN.')
  }

  const popup = openPlexPopup()

  if (!popup) {
    throw new Error('Popup blocked. Allow popups for this site and retry.')
  }

  const authParams = new URLSearchParams({
    clientID: plexHeaders['X-Plex-Client-Identifier'],
    'context[device][product]': plexHeaders['X-Plex-Product'],
    'context[device][version]': plexHeaders['X-Plex-Version'],
    'context[device][platform]': plexHeaders['X-Plex-Platform'],
    'context[device][platformVersion]': plexHeaders['X-Plex-Platform-Version'],
    'context[device][device]': plexHeaders['X-Plex-Device'],
    'context[device][deviceName]': plexHeaders['X-Plex-Device-Name'],
    'context[device][model]': plexHeaders['X-Plex-Model'],
    'context[device][screenResolution]':
      plexHeaders['X-Plex-Device-Screen-Resolution'],
    'context[device][layout]': 'desktop',
    code: pinPayload.code,
  })

  popup.location.href = `https://app.plex.tv/auth/#!?${authParams.toString()}`

  try {
    const token = await pollForPlexAuthToken(pinPayload.id, plexHeaders, popup)
    popup.close()
    return token
  } catch (error) {
    popup.close()
    throw error
  }
}

async function pollForPlexAuthToken(
  pinId: number,
  headers: Record<string, string>,
  popup: Window,
) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (popup.closed) {
      throw new Error('Plex sign-in window was closed before completion.')
    }

    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers,
    })

    if (response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as { authToken?: string } | null

      if (payload?.authToken && payload.authToken.length > 0) {
        return payload.authToken
      }
    }

    await wait(1000)
  }

  throw new Error('Timed out waiting for Plex authentication approval.')
}

function createPlexClientHeaders() {
  const clientIdentifier = getOrCreatePlexClientIdentifier()

  return {
    Accept: 'application/json',
    'X-Plex-Product': 'Habitat Calibre',
    'X-Plex-Version': 'Plex OAuth',
    'X-Plex-Client-Identifier': clientIdentifier,
    'X-Plex-Model': 'Habitat Calibre Web',
    'X-Plex-Platform': navigator.platform || 'web',
    'X-Plex-Platform-Version': navigator.userAgent,
    'X-Plex-Device': navigator.userAgent,
    'X-Plex-Device-Name': `${navigator.platform || 'Browser'} (Habitat Calibre)`,
    'X-Plex-Device-Screen-Resolution': `${window.screen.width}x${window.screen.height}`,
    'X-Plex-Language': navigator.language || 'en',
  }
}

function getOrCreatePlexClientIdentifier() {
  const storageKey = 'habitat-calibre-plex-client-id'
  const existing = window.localStorage.getItem(storageKey)

  if (existing && existing.length > 0) {
    return existing
  }

  const createdId =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  window.localStorage.setItem(storageKey, createdId)
  return createdId
}

function openPlexPopup() {
  const width = 600
  const height = 700
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)

  return window.open(
    'about:blank',
    'plex-auth',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  )
}

function normalizeRedirectTarget(redirectTarget: string | undefined) {
  if (!redirectTarget) {
    return '/'
  }

  if (!redirectTarget.startsWith('/') || redirectTarget.startsWith('//')) {
    return '/'
  }

  return redirectTarget
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

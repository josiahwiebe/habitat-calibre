/// <reference types="vite/client" />
import {
  HeadContent,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import * as React from 'react'
import { Button } from '~/components/ui/button'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { getCurrentSessionUser } from '~/lib/auth/session'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  return getCurrentSessionUser()
})

export const Route = createRootRoute({
  beforeLoad: async () => {
    const user = await getCurrentUser()

    return {
      user,
    }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      ...seo({
        title: 'Habitat Calibre',
        description:
          'Private Calibre library browser for Habitat.',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { user } = Route.useRouteContext()
  const [isSigningOut, setIsSigningOut] = React.useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      })
    } finally {
      window.location.assign('/login')
    }
  }

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-stone-100 text-stone-900 antialiased">
        <div className="relative min-h-screen bg-[radial-gradient(circle_at_18%_12%,rgba(194,176,145,0.32),transparent_44%),radial-gradient(circle_at_86%_2%,rgba(31,107,99,0.16),transparent_39%),linear-gradient(180deg,#f9f6ef_0%,#f3ede4_48%,#ece5da_100%)]">
          {user ? (
            <div className="mx-auto flex w-full max-w-[1400px] items-center justify-end gap-3 px-4 pt-4 sm:px-6 lg:px-8">
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-stone-600">
                {user.username || user.email}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={isSigningOut}
                onClick={handleSignOut}
              >
                {isSigningOut ? 'Signing out...' : 'Sign out'}
              </Button>
            </div>
          ) : null}
          {children}
        </div>
        {import.meta.env.DEV ? (
          <TanStackRouterDevtools position="bottom-right" />
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}

import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'
import { parseLibrarySearch } from '~/lib/calibre/search-schema'

/**
 * Default error boundary for route-level and root-level exceptions.
 */
export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  console.error('DefaultCatchBoundary Error:', error)

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-serif text-3xl text-stone-900">Something broke</p>
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            router.invalidate()
          }}
        >
          Try Again
        </Button>
        {isRoot ? (
          <Link to="/" search={parseLibrarySearch({})}>
            <Button>Home</Button>
          </Link>
        ) : (
          <Button
            onClick={() => {
              window.history.back()
            }}
          >
            Go Back
          </Button>
        )}
      </div>
    </div>
  )
}

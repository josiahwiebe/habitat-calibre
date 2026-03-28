import { Link } from '@tanstack/react-router'
import type * as React from 'react'
import { Button } from '~/components/ui/button'
import { parseLibrarySearch } from '~/lib/calibre/search-schema'

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-serif text-3xl text-stone-900">Not found</p>
      <p className="text-sm text-stone-600">
        {children || 'The route or book you requested does not exist in this library.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" onClick={() => window.history.back()}>
          Go back
        </Button>
        <Link to="/" search={parseLibrarySearch({})}>
          <Button>Back to Library</Button>
        </Link>
      </div>
    </div>
  )
}

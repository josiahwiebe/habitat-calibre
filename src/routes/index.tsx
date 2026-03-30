import * as React from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Filter, Search, X } from 'lucide-react'
import { BookCard } from '~/components/library/book-card'
import { BookListItem } from '~/components/library/book-list-item'
import { RequestBookDialog } from '~/components/library/request-book-dialog'
import { SortSelect } from '~/components/library/sort-select'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { parseLibrarySearch } from '~/lib/calibre/search-schema'
import { getLibrarySearchResult } from '~/lib/calibre/server'
import type { LibrarySearchInput } from '~/lib/calibre/types'
import { cn } from '~/lib/utils'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  validateSearch: (search) => parseLibrarySearch(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getLibrarySearchResult({ data: deps }),
  component: Home,
})

/**
 * Main searchable library route.
 */
function Home() {
  const search = Route.useSearch() as LibrarySearchInput
  const data = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const [isSmallViewport, setIsSmallViewport] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')

    const apply = () => {
      setIsSmallViewport(mediaQuery.matches)
    }

    apply()

    mediaQuery.addEventListener('change', apply)

    return () => {
      mediaQuery.removeEventListener('change', apply)
    }
  }, [])

  const activeView = search.view ?? (isSmallViewport ? 'list' : 'grid')

  const [queryText, setQueryText] = React.useState(search.q ?? '')

  React.useEffect(() => {
    setQueryText(search.q ?? '')
  }, [search.q])

  const updateSearch = React.useCallback(
    (patch: Partial<LibrarySearchInput>) => {
      navigate({
        to: '/',
        search: (previous) => {
          const next: Record<string, unknown> = {
            ...previous,
            ...patch,
          }

          for (const key of Object.keys(next)) {
            if (
              next[key] === undefined ||
              next[key] === null ||
              next[key] === ''
            ) {
              delete next[key]
            }
          }

          return parseLibrarySearch(next)
        },
      })
    },
    [navigate],
  )

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    updateSearch({
      q: queryText || undefined,
      page: 1,
    })
  }

  const paginationWindow = createPaginationWindow(
    data.pagination.page,
    data.pagination.pageCount,
  )

  const selectedAuthorName = resolveFacetLabel(
    data.facets.authors.options,
    search.author,
  )
  const selectedSeriesName = resolveFacetLabel(
    data.facets.series.options,
    search.series,
  )
  const selectedTagName = resolveFacetLabel(data.facets.tags.options, search.tag)
  const selectedFormatName = resolveFacetLabel(
    data.facets.formats.options,
    search.format,
  )
  const selectedLanguageName = resolveFacetLabel(
    data.facets.languages.options,
    search.language,
  )
  const lastSyncedLabel = formatLastSynced(data.lastSyncedAt)

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-stone-300/90 bg-stone-50/90 p-6 shadow-[0_32px_64px_-52px_rgba(15,23,42,0.7)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Shared private library
            </p>
            <h1 className="font-serif text-4xl leading-tight text-stone-900 sm:text-5xl">
              Habitat Library
            </h1>
            <p className="max-w-2xl text-sm text-stone-600 sm:text-base">
              Search metadata instantly, scan covers in a clean workspace, and jump
              straight to downloads or Goodreads.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-300 bg-stone-100 p-3 text-sm sm:w-72">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-stone-500">Books</p>
                <p className="text-2xl font-semibold text-stone-900">
                  {data.stats.totalBooks}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-stone-500">Matches</p>
                <p className="text-2xl font-semibold text-stone-900">
                  {data.stats.matchedBooks}
                </p>
              </div>
            </div>
            <div className="mt-2 border-t border-stone-300 pt-2">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-500">Last Synced</p>
              <p className="text-sm font-semibold text-stone-900">{lastSyncedLabel}</p>
            </div>
          </div>
        </div>

        <form className="mt-6 flex flex-col gap-3" onSubmit={submitSearch}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500"
                aria-hidden="true"
              />
              <Input
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Search title, author, tags, publisher, ISBN..."
                className="pl-9"
              />
            </label>

            <Button type="submit" className="sm:min-w-24">
              Search
            </Button>

            {search.q ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQueryText('')
                  updateSearch({ q: undefined, page: 1 })
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SortSelect
              value={search.sort}
              onChange={(value) => updateSearch({ sort: value, page: 1 })}
            />

            <RequestBookDialog prefillTitle={queryText} />

            <Button
              variant={activeView === 'grid' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => updateSearch({ view: 'grid' })}
            >
              Grid
            </Button>
            <Button
              variant={activeView === 'list' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => updateSearch({ view: 'list' })}
            >
              List
            </Button>
          </div>
        </form>
      </header>

      {data.runtimeError ? (
        <section className="rounded-2xl border border-rose-700/35 bg-rose-700/10 px-4 py-3 text-sm text-rose-900">
          <p className="font-medium">Library unavailable</p>
          <p className="mt-1 text-rose-900/90">
            {data.runtimeError}. Set <code>CALIBRE_LIBRARY_PATH</code> to your
            Calibre root, or mount it as <code>/library</code> in Docker.
          </p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-stone-300/85 bg-stone-50/85 p-5 shadow-[0_24px_52px_-46px_rgba(15,23,42,0.65)]">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-stone-700">
          <Filter className="size-4" aria-hidden="true" />
          Filters
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FacetSelect
            label={data.facets.authors.label}
            value={search.author}
            options={data.facets.authors.options}
            onChange={(value) => updateSearch({ author: value, page: 1 })}
          />
          <FacetSelect
            label={data.facets.series.label}
            value={search.series}
            options={data.facets.series.options}
            onChange={(value) => updateSearch({ series: value, page: 1 })}
          />
          <FacetSelect
            label={data.facets.tags.label}
            value={search.tag}
            options={data.facets.tags.options}
            onChange={(value) => updateSearch({ tag: value, page: 1 })}
          />
          <FacetSelect
            label={data.facets.formats.label}
            value={search.format}
            options={data.facets.formats.options}
            onChange={(value) => updateSearch({ format: value, page: 1 })}
          />
          <FacetSelect
            label={data.facets.languages.label}
            value={search.language}
            options={data.facets.languages.options}
            onChange={(value) => updateSearch({ language: value, page: 1 })}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <ActiveFilter
            label="Author"
            value={selectedAuthorName}
            onRemove={() => updateSearch({ author: undefined, page: 1 })}
          />
          <ActiveFilter
            label="Series"
            value={selectedSeriesName}
            onRemove={() => updateSearch({ series: undefined, page: 1 })}
          />
          <ActiveFilter
            label="Tag"
            value={selectedTagName}
            onRemove={() => updateSearch({ tag: undefined, page: 1 })}
          />
          <ActiveFilter
            label="Format"
            value={selectedFormatName}
            onRemove={() => updateSearch({ format: undefined, page: 1 })}
          />
          <ActiveFilter
            label="Language"
            value={selectedLanguageName}
            onRemove={() => updateSearch({ language: undefined, page: 1 })}
          />
        </div>
      </section>

      {data.books.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-stone-400 bg-stone-50/70 p-10 text-center">
          <p className="font-serif text-2xl text-stone-900">
            {data.runtimeError ? 'Library not loaded' : 'No matches found'}
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {data.runtimeError
              ? 'Check your CALIBRE_LIBRARY_PATH value and verify metadata.db exists.'
              : 'Try removing a filter or searching with fewer terms.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                updateSearch({
                  q: undefined,
                  author: undefined,
                  tag: undefined,
                  series: undefined,
                  format: undefined,
                  language: undefined,
                  page: 1,
                })
              }
            >
              Reset filters
            </Button>
            {!data.runtimeError ? <RequestBookDialog prefillTitle={queryText} /> : null}
          </div>
        </section>
      ) : activeView === 'grid' ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {data.books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          {data.books.map((book) => (
            <BookListItem key={book.id} book={book} />
          ))}
        </section>
      )}

      <footer className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-300 bg-stone-50/90 px-4 py-3">
        <p className="text-sm text-stone-600">
          Page {data.pagination.page} of {data.pagination.pageCount}
        </p>

        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={data.pagination.page <= 1}
            onClick={() => updateSearch({ page: data.pagination.page - 1 })}
          >
            Prev
          </Button>

          {paginationWindow.map((page) => (
            <Button
              key={page}
              variant={page === data.pagination.page ? 'default' : 'secondary'}
              size="sm"
              onClick={() => updateSearch({ page })}
            >
              {page}
            </Button>
          ))}

          <Button
            variant="secondary"
            size="sm"
            disabled={data.pagination.page >= data.pagination.pageCount}
            onClick={() => updateSearch({ page: data.pagination.page + 1 })}
          >
            Next
          </Button>
        </div>
      </footer>
    </main>
  )
}

interface FacetSelectProps {
  label: string
  value: string | undefined
  options: Array<{ slug: string; name: string; count: number }>
  onChange: (value: string | undefined) => void
}

/**
 * Filter dropdown used by each facet bucket.
 */
function FacetSelect({ label, value, options, onChange }: FacetSelectProps) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </span>
      <select
        className="h-10 w-full rounded-xl border border-stone-300 bg-stone-100 px-3 text-sm text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/35"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.name} ({option.count})
          </option>
        ))}
      </select>
    </label>
  )
}

interface ActiveFilterProps {
  label: string
  value: string | undefined
  onRemove: () => void
}

/**
 * Tiny removable chip for visible active filters.
 */
function ActiveFilter({ label, value, onRemove }: ActiveFilterProps) {
  if (!value) {
    return null
  }

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-xs text-stone-700 hover:bg-stone-200',
      )}
      onClick={onRemove}
    >
      <span className="font-medium">{label}:</span>
      <span className="max-w-44 truncate">{value}</span>
      <X className="size-3" aria-hidden="true" />
    </button>
  )
}

function createPaginationWindow(current: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const start = Math.max(1, current - 2)
  const end = Math.min(pageCount, start + 4)
  const adjustedStart = Math.max(1, end - 4)

  return Array.from(
    { length: end - adjustedStart + 1 },
    (_, index) => adjustedStart + index,
  )
}

function resolveFacetLabel(
  options: Array<{ slug: string; name: string }>,
  selected: string | undefined,
) {
  if (!selected) {
    return undefined
  }

  return options.find((option) => option.slug === selected)?.name ?? selected
}

function formatLastSynced(lastSyncedAt: string | undefined) {
  if (!lastSyncedAt) {
    return 'Not synced yet'
  }

  const date = new Date(lastSyncedAt)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

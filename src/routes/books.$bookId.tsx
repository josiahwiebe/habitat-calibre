import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowUpRight, ChevronLeft, Download, Image } from 'lucide-react'
import { BookCover } from '~/components/library/book-cover'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { parseLibrarySearch } from '~/lib/calibre/search-schema'
import { getLibraryBookDetailById } from '~/lib/calibre/server'

export const Route = createFileRoute('/books/$bookId')({
  loader: ({ params }) =>
    getLibraryBookDetailById({
      data: { bookId: Number(params.bookId) },
    }),
  component: BookDetailsRoute,
})

/**
 * Rich metadata and download view for one book.
 */
function BookDetailsRoute() {
  const book = Route.useLoaderData()

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        to="/"
        search={parseLibrarySearch({})}
        className="inline-flex items-center gap-1 text-sm text-stone-700 hover:text-teal-800"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to library
      </Link>

      <section className="grid gap-6 rounded-3xl border border-stone-300/85 bg-stone-50/90 p-5 shadow-[0_38px_68px_-56px_rgba(15,23,42,0.75)] lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <BookCover title={book.title} coverUrl={book.coverUrl} className="shadow-[0_20px_48px_-28px_rgba(0,0,0,0.65)]" />
          <a
            href={book.coverDownloadUrl}
            className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-stone-300 bg-stone-100 py-2 text-sm text-stone-700 hover:bg-stone-200"
          >
            <Image className="size-4" aria-hidden="true" />
            Download cover
          </a>
        </div>

        <div className="space-y-5">
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Book detail</p>
            <h1 className="font-serif text-4xl leading-tight text-stone-900">{book.title}</h1>
            <p className="text-sm text-stone-600">
              {book.authors.map((author, index) => (
                <span key={`${book.id}-${author.slug}`}>
                  {index > 0 ? ' · ' : ''}
                  <Link
                    to="/authors/$authorSlug"
                    params={{ authorSlug: author.slug }}
                    className="hover:text-teal-800"
                  >
                    {author.name}
                  </Link>
                </span>
              ))}
            </p>
          </header>

          <div className="flex flex-wrap items-center gap-2">
            <a href={book.goodreadsUrl} target="_blank" rel="noreferrer">
              <Button>
                Open Goodreads
                <ArrowUpRight className="ml-1 size-4" aria-hidden="true" />
              </Button>
            </a>

            <Link to="/" search={parseLibrarySearch({ q: book.title, page: 1 })}>
              <Button variant="secondary">Find similar</Button>
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetaItem label="Published" value={book.publishedAt || 'Unknown'} />
            <MetaItem label="Language" value={book.language?.toUpperCase() || 'Unknown'} />
            <MetaItem label="Publisher" value={book.publisher || 'Unknown'} />
            <MetaItem label="Formats" value={book.formats.join(', ')} />
            {book.series ? (
              <MetaItem
                label="Series"
                value={`${book.series.name}${book.series.index ? ` (${book.series.index})` : ''}`}
              />
            ) : null}
          </div>

          {book.downloads.length > 0 ? (
            <section className="space-y-2">
              <p className="text-sm font-medium text-stone-800">Downloads</p>
              <div className="flex flex-wrap gap-2">
                {book.downloads.map((download) => (
                  <a
                    key={download.downloadUrl}
                    href={download.downloadUrl}
                    className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-stone-100 px-3 py-2 text-sm text-stone-700 hover:bg-stone-200"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {download.format}
                    <span className="text-xs text-stone-500">({formatFileSize(download.sizeBytes)})</span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {Object.keys(book.identifiers).length > 0 ? (
            <section className="space-y-2">
              <p className="text-sm font-medium text-stone-800">Identifiers</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(book.identifiers).map(([key, value]) => (
                  <Badge key={`${book.id}-${key}`} variant="subtle" className="font-mono text-[10px]">
                    {key}: {value}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          {book.tags.length > 0 ? (
            <section className="space-y-2">
              <p className="text-sm font-medium text-stone-800">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {book.tags.map((tag) => (
                  <Badge key={`${book.id}-${tag}`}>{tag}</Badge>
                ))}
              </div>
            </section>
          ) : null}

          {book.description ? (
            <section className="space-y-2 rounded-2xl border border-stone-300 bg-stone-100/80 p-4">
              <p className="text-sm font-medium text-stone-800">Description</p>
              <p className="text-sm leading-relaxed whitespace-pre-line text-stone-700">
                {book.description}
              </p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-300 bg-stone-100/75 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-1 text-sm text-stone-700">{value}</p>
    </div>
  )
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = sizeBytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

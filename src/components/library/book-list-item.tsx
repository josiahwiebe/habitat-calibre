import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Download } from 'lucide-react'
import type { LibraryBookListItem } from '~/lib/calibre/types'
import { Badge } from '~/components/ui/badge'
import { BookCover } from './book-cover'

export interface BookListItemProps {
  book: LibraryBookListItem
}

/**
 * Dense row layout for keyboard-friendly browsing.
 */
export function BookListItem({ book }: BookListItemProps) {
  const compactFormats = book.formats.slice(0, 2)
  const hiddenFormatCount = Math.max(0, book.formats.length - compactFormats.length)

  return (
    <article className="grid grid-cols-[54px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-stone-300 bg-stone-50/85 p-2.5 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.75)] md:grid-cols-[70px_minmax(0,1fr)_auto] md:gap-4 md:rounded-2xl md:p-3 md:items-center">
      <Link
        to="/books/$bookId"
        params={{ bookId: String(book.id) }}
        className="row-span-2 md:row-span-1"
      >
        <BookCover title={book.title} coverUrl={book.coverUrl} className="rounded-lg md:rounded-xl" />
      </Link>

      <div className="min-w-0 space-y-1.5 md:space-y-2">
        <Link
          to="/books/$bookId"
          params={{ bookId: String(book.id) }}
          className="line-clamp-2 text-sm font-medium text-stone-900 hover:text-teal-800 md:text-base"
        >
          {book.title}
        </Link>

        <p className="line-clamp-1 text-xs text-stone-600 md:text-sm">
          {book.authors.map((author, index) => (
            <span key={`${book.id}-${author.slug}`}>
              {index > 0 ? ', ' : ''}
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

        <div className="flex flex-wrap gap-1.5">
          {compactFormats.map((format) => (
            <Badge key={`${book.id}-${format}`} variant="subtle">
              {format}
            </Badge>
          ))}
          {hiddenFormatCount > 0 ? <Badge variant="subtle">+{hiddenFormatCount}</Badge> : null}
          {book.language ? <Badge variant="accent">{book.language.toUpperCase()}</Badge> : null}
        </div>
      </div>

      <div className="col-start-2 flex items-center gap-1 md:col-start-auto md:flex-col md:items-end md:gap-2">
        <a
          href={book.goodreadsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone-700 transition hover:bg-stone-200 hover:text-teal-800 md:text-sm"
        >
          Goodreads
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>

        <Link
          to="/books/$bookId"
          params={{ bookId: String(book.id) }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone-700 transition hover:bg-stone-200 hover:text-teal-800 md:text-sm"
        >
          Details
          <Download className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

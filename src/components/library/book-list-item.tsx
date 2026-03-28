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
  return (
    <article className="grid gap-4 rounded-2xl border border-stone-300 bg-stone-50/85 p-3 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.75)] md:grid-cols-[70px_1fr_auto] md:items-center">
      <Link to="/books/$bookId" params={{ bookId: String(book.id) }}>
        <BookCover title={book.title} coverUrl={book.coverUrl} className="rounded-xl" />
      </Link>

      <div className="space-y-2">
        <Link
          to="/books/$bookId"
          params={{ bookId: String(book.id) }}
          className="font-medium text-stone-900 hover:text-teal-800"
        >
          {book.title}
        </Link>

        <p className="text-sm text-stone-600">
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
          {book.formats.map((format) => (
            <Badge key={`${book.id}-${format}`} variant="subtle">
              {format}
            </Badge>
          ))}
          {book.language ? <Badge variant="accent">{book.language.toUpperCase()}</Badge> : null}
        </div>
      </div>

      <div className="flex items-center gap-2 md:flex-col md:items-end">
        <a
          href={book.goodreadsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-stone-700 transition hover:bg-stone-200 hover:text-teal-800"
        >
          Goodreads
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>

        <Link
          to="/books/$bookId"
          params={{ bookId: String(book.id) }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-stone-700 transition hover:bg-stone-200 hover:text-teal-800"
        >
          Details
          <Download className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

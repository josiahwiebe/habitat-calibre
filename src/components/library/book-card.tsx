import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Download } from 'lucide-react'
import type { LibraryBookListItem } from '~/lib/calibre/types'
import { Badge } from '~/components/ui/badge'
import { BookCover } from './book-cover'

export interface BookCardProps {
  book: LibraryBookListItem
}

/**
 * Grid-optimized card for browsing books quickly.
 */
export function BookCard({ book }: BookCardProps) {
  return (
    <article className="group rounded-3xl border border-stone-300/90 bg-stone-50/90 p-3 shadow-[0_30px_60px_-54px_rgba(35,35,35,0.85)] transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-[0_28px_60px_-46px_rgba(24,24,24,0.55)]">
      <Link
        to="/books/$bookId"
        params={{ bookId: String(book.id) }}
        className="block"
      >
        <BookCover title={book.title} coverUrl={book.coverUrl} />
      </Link>

      <div className="mt-3 space-y-2">
        <Link
          to="/books/$bookId"
          params={{ bookId: String(book.id) }}
          className="line-clamp-2 font-medium leading-snug text-stone-900 transition group-hover:text-stone-950"
        >
          {book.title}
        </Link>

        <p className="line-clamp-1 text-xs text-stone-600">
          {book.authors.slice(0, 2).map((author, index) => (
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

        <div className="flex flex-wrap gap-1.5">
          {book.formats.slice(0, 3).map((format) => (
            <Badge key={`${book.id}-${format}`} variant="subtle">
              {format}
            </Badge>
          ))}
          {book.formats.length > 3 ? <Badge variant="subtle">+{book.formats.length - 3}</Badge> : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-stone-200 pt-3 text-xs">
        <a
          href={book.goodreadsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-stone-700 transition hover:text-teal-800"
        >
          Goodreads
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>

        <Link
          to="/books/$bookId"
          params={{ bookId: String(book.id) }}
          className="inline-flex items-center gap-1 text-stone-700 transition hover:text-teal-800"
        >
          Open
          <Download className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

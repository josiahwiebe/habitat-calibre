import * as React from 'react'
import { BookOpenText } from 'lucide-react'
import { cn } from '~/lib/utils'

export interface BookCoverProps {
  title: string
  coverUrl: string
  className?: string
}

/**
 * Cover image block with graceful fallback state.
 */
export function BookCover({ title, coverUrl, className }: BookCoverProps) {
  const [failed, setFailed] = React.useState(false)

  return (
    <div
      className={cn(
        'relative aspect-[2/3] overflow-hidden rounded-2xl border border-stone-300 bg-linear-to-b from-stone-100 to-stone-200',
        className,
      )}
    >
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-stone-500">
          <BookOpenText className="size-6" aria-hidden="true" />
          <span className="px-4 text-center text-xs leading-snug">{title}</span>
        </div>
      ) : (
        <img
          src={coverUrl}
          alt={`Cover for ${title}`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

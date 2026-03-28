import * as React from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { BookPlus, LoaderCircle, Send } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

type RequestStatus = 'idle' | 'sending' | 'success' | 'error'

interface RequestBookResponse {
  ok?: boolean
  message?: string
  error?: string
}

export interface RequestBookDialogProps {
  prefillTitle?: string
  className?: string
}

/**
 * Modal form that queues or forwards requested book details.
 */
export function RequestBookDialog({
  prefillTitle,
  className,
}: RequestBookDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [author, setAuthor] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [honeypot, setHoneypot] = React.useState('')
  const [status, setStatus] = React.useState<RequestStatus>('idle')
  const [feedback, setFeedback] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    if (title.trim().length === 0 && prefillTitle && prefillTitle.trim().length > 0) {
      setTitle(prefillTitle.trim())
    }
  }, [isOpen, prefillTitle, title])

  const isSubmitting = status === 'sending'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedTitle = title.trim()

    if (normalizedTitle.length < 2) {
      setStatus('error')
      setFeedback('Please provide a book title.')
      return
    }

    setStatus('sending')
    setFeedback(null)

    try {
      const response = await fetch('/api/request-book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: normalizedTitle,
          author: author.trim() || undefined,
          notes: notes.trim() || undefined,
          honeypot,
        }),
      })

      const payload = (await response
        .json()
        .catch(() => ({}))) as RequestBookResponse

      if (!response.ok || payload.ok === false) {
        setStatus('error')
        setFeedback(
          payload.error || 'Could not send your request. Please try again.',
        )
        return
      }

      setStatus('success')
      setFeedback(payload.message || 'Request received.')
      setAuthor('')
      setNotes('')
      setHoneypot('')
    } catch {
      setStatus('error')
      setFeedback('Network error. Please retry in a moment.')
    }
  }

  const resetState = () => {
    setStatus('idle')
    setFeedback(null)
    setHoneypot('')
  }

  return (
    <>
      <Button
        className={className}
        variant="secondary"
        size="sm"
        onClick={() => {
          resetState()
          setIsOpen(true)
        }}
      >
        <BookPlus className="mr-1 size-3.5" aria-hidden="true" />
        Request a book
      </Button>

      <Dialog.Root
        open={isOpen}
        onOpenChange={(nextOpen) => {
          setIsOpen(nextOpen)

          if (!nextOpen) {
            resetState()
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-stone-900/45 backdrop-blur-[2px]" />
          <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
            <Dialog.Popup className="w-full max-w-xl rounded-2xl border border-stone-300 bg-stone-50 p-4 shadow-[0_44px_90px_-54px_rgba(15,23,42,0.9)] sm:p-5">
              <div className="space-y-1">
                <Dialog.Title className="font-serif text-3xl leading-tight text-stone-900">
                  Request a book
                </Dialog.Title>
                <Dialog.Description className="text-sm text-stone-600">
                  Submit a request into your acquisition stack (Shelfmark or
                  LazyLibrarian), then let it handle search and download.
                </Dialog.Description>
              </div>

              <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    Title
                  </span>
                  <Input
                    required
                    autoFocus
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value)
                      if (status !== 'idle') {
                        setStatus('idle')
                        setFeedback(null)
                      }
                    }}
                    placeholder="The Name of the Wind"
                    maxLength={180}
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    Author (optional)
                  </span>
                  <Input
                    value={author}
                    onChange={(event) => {
                      setAuthor(event.target.value)
                      if (status !== 'idle') {
                        setStatus('idle')
                        setFeedback(null)
                      }
                    }}
                    placeholder="Patrick Rothfuss"
                    maxLength={140}
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    Notes (optional)
                  </span>
                  <textarea
                    value={notes}
                    onChange={(event) => {
                      setNotes(event.target.value)
                      if (status !== 'idle') {
                        setStatus('idle')
                        setFeedback(null)
                      }
                    }}
                    placeholder="Any edition preference, why you want it, etc."
                    maxLength={1500}
                    className="min-h-24 w-full resize-y rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] placeholder:text-stone-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40"
                  />
                </label>

                <label className="sr-only" aria-hidden="true">
                  Company website
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(event) => setHoneypot(event.target.value)}
                    className="sr-only"
                  />
                </label>

                {feedback ? (
                  <p
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      status === 'success'
                        ? 'border-teal-700/25 bg-teal-700/8 text-teal-900'
                        : 'border-rose-700/25 bg-rose-700/10 text-rose-900',
                    )}
                  >
                    {feedback}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <LoaderCircle className="mr-1 size-4 animate-spin" aria-hidden="true" />
                        Sending
                      </>
                    ) : (
                      <>
                        <Send className="mr-1 size-4" aria-hidden="true" />
                        Queue request
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

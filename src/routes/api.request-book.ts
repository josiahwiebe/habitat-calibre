import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAuthenticatedRoute } from '~/lib/auth/guard'
import { deliverBookRequest } from '~/lib/requests/delivery'

const REQUEST_WINDOW_MS = 1000 * 60 * 60
const REQUEST_LIMIT_PER_WINDOW = 6

const requestQuotaByIp = new Map<string, { count: number; resetAt: number }>()

const requestBookSchema = z.object({
  title: z.string().trim().min(2).max(180),
  author: z.string().trim().max(140).optional(),
  notes: z.string().trim().max(1500).optional(),
  honeypot: z.string().max(0).optional(),
})

export const Route = createFileRoute('/api/request-book')({
  server: {
    middleware: [requireAuthenticatedRoute],
    handlers: {
      POST: async ({ request }) => {
        const payload = await parseRequestPayload(request)

        if (!payload.ok) {
          return payload.response
        }

        if (payload.data.honeypot && payload.data.honeypot.length > 0) {
          return Response.json({ ok: true, message: 'Request sent.' })
        }

        const requesterIp = getRequesterIp(request)

        if (!consumeRequestQuota(requesterIp)) {
          return Response.json(
            {
              ok: false,
              error:
                'Too many requests from your network. Try again later.',
            },
            { status: 429 },
          )
        }

        try {
          const origin = request.headers.get('origin')?.trim()
          const referer = request.headers.get('referer')?.trim()

          const delivery = await deliverBookRequest({
            title: payload.data.title,
            author: normalizeOptional(payload.data.author),
            notes: normalizeOptional(payload.data.notes),
            requesterIp,
            requestedAt: new Date().toISOString(),
            sourceUrl: origin || referer || undefined,
            userAgent:
              request.headers.get('user-agent')?.slice(0, 250) || undefined,
          })

          if (!delivery.ok) {
            return Response.json(
              {
                ok: false,
                error: delivery.error,
                status: delivery.status,
              },
              {
                status:
                  delivery.status === 'unconfigured'
                    ? 503
                    : delivery.status === 'no_match'
                      ? 404
                      : 502,
              },
            )
          }

          return Response.json({
            ok: true,
            status: delivery.status,
            message: delivery.message,
          })
        } catch (error) {
          console.error('Failed to deliver request', error)

          return Response.json(
            {
              ok: false,
              error:
                'Could not send your request right now. Please try again in a minute.',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})

async function parseRequestPayload(request: Request): Promise<
  | {
      ok: true
      data: z.infer<typeof requestBookSchema>
    }
  | {
      ok: false
      response: Response
    }
> {
  let rawBody: unknown

  try {
    rawBody = await request.json()
  } catch {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: 'Invalid JSON payload.' },
        { status: 400 },
      ),
    }
  }

  const parsed = requestBookSchema.safeParse(rawBody)

  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: 'Please provide at least a valid book title.',
        },
        { status: 400 },
      ),
    }
  }

  return {
    ok: true,
    data: parsed.data,
  }
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function getRequesterIp(request: Request) {
  const headers = request.headers
  const forwardedIp =
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')

  if (!forwardedIp) {
    return 'unknown'
  }

  return forwardedIp.split(',')[0]?.trim() || 'unknown'
}

function consumeRequestQuota(ip: string) {
  const now = Date.now()

  for (const [key, bucket] of requestQuotaByIp.entries()) {
    if (bucket.resetAt <= now) {
      requestQuotaByIp.delete(key)
    }
  }

  const bucket = requestQuotaByIp.get(ip)

  if (!bucket || bucket.resetAt <= now) {
    requestQuotaByIp.set(ip, {
      count: 1,
      resetAt: now + REQUEST_WINDOW_MS,
    })
    return true
  }

  if (bucket.count >= REQUEST_LIMIT_PER_WINDOW) {
    return false
  }

  bucket.count += 1
  return true
}

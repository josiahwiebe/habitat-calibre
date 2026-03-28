import { createMiddleware } from '@tanstack/react-start'
import { requireSessionUser } from './session'

/**
 * Middleware that rejects unauthenticated server-route requests.
 */
export const requireAuthenticatedRoute = createMiddleware().server(
  async ({ next }) => {
    await requireSessionUser()
    return next()
  },
)

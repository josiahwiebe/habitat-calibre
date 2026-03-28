import {
  type BookRequestMessage,
  isTelegramConfigured,
  sendBookRequestToTelegram,
} from '~/lib/telegram'
import {
  isLazyLibrarianConfigured,
  submitBookRequestToLazyLibrarian,
} from './lazylibrarian'

export type RequestDeliveryMode = 'telegram' | 'lazylibrarian' | 'both'

export type RequestDeliveryResult =
  | {
      ok: true
      status: 'queued' | 'forwarded'
      message: string
    }
  | {
      ok: false
      status: 'unconfigured' | 'no_match' | 'provider_error'
      error: string
    }

/**
 * Reads configured request delivery strategy.
 */
export function getRequestDeliveryMode(): RequestDeliveryMode {
  const configured = process.env.REQUEST_DELIVERY_MODE?.trim().toLowerCase()

  if (
    configured === 'telegram' ||
    configured === 'lazylibrarian' ||
    configured === 'both'
  ) {
    return configured
  }

  return 'lazylibrarian'
}

/**
 * Returns true when currently selected delivery mode has required config.
 */
export function isRequestDeliveryConfigured() {
  const mode = getRequestDeliveryMode()

  if (mode === 'telegram') {
    return isTelegramConfigured()
  }

  if (mode === 'lazylibrarian') {
    return isLazyLibrarianConfigured()
  }

  return isTelegramConfigured() || isLazyLibrarianConfigured()
}

/**
 * Delivers a request using configured providers with optional fallback behavior.
 */
export async function deliverBookRequest(
  payload: BookRequestMessage,
): Promise<RequestDeliveryResult> {
  const mode = getRequestDeliveryMode()

  if (mode === 'telegram') {
    return sendTelegramOnly(payload)
  }

  if (mode === 'lazylibrarian') {
    return sendLazyLibrarianOnly(payload)
  }

  return sendBoth(payload)
}

async function sendTelegramOnly(
  payload: BookRequestMessage,
): Promise<RequestDeliveryResult> {
  if (!isTelegramConfigured()) {
    return {
      ok: false,
      status: 'unconfigured',
      error:
        'Request delivery is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.',
    }
  }

  try {
    await sendBookRequestToTelegram(payload)

    return {
      ok: true,
      status: 'forwarded',
      message: 'Request forwarded to Telegram.',
    }
  } catch (error) {
    return {
      ok: false,
      status: 'provider_error',
      error:
        error instanceof Error
          ? error.message
          : 'Telegram request delivery failed.',
    }
  }
}

async function sendLazyLibrarianOnly(
  payload: BookRequestMessage,
): Promise<RequestDeliveryResult> {
  const llResult = await submitBookRequestToLazyLibrarian({
    title: payload.title,
    author: payload.author,
  })

  if (!llResult.ok) {
    return llResult
  }

  return {
    ok: true,
    status: 'queued',
    message: llResult.message,
  }
}

async function sendBoth(payload: BookRequestMessage): Promise<RequestDeliveryResult> {
  const hasLazyLibrarian = isLazyLibrarianConfigured()
  const hasTelegram = isTelegramConfigured()

  if (!hasLazyLibrarian && !hasTelegram) {
    return {
      ok: false,
      status: 'unconfigured',
      error:
        'Request delivery is not configured. Set LazyLibrarian or Telegram credentials.',
    }
  }

  if (hasLazyLibrarian) {
    const llResult = await submitBookRequestToLazyLibrarian({
      title: payload.title,
      author: payload.author,
    })

    if (llResult.ok) {
      if (hasTelegram) {
        await sendBookRequestToTelegram({
          ...payload,
          notes: appendNote(payload.notes, 'LazyLibrarian queued automatically.'),
        }).catch(() => undefined)
      }

      return {
        ok: true,
        status: 'queued',
        message: llResult.message,
      }
    }

    if (llResult.status !== 'no_match' && !hasTelegram) {
      return llResult
    }

    if (llResult.status === 'no_match' && !hasTelegram) {
      return llResult
    }

    if (hasTelegram) {
      try {
        await sendBookRequestToTelegram({
          ...payload,
          notes: appendNote(
            payload.notes,
            `LazyLibrarian did not auto-queue (${llResult.error}).`,
          ),
        })

        return {
          ok: true,
          status: 'forwarded',
          message:
            'No LazyLibrarian auto-match yet. Request was forwarded to Telegram for manual follow-up.',
        }
      } catch (telegramError) {
        return {
          ok: false,
          status: 'provider_error',
          error:
            telegramError instanceof Error
              ? telegramError.message
              : 'Fallback Telegram delivery failed.',
        }
      }
    }
  }

  if (hasTelegram) {
    return sendTelegramOnly(payload)
  }

  return {
    ok: false,
    status: 'provider_error',
    error: 'No request provider accepted this request.',
  }
}

function appendNote(existing: string | undefined, extra: string) {
  const trimmed = existing?.trim()

  if (!trimmed) {
    return extra
  }

  return `${trimmed}\n\n${extra}`
}

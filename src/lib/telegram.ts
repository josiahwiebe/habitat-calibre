interface TelegramConfig {
  botToken: string
  chatId: string
  threadId?: number
}

export interface BookRequestMessage {
  title: string
  author?: string
  notes?: string
  requestedAt: string
  requesterIp?: string
  userAgent?: string
  sourceUrl?: string
}

/**
 * Checks whether Telegram delivery is configured.
 */
export function isTelegramConfigured() {
  return getTelegramConfig() !== null
}

/**
 * Sends a formatted book request message through a Telegram bot.
 */
export async function sendBookRequestToTelegram(payload: BookRequestMessage) {
  const config = getTelegramConfig()

  if (!config) {
    throw new Error('Telegram bot configuration is missing')
  }

  const response = await fetch(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: createTelegramText(payload),
        disable_web_page_preview: true,
        ...(config.threadId ? { message_thread_id: config.threadId } : {}),
      }),
    },
  )

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(
      `Telegram API request failed (${response.status}). ${details}`.trim(),
    )
  }
}

function getTelegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()

  if (!botToken || !chatId) {
    return null
  }

  const threadIdRaw = process.env.TELEGRAM_THREAD_ID?.trim()
  const parsedThreadId = threadIdRaw ? Number(threadIdRaw) : undefined

  return {
    botToken,
    chatId,
    threadId:
      parsedThreadId && Number.isInteger(parsedThreadId) && parsedThreadId > 0
        ? parsedThreadId
        : undefined,
  }
}

function createTelegramText(payload: BookRequestMessage) {
  const lines = [
    'Book request from Habitat Calibre',
    `Title: ${payload.title}`,
    payload.author ? `Author: ${payload.author}` : undefined,
    payload.notes ? `Notes: ${payload.notes}` : undefined,
    payload.sourceUrl ? `Page: ${payload.sourceUrl}` : undefined,
    payload.requesterIp ? `IP: ${payload.requesterIp}` : undefined,
    payload.userAgent ? `UA: ${payload.userAgent}` : undefined,
    `Requested at: ${payload.requestedAt}`,
  ]

  return lines.filter(Boolean).join('\n')
}

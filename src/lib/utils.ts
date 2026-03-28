import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges utility class names while preserving Tailwind override order.
 */
export function cn(...values: Array<ClassValue>) {
  return twMerge(clsx(values))
}

/**
 * Creates URL-safe slugs for route segments and filter tokens.
 */
export function slugify(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  return normalized
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Normalizes runs of whitespace to a single space.
 */
export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Removes basic HTML tags for search indexing and summaries.
 */
export function stripHtml(value: string) {
  return normalizeWhitespace(value.replace(/<[^>]*>/g, ' '))
}

/**
 * Clamps a number within an inclusive min/max range.
 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Picks a concise excerpt from longer text content.
 */
export function createExcerpt(value: string, maxLength = 180) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`
}

/**
 * Sanitizes filenames used in Content-Disposition headers.
 */
export function sanitizeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

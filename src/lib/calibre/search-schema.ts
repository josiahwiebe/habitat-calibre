import { z } from 'zod'
import {
  LIBRARY_SORT_VALUES,
  LIBRARY_VIEW_VALUES,
  type LibrarySearchInput,
} from './types'

const rawSearchSchema = z.object({
  q: z.string().trim().max(180).optional(),
  author: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(200).optional(),
  series: z.string().trim().max(200).optional(),
  format: z.string().trim().max(40).optional(),
  language: z.string().trim().max(40).optional(),
  sort: z.enum(LIBRARY_SORT_VALUES).optional(),
  view: z.enum(LIBRARY_VIEW_VALUES).optional(),
  page: z.coerce.number().int().min(1).max(999).optional(),
  perPage: z.coerce.number().int().min(12).max(96).optional(),
})

/**
 * Parses and normalizes query params for all search entry points.
 */
export function parseLibrarySearch(raw: unknown): LibrarySearchInput {
  const parsed = rawSearchSchema.parse(raw)

  return {
    q: parsed.q || undefined,
    author: parsed.author || undefined,
    tag: parsed.tag || undefined,
    series: parsed.series || undefined,
    format: parsed.format ? parsed.format.toUpperCase() : undefined,
    language: parsed.language
      ? parsed.language.toLowerCase()
      : undefined,
    sort: parsed.sort ?? 'relevance',
    view: parsed.view,
    page: parsed.page ?? 1,
    perPage: parsed.perPage ?? 36,
  }
}

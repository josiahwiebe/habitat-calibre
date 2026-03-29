import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { getAppEnvironment } from '~/lib/env'
import {
  clamp,
  createExcerpt,
  normalizeWhitespace,
  slugify,
  stripHtml,
} from '~/lib/utils'
import type {
  LibraryBookDetail,
  LibraryBookListItem,
  LibraryFacetGroup,
  LibraryFacetOption,
  LibraryFacets,
  LibraryFileAsset,
  LibraryFormatLink,
  LibraryHealth,
  LibrarySearchInput,
  LibrarySearchResponse,
  LibrarySort,
} from './types'

const BOOK_DIRECTORY_ID_PATTERN = /\((\d+)\)\s*$/
const COVER_CANDIDATE_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp']

const EXTENSION_MIME_MAP: Record<string, string> = {
  azw: 'application/vnd.amazon.ebook',
  azw3: 'application/vnd.amazon.ebook',
  cb7: 'application/x-cb7',
  cbr: 'application/x-cbr',
  cbt: 'application/x-cbt',
  cbz: 'application/x-cbz',
  djvu: 'image/vnd.djvu',
  epub: 'application/epub+zip',
  fb2: 'application/x-fictionbook+xml',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  kfx: 'application/octet-stream',
  mobi: 'application/x-mobipocket-ebook',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain; charset=utf-8',
  webp: 'image/webp',
}

interface ManifestFacetRef {
  id: number
  name: string
  slug: string
}

interface ManifestFormatRecord {
  format: string
  fileName: string
  sizeBytes: number
  absolutePath: string
}

interface ManifestBookRecord {
  id: number
  slug: string
  title: string
  sortTitle: string
  authors: Array<ManifestFacetRef>
  series?: ManifestFacetRef & { index?: number }
  tags: Array<ManifestFacetRef>
  language?: string
  publisher?: string
  publishedAt?: string
  publishedYear?: number
  addedAt?: string
  descriptionText: string
  identifiers: Record<string, string>
  formats: Array<ManifestFormatRecord>
  hasCover: boolean
  coverAbsolutePath?: string
  searchText: string
}

interface LibraryManifest {
  generatedAt: string
  sourceMtimeMs: number
  metadataDbPath: string
  books: Array<ManifestBookRecord>
  booksById: Map<number, ManifestBookRecord>
  facets: LibraryFacets
}

interface ManifestCache {
  manifest: LibraryManifest
  loadedAt: number
  sourceMtimeMs: number
  metadataDbPath: string
}

interface CalibreBookRow {
  id: number
  title: string
  sort: string | null
  timestamp: string | null
  pubdate: string | null
  series_index: number | null
  path: string
  has_cover: number | null
}

interface CalibreAuthorRow {
  bookId: number
  authorId: number
  authorName: string
}

interface CalibreTagRow {
  bookId: number
  tagId: number
  tagName: string
}

interface CalibreSeriesRow {
  bookId: number
  seriesId: number
  seriesName: string
}

interface CalibreLanguageRow {
  bookId: number
  languageCode: string
}

interface CalibrePublisherRow {
  bookId: number
  publisherName: string
}

interface CalibreIdentifierRow {
  bookId: number
  type: string
  value: string
}

interface CalibreCommentRow {
  bookId: number
  text: string
}

interface CalibreFormatRow {
  bookId: number
  format: string
  sizeBytes: number
  baseName: string
}

let manifestCache: ManifestCache | null = null

/**
 * Returns an empty search payload when the library is unavailable.
 */
export function createUnavailableSearchResponse(
  input: LibrarySearchInput,
  runtimeError?: string,
): LibrarySearchResponse {
  return {
    books: [],
    facets: createEmptyFacets(),
    pagination: {
      page: input.page,
      perPage: input.perPage,
      pageCount: 1,
      total: 0,
    },
    stats: {
      totalBooks: 0,
      matchedBooks: 0,
    },
    applied: input,
    runtimeError,
  }
}

/**
 * Returns search results and facets for the current Calibre library snapshot.
 */
export function searchLibrary(input: LibrarySearchInput): LibrarySearchResponse {
  const manifest = getLibraryManifest()
  const query = normalizeWhitespace(input.q ?? '').toLowerCase()
  const queryTokens = query.length > 0 ? query.split(' ') : []

  const filtered = manifest.books.filter((book) => {
    if (input.author && !book.authors.some((author) => author.slug === input.author)) {
      return false
    }

    if (input.series && book.series?.slug !== input.series) {
      return false
    }

    if (input.tag && !book.tags.some((tag) => tag.slug === input.tag)) {
      return false
    }

    if (input.format && !book.formats.some((format) => format.format === input.format)) {
      return false
    }

    if (input.language && book.language?.toLowerCase() !== input.language) {
      return false
    }

    if (queryTokens.length === 0) {
      return true
    }

    return queryTokens.every((token) => book.searchText.includes(token))
  })

  const scores = new Map<number, number>()

  if (queryTokens.length > 0) {
    for (const book of filtered) {
      scores.set(book.id, scoreBookMatch(book, query, queryTokens))
    }
  }

  const sorted = sortBooks(filtered, input.sort, queryTokens.length > 0, scores)
  const pageCount = Math.max(1, Math.ceil(sorted.length / input.perPage))
  const page = clamp(input.page, 1, pageCount)
  const pageStart = (page - 1) * input.perPage
  const pageItems = sorted.slice(pageStart, pageStart + input.perPage)

  return {
    books: pageItems.map((book) => toBookListItem(book)),
    facets: {
      authors: limitFacetGroup(manifest.facets.authors, input.author, 90),
      tags: limitFacetGroup(manifest.facets.tags, input.tag, 120),
      series: limitFacetGroup(manifest.facets.series, input.series, 90),
      formats: manifest.facets.formats,
      languages: manifest.facets.languages,
    },
    pagination: {
      page,
      perPage: input.perPage,
      pageCount,
      total: sorted.length,
    },
    stats: {
      totalBooks: manifest.books.length,
      matchedBooks: sorted.length,
    },
    applied: {
      ...input,
      page,
    },
  }
}

/**
 * Resolves a single book by Calibre identifier.
 */
export function getLibraryBookDetail(bookId: number): LibraryBookDetail | null {
  const manifest = getLibraryManifest()
  const book = manifest.booksById.get(bookId)

  if (!book) {
    return null
  }

  const downloads: Array<LibraryFormatLink> = book.formats.map((format) => ({
    format: format.format,
    sizeBytes: format.sizeBytes,
    fileName: format.fileName,
    downloadUrl: `/download/${book.id}/${format.format.toLowerCase()}`,
  }))

  return {
    ...toBookListItem(book),
    description: book.descriptionText || undefined,
    addedAt: book.addedAt,
    publishedAt: book.publishedAt,
    identifiers: book.identifiers,
    downloads,
  }
}

/**
 * Returns a streaming asset descriptor for a cover image.
 */
export function getCoverAsset(bookId: number): LibraryFileAsset | null {
  const manifest = getLibraryManifest()
  const book = manifest.booksById.get(bookId)

  if (!book?.coverAbsolutePath) {
    return null
  }

  const stats = fs.statSync(book.coverAbsolutePath)
  const extension = path.extname(book.coverAbsolutePath).slice(1).toLowerCase()
  const fileName = `${book.slug || `book-${book.id}`}-cover.${extension || 'jpg'}`

  return {
    absolutePath: book.coverAbsolutePath,
    fileName,
    contentType: getContentTypeByExtension(extension),
    sizeBytes: stats.size,
  }
}

/**
 * Returns a streaming asset descriptor for an ebook download.
 */
export function getDownloadAsset(
  bookId: number,
  requestedFormat: string,
): LibraryFileAsset | null {
  const manifest = getLibraryManifest()
  const book = manifest.booksById.get(bookId)

  if (!book) {
    return null
  }

  const normalizedFormat = requestedFormat.toUpperCase()
  const format = book.formats.find((entry) => entry.format === normalizedFormat)

  if (!format) {
    return null
  }

  const extension = path.extname(format.fileName).slice(1).toLowerCase()

  return {
    absolutePath: format.absolutePath,
    fileName: format.fileName,
    contentType: getContentTypeByExtension(extension),
    sizeBytes: format.sizeBytes,
  }
}

/**
 * Forces the cache to rebuild on next read.
 */
export function rescanLibrary(): LibraryHealth {
  manifestCache = null
  return getLibraryHealth()
}

/**
 * Returns current readiness and metadata for runtime diagnostics.
 */
export function getLibraryHealth(): LibraryHealth {
  const { libraryPath } = getAppEnvironment()
  const metadataDbPath = path.join(libraryPath, 'metadata.db')

  try {
    const manifest = getLibraryManifest()

    return {
      ready: true,
      generatedAt: manifest.generatedAt,
      totalBooks: manifest.books.length,
      metadataMtimeMs: manifest.sourceMtimeMs,
      libraryPath,
      metadataDbPath,
    }
  } catch (error) {
    return {
      ready: false,
      libraryPath,
      metadataDbPath,
      error: error instanceof Error ? error.message : 'Unknown library error',
    }
  }
}

/**
 * Returns the current cached manifest or rebuilds it from metadata.db.
 */
function getLibraryManifest(force = false): LibraryManifest {
  const { cacheTtlMs, libraryPath } = getAppEnvironment()
  const metadataDbPath = path.join(libraryPath, 'metadata.db')

  ensureReadableFile(metadataDbPath)

  const metadataMtimeMs = fs.statSync(metadataDbPath).mtimeMs
  const now = Date.now()

  if (
    !force &&
    manifestCache &&
    manifestCache.metadataDbPath === metadataDbPath &&
    manifestCache.sourceMtimeMs === metadataMtimeMs &&
    now - manifestCache.loadedAt < cacheTtlMs
  ) {
    return manifestCache.manifest
  }

  const manifest = buildManifest(libraryPath, metadataDbPath, metadataMtimeMs)
  manifestCache = {
    manifest,
    loadedAt: now,
    sourceMtimeMs: metadataMtimeMs,
    metadataDbPath,
  }

  return manifest
}

/**
 * Builds a complete in-memory snapshot from Calibre metadata.
 */
function buildManifest(
  libraryPath: string,
  metadataDbPath: string,
  sourceMtimeMs: number,
): LibraryManifest {
  const directoryByBookId = buildBookDirectoryIndex(libraryPath)
  const db = new Database(metadataDbPath, {
    readonly: true,
    fileMustExist: true,
  })

  try {
    const books = db
      .prepare(
        `
          SELECT id, title, sort, timestamp, pubdate, series_index, path, has_cover
          FROM books
        `,
      )
      .all() as Array<CalibreBookRow>

    const authorRows = db
      .prepare(
        `
          SELECT bal.book AS bookId, a.id AS authorId, a.name AS authorName
          FROM books_authors_link bal
          JOIN authors a ON a.id = bal.author
          ORDER BY bal.id
        `,
      )
      .all() as Array<CalibreAuthorRow>

    const tagRows = db
      .prepare(
        `
          SELECT btl.book AS bookId, t.id AS tagId, t.name AS tagName
          FROM books_tags_link btl
          JOIN tags t ON t.id = btl.tag
          ORDER BY btl.id
        `,
      )
      .all() as Array<CalibreTagRow>

    const seriesRows = db
      .prepare(
        `
          SELECT bsl.book AS bookId, s.id AS seriesId, s.name AS seriesName
          FROM books_series_link bsl
          JOIN series s ON s.id = bsl.series
        `,
      )
      .all() as Array<CalibreSeriesRow>

    const languageRows = db
      .prepare(
        `
          SELECT bll.book AS bookId, l.lang_code AS languageCode
          FROM books_languages_link bll
          JOIN languages l ON l.id = bll.lang_code
          ORDER BY bll.item_order
        `,
      )
      .all() as Array<CalibreLanguageRow>

    const publisherRows = db
      .prepare(
        `
          SELECT bpl.book AS bookId, p.name AS publisherName
          FROM books_publishers_link bpl
          JOIN publishers p ON p.id = bpl.publisher
        `,
      )
      .all() as Array<CalibrePublisherRow>

    const identifierRows = db
      .prepare(
        `
          SELECT book AS bookId, type, val AS value
          FROM identifiers
        `,
      )
      .all() as Array<CalibreIdentifierRow>

    const commentRows = db
      .prepare(
        `
          SELECT book AS bookId, text
          FROM comments
        `,
      )
      .all() as Array<CalibreCommentRow>

    const formatRows = db
      .prepare(
        `
          SELECT book AS bookId, format, uncompressed_size AS sizeBytes, name AS baseName
          FROM data
        `,
      )
      .all() as Array<CalibreFormatRow>

    const authorsByBook = groupByBook(authorRows, (row) => ({
      id: row.authorId,
      name: normalizeWhitespace(row.authorName),
      slug: createFacetSlug(row.authorName, row.authorId),
    }))

    const tagsByBook = groupByBook(tagRows, (row) => ({
      id: row.tagId,
      name: normalizeWhitespace(row.tagName),
      slug: createFacetSlug(row.tagName, row.tagId),
    }))

    const seriesByBook = new Map<number, ManifestFacetRef>()

    for (const row of seriesRows) {
      seriesByBook.set(row.bookId, {
        id: row.seriesId,
        name: normalizeWhitespace(row.seriesName),
        slug: createFacetSlug(row.seriesName, row.seriesId),
      })
    }

    const languageByBook = new Map<number, string>()

    for (const row of languageRows) {
      if (!languageByBook.has(row.bookId)) {
        languageByBook.set(row.bookId, row.languageCode.toLowerCase())
      }
    }

    const publisherByBook = new Map<number, string>()

    for (const row of publisherRows) {
      if (!publisherByBook.has(row.bookId)) {
        publisherByBook.set(row.bookId, normalizeWhitespace(row.publisherName))
      }
    }

    const identifiersByBook = groupByBook(identifierRows, (row) => ({
      type: normalizeWhitespace(row.type.toLowerCase()),
      value: normalizeWhitespace(row.value),
    }))

    const commentsByBook = new Map<number, string>()

    for (const row of commentRows) {
      commentsByBook.set(row.bookId, row.text)
    }

    const formatsByBook = groupByBook(formatRows, (row) => ({
      format: row.format.toUpperCase(),
      sizeBytes: Number(row.sizeBytes) || 0,
      baseName: row.baseName,
    }))

    const manifestBooks: Array<ManifestBookRecord> = books.map((book) => {
      const title = normalizeWhitespace(book.title)
      const sortTitle = normalizeWhitespace(book.sort || title)
      const authors = authorsByBook.get(book.id) ?? []
      const tags = tagsByBook.get(book.id) ?? []
      const series = seriesByBook.get(book.id)
      const language = languageByBook.get(book.id)
      const publisher = publisherByBook.get(book.id)
      const description = commentsByBook.get(book.id)
      const descriptionText = description ? stripHtml(description) : ''

      const identifierRowsForBook = identifiersByBook.get(book.id) ?? []
      const identifiers = identifierRowsForBook.reduce<Record<string, string>>(
        (accumulator, entry) => {
          if (entry.type.length > 0 && entry.value.length > 0) {
            accumulator[entry.type] = entry.value
          }

          return accumulator
        },
        {},
      )

      const absoluteDirectory = resolveBookDirectory(
        libraryPath,
        book.path,
        book.id,
        directoryByBookId,
      )

      const coverAbsolutePath =
        Number(book.has_cover) === 1 && absoluteDirectory
          ? resolveCoverPath(absoluteDirectory)
          : undefined

      const formats = resolveBookFormats(
        absoluteDirectory,
        formatsByBook.get(book.id) ?? [],
      )

      const searchText = normalizeWhitespace(
        [
          title,
          sortTitle,
          ...authors.map((author) => author.name),
          series?.name,
          ...tags.map((tag) => tag.name),
          publisher,
          language,
          descriptionText,
          ...Object.values(identifiers),
          ...formats.map((format) => format.format),
        ]
          .filter(Boolean)
          .join(' '),
      ).toLowerCase()

      const publishedAt = normalizeDate(book.pubdate)
      const addedAt = normalizeDate(book.timestamp)

      return {
        id: book.id,
        slug: createBookSlug(title, book.id),
        title,
        sortTitle,
        authors,
        series: series
          ? {
              ...series,
              index: normalizeSeriesIndex(book.series_index),
            }
          : undefined,
        tags,
        language,
        publisher,
        publishedAt,
        publishedYear: extractYear(publishedAt),
        addedAt,
        descriptionText,
        identifiers,
        formats,
        hasCover: Boolean(coverAbsolutePath),
        coverAbsolutePath,
        searchText,
      }
    })

    const booksById = new Map<number, ManifestBookRecord>()

    for (const book of manifestBooks) {
      booksById.set(book.id, book)
    }

    return {
      generatedAt: new Date().toISOString(),
      sourceMtimeMs,
      metadataDbPath,
      books: manifestBooks,
      booksById,
      facets: buildFacets(manifestBooks),
    }
  } finally {
    db.close()
  }
}

function buildBookDirectoryIndex(libraryPath: string) {
  const directoryByBookId = new Map<number, string>()

  for (const authorEntry of safeReadDirectory(libraryPath)) {
    if (!authorEntry.isDirectory() || authorEntry.name.startsWith('.')) {
      continue
    }

    const authorPath = path.join(libraryPath, authorEntry.name)

    for (const titleEntry of safeReadDirectory(authorPath)) {
      if (!titleEntry.isDirectory()) {
        continue
      }

      const match = titleEntry.name.match(BOOK_DIRECTORY_ID_PATTERN)

      if (!match) {
        continue
      }

      const bookId = Number(match[1])

      if (!Number.isInteger(bookId)) {
        continue
      }

      directoryByBookId.set(bookId, path.join(authorPath, titleEntry.name))
    }
  }

  return directoryByBookId
}

function resolveBookDirectory(
  libraryPath: string,
  storedRelativePath: string,
  bookId: number,
  directoryByBookId: Map<number, string>,
) {
  const normalizedRelativePath = storedRelativePath.replace(/\\/g, path.sep)
  const directPath = path.resolve(libraryPath, normalizedRelativePath)

  if (isDirectory(directPath)) {
    return directPath
  }

  return directoryByBookId.get(bookId)
}

function resolveCoverPath(bookDirectory: string) {
  for (const candidate of COVER_CANDIDATE_NAMES) {
    const candidatePath = path.join(bookDirectory, candidate)

    if (isFile(candidatePath)) {
      return candidatePath
    }
  }

  for (const entry of safeReadDirectory(bookDirectory)) {
    if (!entry.isFile()) {
      continue
    }

    const fileName = entry.name.toLowerCase()

    if (fileName.startsWith('cover.') && getContentTypeByExtension(path.extname(fileName).slice(1)).startsWith('image/')) {
      return path.join(bookDirectory, entry.name)
    }
  }

  return undefined
}

function resolveBookFormats(
  bookDirectory: string | undefined,
  rows: Array<{ format: string; sizeBytes: number; baseName: string }>,
): Array<ManifestFormatRecord> {
  if (!bookDirectory || !isDirectory(bookDirectory)) {
    return []
  }

  const directoryEntries = safeReadDirectory(bookDirectory)

  return rows
    .map((row) => {
      const absolutePath = resolveFormatPath(
        bookDirectory,
        row.baseName,
        row.format,
        directoryEntries,
      )

      if (!absolutePath) {
        return null
      }

      const stats = fs.statSync(absolutePath)

      return {
        format: row.format,
        fileName: path.basename(absolutePath),
        sizeBytes: row.sizeBytes > 0 ? row.sizeBytes : stats.size,
        absolutePath,
      }
    })
    .filter((entry): entry is ManifestFormatRecord => entry !== null)
}

function resolveFormatPath(
  bookDirectory: string,
  baseName: string,
  format: string,
  directoryEntries: Array<fs.Dirent>,
) {
  const normalizedFormat = format.toLowerCase()
  const candidateNames = [
    `${baseName}.${normalizedFormat}`,
    `${baseName}.${format}`,
    `${baseName}.${format.toUpperCase()}`,
  ]

  if (normalizedFormat === 'kepub') {
    candidateNames.push(`${baseName}.kepub.epub`)
  }

  for (const candidateName of candidateNames) {
    const candidatePath = path.join(bookDirectory, candidateName)

    if (isFile(candidatePath)) {
      return candidatePath
    }
  }

  const normalizedBaseName = baseName.toLowerCase()

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue
    }

    const fileName = entry.name.toLowerCase()

    if (!fileName.startsWith(`${normalizedBaseName}.`)) {
      continue
    }

    if (normalizedFormat === 'kepub' && fileName.endsWith('.kepub.epub')) {
      return path.join(bookDirectory, entry.name)
    }

    const extension = path.extname(fileName).slice(1)

    if (extension === normalizedFormat) {
      return path.join(bookDirectory, entry.name)
    }
  }

  return undefined
}

function buildFacets(books: Array<ManifestBookRecord>): LibraryFacets {
  const authorCounts = new Map<string, LibraryFacetOption>()
  const tagCounts = new Map<string, LibraryFacetOption>()
  const seriesCounts = new Map<string, LibraryFacetOption>()
  const formatCounts = new Map<string, LibraryFacetOption>()
  const languageCounts = new Map<string, LibraryFacetOption>()

  for (const book of books) {
    for (const author of book.authors) {
      incrementFacet(authorCounts, author.slug, author.name)
    }

    for (const tag of book.tags) {
      incrementFacet(tagCounts, tag.slug, tag.name)
    }

    if (book.series) {
      incrementFacet(seriesCounts, book.series.slug, book.series.name)
    }

    for (const format of new Set(book.formats.map((entry) => entry.format))) {
      incrementFacet(formatCounts, format, format)
    }

    if (book.language) {
      incrementFacet(languageCounts, book.language, book.language.toUpperCase())
    }
  }

  return {
    authors: {
      label: 'Author',
      options: sortFacetOptions(authorCounts),
    },
    tags: {
      label: 'Tag',
      options: sortFacetOptions(tagCounts),
    },
    series: {
      label: 'Series',
      options: sortFacetOptions(seriesCounts),
    },
    formats: {
      label: 'Format',
      options: sortFacetOptions(formatCounts),
    },
    languages: {
      label: 'Language',
      options: sortFacetOptions(languageCounts),
    },
  }
}

function incrementFacet(
  map: Map<string, LibraryFacetOption>,
  slug: string,
  name: string,
) {
  const current = map.get(slug)

  if (current) {
    current.count += 1
    return
  }

  map.set(slug, {
    slug,
    name,
    count: 1,
  })
}

function sortFacetOptions(source: Map<string, LibraryFacetOption>) {
  return [...source.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count
    }

    return left.name.localeCompare(right.name)
  })
}

function limitFacetGroup(
  group: LibraryFacetGroup,
  selectedSlug: string | undefined,
  limit: number,
): LibraryFacetGroup {
  const selected = selectedSlug
    ? group.options.find((option) => option.slug === selectedSlug)
    : undefined

  const reduced = group.options.slice(0, limit)

  if (
    selected &&
    !reduced.some((option) => option.slug === selected.slug)
  ) {
    reduced.push(selected)
  }

  return {
    label: group.label,
    options: reduced,
  }
}

function sortBooks(
  books: Array<ManifestBookRecord>,
  sort: LibrarySort,
  hasQuery: boolean,
  scores: Map<number, number>,
) {
  const sorted = [...books]

  switch (sort) {
    case 'added-asc':
      sorted.sort((left, right) =>
        byAddedTime(left) - byAddedTime(right),
      )
      return sorted
    case 'added-desc':
      sorted.sort((left, right) =>
        byAddedTime(right) - byAddedTime(left),
      )
      return sorted
    case 'title-asc':
      sorted.sort((left, right) => left.sortTitle.localeCompare(right.sortTitle))
      return sorted
    case 'title-desc':
      sorted.sort((left, right) => right.sortTitle.localeCompare(left.sortTitle))
      return sorted
    case 'oldest':
      sorted.sort((left, right) => asTime(left.publishedAt) - asTime(right.publishedAt))
      return sorted
    case 'newest':
      sorted.sort((left, right) => asTime(right.publishedAt) - asTime(left.publishedAt))
      return sorted
    case 'relevance':
      if (!hasQuery) {
        sorted.sort((left, right) => byAddedTime(right) - byAddedTime(left))
        return sorted
      }

      sorted.sort((left, right) => {
        const scoreDelta = (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0)

        if (scoreDelta !== 0) {
          return scoreDelta
        }

        return left.sortTitle.localeCompare(right.sortTitle)
      })

      return sorted
  }
}

function byAddedTime(book: ManifestBookRecord) {
  const added = asTime(book.addedAt)

  if (added > 0) {
    return added
  }

  return asTime(book.publishedAt)
}

function scoreBookMatch(
  book: ManifestBookRecord,
  query: string,
  queryTokens: Array<string>,
) {
  const title = book.title.toLowerCase()
  const authorNames = book.authors.map((author) => author.name.toLowerCase())
  const publisher = book.publisher?.toLowerCase() || ''
  const seriesName = book.series?.name.toLowerCase() || ''
  let score = 0

  if (title === query) {
    score += 380
  } else if (title.startsWith(query)) {
    score += 260
  } else if (title.includes(query)) {
    score += 180
  }

  if (authorNames.some((author) => author === query)) {
    score += 220
  } else if (authorNames.some((author) => author.startsWith(query))) {
    score += 160
  } else if (authorNames.some((author) => author.includes(query))) {
    score += 120
  }

  if (seriesName.startsWith(query)) {
    score += 110
  }

  if (publisher.startsWith(query)) {
    score += 80
  }

  if (book.descriptionText.toLowerCase().includes(query)) {
    score += 50
  }

  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 24
    }

    if (authorNames.some((author) => author.includes(token))) {
      score += 20
    }

    if (book.tags.some((tag) => tag.name.toLowerCase().includes(token))) {
      score += 12
    }

    if (seriesName.includes(token)) {
      score += 10
    }

    if (publisher.includes(token)) {
      score += 8
    }
  }

  return score
}

function toBookListItem(book: ManifestBookRecord): LibraryBookListItem {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    sortTitle: book.sortTitle,
    authors: book.authors,
    series: book.series,
    tags: book.tags.map((tag) => tag.name),
    language: book.language,
    publisher: book.publisher,
    publishedYear: book.publishedYear,
    coverUrl: `/covers/${book.id}`,
    coverDownloadUrl: `/covers/${book.id}?download=1`,
    formats: book.formats.map((format) => format.format),
    goodreadsUrl: createGoodreadsUrl(book),
    descriptionExcerpt:
      book.descriptionText.length > 0
        ? createExcerpt(book.descriptionText)
        : undefined,
  }
}

function createBookSlug(title: string, bookId: number) {
  const titleSlug = slugify(title)
  return titleSlug.length > 0 ? `${titleSlug}--${bookId}` : `book-${bookId}`
}

function createFacetSlug(name: string, id: number) {
  const slug = slugify(name)
  return slug.length > 0 ? `${slug}--${id}` : `item-${id}`
}

function createGoodreadsUrl(book: ManifestBookRecord) {
  const goodreadsId =
    book.identifiers.goodreads ||
    book.identifiers['goodreads-id'] ||
    book.identifiers['goodreads_id']

  if (goodreadsId) {
    return `https://www.goodreads.com/book/show/${encodeURIComponent(goodreadsId)}`
  }

  const isbn =
    book.identifiers.isbn ||
    book.identifiers['isbn-13'] ||
    book.identifiers['isbn-10']

  if (isbn) {
    return `https://www.goodreads.com/search?q=${encodeURIComponent(isbn)}`
  }

  const author = book.authors[0]?.name ?? ''
  const fallback = `${book.title} ${author}`.trim()
  return `https://www.goodreads.com/search?q=${encodeURIComponent(fallback)}`
}

function normalizeDate(value: string | null) {
  if (!value || value.startsWith('0101-01-01')) {
    return undefined
  }

  return value
}

function normalizeSeriesIndex(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return undefined
  }

  return Number(value)
}

function extractYear(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const year = Number(value.slice(0, 4))
  return Number.isInteger(year) ? year : undefined
}

function asTime(value: string | undefined) {
  if (!value) {
    return 0
  }

  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

function groupByBook<TRow, TValue extends object>(
  rows: Array<TRow>,
  mapRow: (row: TRow) => TValue,
) {
  const grouped = new Map<number, Array<TValue>>()

  for (const row of rows as Array<TRow & { bookId: number }>) {
    if (!grouped.has(row.bookId)) {
      grouped.set(row.bookId, [])
    }

    grouped.get(row.bookId)?.push(mapRow(row))
  }

  return grouped
}

function safeReadDirectory(directoryPath: string) {
  try {
    return fs.readdirSync(directoryPath, { withFileTypes: true })
  } catch {
    return []
  }
}

function ensureReadableFile(filePath: string) {
  let stats: fs.Stats

  try {
    stats = fs.statSync(filePath)
  } catch {
    throw new Error(`Unable to read Calibre metadata database at ${filePath}`)
  }

  if (!stats.isFile()) {
    throw new Error(`Expected file but received directory: ${filePath}`)
  }
}

function isDirectory(directoryPath: string) {
  try {
    return fs.statSync(directoryPath).isDirectory()
  } catch {
    return false
  }
}

function isFile(filePath: string) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function getContentTypeByExtension(extension: string) {
  return EXTENSION_MIME_MAP[extension.toLowerCase()] || 'application/octet-stream'
}

function createEmptyFacets(): LibraryFacets {
  return {
    authors: { label: 'Author', options: [] },
    tags: { label: 'Tag', options: [] },
    series: { label: 'Series', options: [] },
    formats: { label: 'Format', options: [] },
    languages: { label: 'Language', options: [] },
  }
}

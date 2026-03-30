export const LIBRARY_SORT_VALUES = [
  'added-desc',
  'added-asc',
  'relevance',
  'newest',
  'oldest',
  'title-asc',
  'title-desc',
] as const

export type LibrarySort = (typeof LIBRARY_SORT_VALUES)[number]

export const LIBRARY_VIEW_VALUES = ['grid', 'list'] as const

export type LibraryView = (typeof LIBRARY_VIEW_VALUES)[number]

export interface LibraryFacetOption {
  slug: string
  name: string
  count: number
}

export interface LibraryFacetGroup {
  label: string
  options: Array<LibraryFacetOption>
}

export interface LibraryFacets {
  authors: LibraryFacetGroup
  tags: LibraryFacetGroup
  series: LibraryFacetGroup
  formats: LibraryFacetGroup
  languages: LibraryFacetGroup
}

export interface LibraryPersonLink {
  id: number
  name: string
  slug: string
}

export interface LibrarySeriesLink {
  id: number
  name: string
  slug: string
  index?: number
}

export interface LibraryFormatLink {
  format: string
  sizeBytes: number
  downloadUrl: string
  fileName: string
}

export interface LibraryBookListItem {
  id: number
  slug: string
  title: string
  sortTitle: string
  authors: Array<LibraryPersonLink>
  series?: LibrarySeriesLink
  tags: Array<string>
  language?: string
  publisher?: string
  publishedYear?: number
  coverUrl: string
  coverDownloadUrl: string
  formats: Array<string>
  goodreadsUrl: string
  descriptionExcerpt?: string
}

export interface LibraryBookDetail extends LibraryBookListItem {
  description?: string
  addedAt?: string
  publishedAt?: string
  identifiers: Record<string, string>
  downloads: Array<LibraryFormatLink>
}

export interface LibraryPagination {
  page: number
  perPage: number
  pageCount: number
  total: number
}

export interface LibrarySearchInput {
  q?: string
  author?: string
  tag?: string
  series?: string
  format?: string
  language?: string
  sort: LibrarySort
  view?: LibraryView
  page: number
  perPage: number
}

export interface LibrarySearchResponse {
  books: Array<LibraryBookListItem>
  facets: LibraryFacets
  pagination: LibraryPagination
  stats: {
    totalBooks: number
    matchedBooks: number
  }
  applied: LibrarySearchInput
  lastSyncedAt?: string
  runtimeError?: string
}

export interface LibraryHealth {
  ready: boolean
  generatedAt?: string
  lastSyncedAt?: string
  totalBooks?: number
  metadataMtimeMs?: number
  libraryPath: string
  metadataDbPath: string
  error?: string
}

export interface LibraryFileAsset {
  absolutePath: string
  fileName: string
  contentType: string
  sizeBytes: number
}

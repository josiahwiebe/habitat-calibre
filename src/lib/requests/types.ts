/**
 * A concrete release selected by the user during request submission.
 */
export interface RequestReleaseSelection {
  source: string
  sourceId: string
  title?: string
  author?: string
  format?: string
  size?: string
  indexer?: string
  protocol?: string
  seeders?: number
  downloadUrl?: string
}

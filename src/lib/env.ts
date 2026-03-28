import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_LIBRARY_PATH = '/library'
const DEFAULT_CACHE_TTL_SECONDS = 45

export interface AppEnvironment {
  appName: string
  libraryPath: string
  cacheTtlMs: number
}

let cachedEnvironment: AppEnvironment | null = null

/**
 * Reads process environment once and memoizes the result.
 */
export function getAppEnvironment(): AppEnvironment {
  if (cachedEnvironment) {
    return cachedEnvironment
  }

  const rawCacheTtl = Number(process.env.CALIBRE_CACHE_TTL_SECONDS)
  const cacheSeconds = Number.isFinite(rawCacheTtl)
    ? Math.max(10, rawCacheTtl)
    : DEFAULT_CACHE_TTL_SECONDS

  const explicitLibraryPath = process.env.CALIBRE_LIBRARY_PATH?.trim()
  const libraryPath =
    explicitLibraryPath && explicitLibraryPath.length > 0
      ? explicitLibraryPath
      : detectLibraryPath()

  cachedEnvironment = {
    appName: process.env.APP_NAME?.trim() || 'Habitat Calibre',
    libraryPath,
    cacheTtlMs: cacheSeconds * 1000,
  }

  return cachedEnvironment
}

/**
 * Attempts to auto-detect a local Calibre path for dev convenience.
 */
function detectLibraryPath() {
  const homeDirectory = os.homedir()
  const candidates = [
    path.join(homeDirectory, 'Dropbox', 'Library', 'eBooks', 'Calibre'),
    path.join(
      homeDirectory,
      'Library',
      'CloudStorage',
      'Dropbox',
      'Library',
      'eBooks',
      'Calibre',
    ),
    DEFAULT_LIBRARY_PATH,
  ]

  for (const candidate of candidates) {
    if (isMetadataDatabasePresent(candidate)) {
      return candidate
    }
  }

  return DEFAULT_LIBRARY_PATH
}

function isMetadataDatabasePresent(libraryPath: string) {
  try {
    const metadataPath = path.join(libraryPath, 'metadata.db')
    return fs.statSync(metadataPath).isFile()
  } catch {
    return false
  }
}

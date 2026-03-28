# Habitat Calibre

Modern, private Calibre frontend built with TanStack Start + React.

It reads your existing Calibre `metadata.db` in read-only mode, serves covers and ebook files, provides metadata search, and adds Goodreads deeplinks.

## What this ships

- Fast metadata search (title, author, tags, series, identifiers, publisher, language)
- Cover-first browse with grid/list views
- Book detail pages with direct format downloads
- Cover download endpoint
- Goodreads deeplinks (direct book page when available, search fallback)
- Docker-first deploy for home server + Cloudflare Tunnel

## Stack

- TanStack Start (React)
- Tailwind CSS
- Base UI primitives (custom styled)
- Selective shadcn-style open-code components (button/input/badge patterns)
- `better-sqlite3` for read-only access to Calibre metadata

## Environment

Copy `.env.example` to `.env` if running without Docker.

```bash
APP_NAME=Habitat Calibre
CALIBRE_LIBRARY_PATH=/library
CALIBRE_CACHE_TTL_SECONDS=45
PORT=3000
```

## Local Development

### npm

```bash
npm install
npm run dev
```

### bun

```bash
bun install
bun run dev
```

Set `CALIBRE_LIBRARY_PATH` to your real local Calibre root for development:

```bash
CALIBRE_LIBRARY_PATH="$HOME/Dropbox/Library/eBooks/Calibre" npm run dev
```

or with bun:

```bash
CALIBRE_LIBRARY_PATH="$HOME/Dropbox/Library/eBooks/Calibre" bun run dev
```

The app also auto-detects common Dropbox paths (`$HOME/Dropbox/...` and `$HOME/Library/CloudStorage/Dropbox/...`) if `CALIBRE_LIBRARY_PATH` is not set.

## Build

```bash
npm run build
```

## Docker

### 1) Set host library path

Set `CALIBRE_HOST_PATH` in `.env` (or shell) to your real macOS Calibre path.

Example:

```bash
CALIBRE_HOST_PATH=/Users/YOUR_USER/Dropbox/Library/eBooks/Calibre
```

### 2) Build and run

```bash
docker compose up -d --build
```

Docker uses `node:lts-bookworm-slim`.

### 3) Verify

```bash
curl http://localhost:3000/api/health
```

## Cloudflare Tunnel

Expose the app through tunnel to `http://localhost:3000`.

Recommended hardening:

- Require Cloudflare Access (identity gate)
- Keep Calibre volume mounted read-only
- Do not expose this directly on the public internet without an auth layer

## Routes

- `/` library browse/search
- `/books/$bookId` detail page
- `/covers/$bookId` cover image (`?download=1` for attachment)
- `/download/$bookId/$format` ebook download
- `/api/search` JSON search endpoint
- `/api/health` runtime health
- `/api/rescan` force metadata rescan

## Notes

- Calibre remains the source of truth.
- This app does not edit metadata.
- Path resolution falls back to folder-id matching when `books.path` casing/punctuation does not match Linux filesystems exactly.

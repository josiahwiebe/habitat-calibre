# Habitat Calibre

Modern, private Calibre frontend built with TanStack Start + React.

It reads your existing Calibre `metadata.db` in read-only mode, serves covers and ebook files, provides metadata search, and adds Goodreads deeplinks.

## What this ships

- Fast metadata search (title, author, tags, series, identifiers, publisher, language)
- Cover-first browse with grid/list views
- Book detail pages with direct format downloads
- Cover download endpoint
- Goodreads deeplinks (direct book page when available, search fallback)
- Plex OAuth sign-in with session cookies
- Request-a-book dialog with Shelfmark/LazyLibrarian delivery modes
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
SESSION_SECRET=
AUTH_PLEX_MODE=allowlist_or_shared
PLEX_ALLOWED_EMAILS=
PLEX_SERVER_MACHINE_ID=
REQUEST_DELIVERY_MODE=shelfmark
SHELFMARK_BASE_URL=
SHELFMARK_USERNAME=
SHELFMARK_PASSWORD=
SHELFMARK_HTTP_TIMEOUT_MS=12000
LAZYLIBRARIAN_BASE_URL=
LAZYLIBRARIAN_API_KEY=
LAZYLIBRARIAN_MATCH_THRESHOLD=84
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_THREAD_ID=
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

For request automation, choose one delivery provider with
`REQUEST_DELIVERY_MODE`:

- `shelfmark` (recommended for request-centric workflows)
- `lazylibrarian`
- `telegram`
- `both` (LazyLibrarian plus Telegram fallback)

## Shelfmark (request queue mode)

Shelfmark can act like your request/download control-plane while Calibre remains
the library manager.

Required in Shelfmark:

1. Enable an auth mode that creates DB-backed users (`builtin`, `oidc`, or
   `cwa`).
   - Request endpoints are disabled in Shelfmark no-auth mode.
2. Enable requests in `Settings -> Users & Requests`.
3. Set default ebook mode to `Request Book` (or `Request Release`).
4. Create a dedicated service-account user for Habitat Calibre.

App env for Shelfmark delivery:

```bash
REQUEST_DELIVERY_MODE=shelfmark
SHELFMARK_BASE_URL=http://shelfmark:8084
SHELFMARK_USERNAME=habitat-bot
SHELFMARK_PASSWORD=your-password
```

If Shelfmark and Habitat Calibre run in separate compose projects, attach both
services to a shared Docker network so the hostname resolves across stacks.

## LazyLibrarian (separate Docker app)

Run LazyLibrarian as a separate service on Habitat and point Habitat Calibre at
its base URL.

1. Create host folders:
   - `/srv/lazylibrarian/config`
   - `/srv/lazylibrarian/downloads`
   - your Dropbox Calibre library on Habitat (example:
     `/srv/dropbox/Library/eBooks/Calibre`)
2. Use a dedicated compose stack:

```yaml
services:
  lazylibrarian:
    image: lscr.io/linuxserver/lazylibrarian:latest
    container_name: lazylibrarian
    restart: unless-stopped
    ports:
      - "5299:5299"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/Edmonton
      - DOCKER_MODS=linuxserver/mods:universal-calibre
    volumes:
      - /srv/lazylibrarian/config:/config
      - /srv/lazylibrarian/downloads:/downloads
      - /srv/dropbox/Library/eBooks/Calibre:/books
```

3. In LazyLibrarian UI (`http://<habitat-ip>:5299/home`):
   - enable API and generate API key
   - set `Processing -> Base Destination Folder` to `/books`
   - set `Processing -> Calibredb import program` to `/usr/bin/calibredb`
   - set downloader directory to `/downloads`
   - configure providers and downloader clients
   - if LL does not detect your library, verify the mount first:

```bash
docker exec lazylibrarian ls -lah /books
docker exec lazylibrarian test -f /books/metadata.db && echo "metadata.db found"
```

   - if `metadata.db` is missing, the host path mounted to `/books` is wrong
   - if permission errors appear, set `PUID`/`PGID` to the Dropbox owner on Habitat and restart LL
   - after fixing mounts, trigger `Manage -> Library Scan` in LL to index existing books
4. Set app env:
   - `REQUEST_DELIVERY_MODE=lazylibrarian` (or `both` for Telegram fallback)
   - `LAZYLIBRARIAN_BASE_URL=http://lazylibrarian:5299` (or reachable host URL)
   - `LAZYLIBRARIAN_API_KEY=<your-ll-api-key>`

If Habitat Calibre and LazyLibrarian run in separate compose projects, attach
both services to a shared Docker network so `lazylibrarian` resolves by name.

## Build

```bash
npm run build
```

## Docker

### 1) Set host library path

Create a local `.env` first so Docker can load all app settings directly:

```bash
cp .env.example .env
```

Set `CALIBRE_HOST_PATH` in `.env` (or shell) to your real macOS Calibre path.

Example:

```bash
CALIBRE_HOST_PATH=/Users/YOUR_USER/Dropbox/Library/eBooks/Calibre
```

### 2) Build and run

```bash
docker compose up -d --build
```

Docker uses Bun for dependency install/build and `node:lts-bookworm-slim` for runtime.

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
- `/login` Plex sign-in
- `/books/$bookId` detail page
- `/covers/$bookId` cover image (`?download=1` for attachment)
- `/download/$bookId/$format` ebook download
- `/api/search` JSON search endpoint
- `/api/request-book` request queue endpoint
- `/api/auth/plex` Plex token exchange
- `/api/auth/me` session identity
- `/api/auth/logout` session logout
- `/api/health` runtime health
- `/api/rescan` force metadata rescan

## Notes

- Calibre remains the source of truth.
- This app does not edit metadata.
- Path resolution falls back to folder-id matching when `books.path` casing/punctuation does not match Linux filesystems exactly.
- Request submissions are soft rate-limited per client IP to reduce bot spam.
- Authentication mode `allowlist_or_shared` allows either explicit email
  allowlist matches or Plex shared-library access.

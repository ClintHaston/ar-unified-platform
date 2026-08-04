/* Asset-Resource Platform — service worker (PWA build, 2026-08-03).
 *
 * Scope of ambition: make the app installable and make it open fast on a phone
 * with two bars of signal in a truck. It is NOT an offline CRM. Nothing a rep
 * types is queued and replayed here, because a call log that silently syncs an
 * hour later against a stale contact is worse than a log that failed loudly.
 *
 * THE CACHE RULES
 *
 *   static  (cache-first)   Vite emits /assets/<name>-<hash>.js — the hash IS
 *                           the version, so a cached hit can never be stale.
 *                           Icons and the manifest join them: they change with
 *                           a deploy, and a deploy changes BUILD_ID, which
 *                           throws the whole cache away in activate().
 *   pages   (network-first) index.html must never be cache-first: it is the one
 *                           file whose URL does not change between deploys, so
 *                           a cached copy would pin the app to the old bundle
 *                           forever. Cached only as the offline fallback.
 *   api     (network-first) The network is the truth. The cache is a
 *                           within-session courtesy for a dropout, never a
 *                           source. See SESSION below.
 *   auth    (network-only)  Never read from, never written to a cache. Not
 *                           once, not for a second. A cached /auth/me is an
 *                           identity that outlives the session that earned it.
 *
 * SESSION — what "never cache API responses beyond a session" is enforced as.
 * The API cache is emptied on ALL of:
 *   * a new BUILD_ID activating (deploy),
 *   * the page telling us it just loaded ('session-start', posted on every
 *     registration, so an app launch never reads the last launch's data),
 *   * the app telling us it signed out ('logout'),
 * and on top of that every entry carries a stamp and is ignored once it is
 * older than SESSION_MAX_AGE. Whichever comes first wins. So: API data cannot
 * survive a reload, a sign-out, a deploy, or half an hour.
 *
 * UPDATES: install skipWaiting()s and activate claims, so a new deploy takes
 * over on the next open with no prompt. The page listens for controllerchange,
 * reloads itself exactly once, and says so in a toast.
 *
 * THIS FILE MUST NOT BE HTTP-CACHED. The browser learns a new deploy exists by
 * re-fetching /sw.js and byte-comparing it, so a stale CDN copy is a fleet that
 * cannot be updated. vercel.json pins it to `max-age=0, must-revalidate` and
 * serves the manifest with the right content type. That file is plain JSON with
 * no comment support, which is why the reason is written down here — a "//" key
 * in a headers block is not in Vercel's schema and fails the deploy outright.
 */

// Replaced at build time by the stampServiceWorker plugin in vite.config.ts
// with a hash of the emitted bundle. Same bundle -> same id -> the browser
// sees no byte change and no pointless update cycle.
const BUILD_ID = '__BUILD_ID__'

const STATIC_CACHE = `ar-static-${BUILD_ID}`
const PAGE_CACHE = `ar-pages-${BUILD_ID}`
const API_CACHE = `ar-api-session-${BUILD_ID}`
const OURS = [STATIC_CACHE, PAGE_CACHE, API_CACHE]

const SESSION_MAX_AGE_MS = 30 * 60 * 1000
// Written onto the cached copy only. The response handed to the page is the
// untouched original, so nothing downstream ever sees this header.
const STAMP = 'x-ar-cached-at'

const API_PREFIX = '/api/'
const AUTH_PREFIX = '/api/platform/auth/'
const STATIC_PREFIXES = ['/assets/', '/icons/']
const STATIC_FILES = ['/manifest.webmanifest', '/apple-touch-icon.png',
                      '/favicon-16.png', '/favicon-32.png']

self.addEventListener('install', (event) => {
  // Warm the offline shell. If it fails (offline at install), that is fine —
  // the page cache fills on the first successful navigation instead.
  event.waitUntil(
    caches.open(PAGE_CACHE)
      .then((c) => c.add(new Request('/', { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith('ar-') && !OURS.includes(n))
             .map((n) => caches.delete(n))))
      .then(() => caches.delete(API_CACHE))   // a deploy is a new session
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type
  if (type === 'session-start' || type === 'logout') {
    event.waitUntil(caches.delete(API_CACHE))
  }
})

function isStatic(url) {
  return STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))
      || STATIC_FILES.includes(url.pathname)
}

/** Cache-first. Content-hashed or version-scoped, so a hit is never stale. */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') cache.put(request, res.clone())
  return res
}

/** Network-first with the offline shell behind it. */
async function pageFirst(request) {
  const cache = await caches.open(PAGE_CACHE)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put('/', res.clone())
    return res
  } catch (err) {
    const shell = await cache.match('/')
    if (shell) return shell
    throw err
  }
}

/** Re-clone a response with the freshness stamp attached, for the cache only. */
async function stamped(res) {
  const headers = new Headers(res.headers)
  headers.set(STAMP, String(Date.now()))
  return new Response(await res.clone().blob(), {
    status: res.status, statusText: res.statusText, headers,
  })
}

function isFresh(res) {
  const at = Number(res.headers.get(STAMP))
  return Number.isFinite(at) && at > 0 && Date.now() - at < SESSION_MAX_AGE_MS
}

/**
 * Network-first for API GETs. The cached copy is a dropout cushion and nothing
 * more: it is only ever reached when the network THREW, and only while it is
 * still inside the session window.
 */
async function apiFirst(request) {
  const cache = await caches.open(API_CACHE)
  try {
    const res = await fetch(request)
    // 4xx/5xx are answers, not outages — they are handed straight through and
    // never cached. Caching a 401 would be caching a logout.
    if (res.ok) cache.put(request, await stamped(res))
    return res
  } catch (err) {
    const hit = await cache.match(request)
    if (hit && isFresh(hit)) return hit
    if (hit) await cache.delete(request)
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Cross-origin (fonts, embedded tools) is left entirely alone. An opaque
  // response is a response we cannot inspect, and caching one is how a
  // service worker starts serving mysteries.
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith(AUTH_PREFIX)) return          // network-only
  if (request.method !== 'GET') return                      // writes: hands off

  if (url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(apiFirst(request))
    return
  }
  if (isStatic(url)) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(pageFirst(request))
  }
})

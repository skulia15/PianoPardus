/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { CacheFirst } from 'workbox-strategies'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { putInbox } from './lib/db'

declare const self: ServiceWorkerGlobalScope

// Registered before workbox touches anything, so the share POST is definitely
// ours. Workbox's router only handles GET, but order is one less thing to think
// about.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/import') {
    event.respondWith(receiveSharedFile(event.request))
  }
})

/**
 * Android's share sheet POSTs the file here. Stash it and redirect to the app,
 * which does the actual importing — a service worker is the wrong place to be
 * parsing scores.
 */
async function receiveSharedFile(request: Request): Promise<Response> {
  const redirect = (path: string) =>
    Response.redirect(new URL(path, self.location.origin).href, 303)

  try {
    const formData = await request.formData()
    const file = formData.getAll('file').find((entry): entry is File => entry instanceof File)
    if (!file) return redirect('/?share=empty')

    const id = crypto.randomUUID()
    await putInbox({ id, fileName: file.name, blob: file, receivedAt: Date.now() })
    return redirect(`/import?id=${id}`)
  } catch {
    return redirect('/?share=failed')
  }
}

// Take over as soon as a new build lands, rather than waiting for every tab to
// close. registerType is 'autoUpdate', and this is the half of it that has to
// live in the worker.
void self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Every route is client-side, so any navigation is served the app shell. This is
// also what makes an already-imported piece playable with no network.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// The engraving engine is 17 MB and most sessions never need it, so it is not
// precached — but once a MIDI file has been imported it is worth keeping, and it
// never changes within a version.
registerRoute(
  ({ url }) => url.pathname.startsWith('/webmscore/'),
  new CacheFirst({ cacheName: 'webmscore' }),
)

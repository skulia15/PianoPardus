// Stands in for the Screen Wake Lock API so the tests can assert on it, and can
// model the part that actually matters: the browser drops the lock whenever the
// page is hidden, and never restores it by itself.
;(() => {
  const state = {
    requests: 0,
    releases: 0,
    sentinels: [],
    get active() {
      return state.sentinels.filter((sentinel) => !sentinel.released).length
    },
    hide() {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      for (const sentinel of state.sentinels) {
        if (!sentinel.released) sentinel.release()
      }
      document.dispatchEvent(new Event('visibilitychange'))
    },
    show() {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    },
  }

  class FakeSentinel extends EventTarget {
    constructor() {
      super()
      this.type = 'screen'
      this.released = false
    }
    release() {
      if (!this.released) {
        this.released = true
        state.releases++
        this.dispatchEvent(new Event('release'))
      }
      return Promise.resolve()
    }
  }

  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: async () => {
        state.requests++
        const sentinel = new FakeSentinel()
        state.sentinels.push(sentinel)
        return sentinel
      },
    },
  })

  window.__wakeLock = state
})()

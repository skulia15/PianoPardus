import { useEffect } from 'react'

/**
 * Keeps the screen awake while the player is open.
 *
 * Practising means both hands on the keyboard and nothing touching the phone,
 * so Android's screen timeout fires part way through a piece. The wake lock is
 * released by the browser whenever the page stops being visible, and is not
 * restored on its own — so it has to be taken again every time the page comes
 * back, not just once on mount.
 *
 * Everything here fails quietly: a browser without the API, or a refusal, just
 * means the screen times out as it did before.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let released = false

    async function acquire() {
      if (released || sentinel || document.visibilityState !== 'visible') return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (released) {
          void lock.release().catch(() => {})
          return
        }
        sentinel = lock
        lock.addEventListener('release', () => {
          sentinel = null
        })
      } catch {
        // Refused, or no screen to lock. Nothing to do but carry on.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}

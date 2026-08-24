import { useCallback, useEffect, useRef, useState } from 'react'

export type MidiStatus =
  | 'connecting'
  | 'connected'
  | 'no-inputs'
  | 'denied'
  | 'insecure'
  | 'unsupported'

/**
 * Web MIDI, used directly. Handlers are kept in refs so re-renders never
 * detach a live keyboard.
 */
export function useMidiInput(
  onNoteOn: (note: number, velocity: number) => void,
  onNoteOff: (note: number) => void,
) {
  const [status, setStatus] = useState<MidiStatus>('connecting')
  const [inputNames, setInputNames] = useState<string[]>([])

  const noteOnRef = useRef(onNoteOn)
  const noteOffRef = useRef(onNoteOff)
  noteOnRef.current = onNoteOn
  noteOffRef.current = onNoteOff

  const accessRef = useRef<MIDIAccess | null>(null)

  const handleMessage = useCallback((event: MIDIMessageEvent) => {
    const data = event.data
    if (!data || data.length < 3) return

    const command = data[0] & 0xf0
    const note = data[1]
    const velocity = data[2]

    if (command === 0x90 && velocity > 0) {
      noteOnRef.current(note, velocity)
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      // A note-on with velocity 0 is a note-off; many keyboards only send that form.
      noteOffRef.current(note)
    }
  }, [])

  const attach = useCallback(
    (access: MIDIAccess) => {
      const names: string[] = []
      access.inputs.forEach((input) => {
        input.onmidimessage = handleMessage
        names.push(input.name ?? 'MIDI input')
      })
      setInputNames(names)
      setStatus(names.length > 0 ? 'connected' : 'no-inputs')
    },
    [handleMessage],
  )

  const connect = useCallback(async () => {
    if (!window.isSecureContext) {
      setStatus('insecure')
      return
    }
    if (typeof navigator.requestMIDIAccess !== 'function') {
      setStatus('unsupported')
      return
    }

    setStatus('connecting')
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      accessRef.current = access
      access.onstatechange = () => attach(access)
      attach(access)
    } catch {
      setStatus('denied')
    }
  }, [attach])

  useEffect(() => {
    void connect()
    return () => {
      accessRef.current?.inputs.forEach((input) => {
        input.onmidimessage = null
      })
      if (accessRef.current) accessRef.current.onstatechange = null
    }
  }, [connect])

  return { status, inputNames, connect }
}

export function midiStatusMessage(status: MidiStatus): string | null {
  switch (status) {
    case 'connected':
      return null
    case 'connecting':
      return 'Looking for a MIDI keyboard…'
    case 'no-inputs':
      return 'No MIDI keyboard found. Check the USB-C adapter.'
    case 'denied':
      return 'MIDI access was refused.'
    case 'insecure':
      return 'Web MIDI needs HTTPS. Open this over a secure connection.'
    case 'unsupported':
      return 'This browser has no Web MIDI. Use Chrome on Android.'
  }
}

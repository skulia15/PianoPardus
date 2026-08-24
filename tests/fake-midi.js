// Injected into the page so the app can be driven without a physical keyboard.
// window.__midi.send([...]) delivers raw MIDI bytes to the app.
;(() => {
  class FakeInput {
    constructor() {
      this.id = 'fake-input-1'
      this.name = 'Fake MIDI Keyboard'
      this.manufacturer = 'PianoPardus tests'
      this.type = 'input'
      this.state = 'connected'
      this.connection = 'open'
      this.onmidimessage = null
    }
    open() {
      return Promise.resolve(this)
    }
    emit(bytes) {
      const event = { data: new Uint8Array(bytes), target: this, timeStamp: performance.now() }
      if (this.onmidimessage) this.onmidimessage(event)
    }
  }

  // Stands in for a digital piano's own sound engine: everything the app sends
  // is recorded so tests can assert on what would have been heard.
  class FakeOutput {
    constructor() {
      this.id = 'fake-output-1'
      this.name = 'Fake MIDI Piano'
      this.manufacturer = 'PianoPardus tests'
      this.type = 'output'
      this.state = 'connected'
      this.connection = 'open'
    }
    open() {
      return Promise.resolve(this)
    }
    send(data, timestamp) {
      window.__midi.sent.push({ data: Array.from(data), timestamp: timestamp ?? null })
    }
  }

  const input = new FakeInput()
  const output = new FakeOutput()

  navigator.requestMIDIAccess = () =>
    Promise.resolve({
      inputs: new Map([[input.id, input]]),
      outputs: new Map([[output.id, output]]),
      sysexEnabled: false,
      onstatechange: null,
    })

  window.__midi = {
    input,
    output,
    sent: [],
    noteOnsSent: () => window.__midi.sent.filter((m) => (m.data[0] & 0xf0) === 0x90 && m.data[2] > 0),
    clearSent: () => {
      window.__midi.sent.length = 0
    },
    send: (bytes) => input.emit(bytes),
    noteOn: (note, velocity = 80) => input.emit([0x90, note, velocity]),
    noteOff: (note) => input.emit([0x80, note, 0]),
    play: (notes) => {
      for (const note of notes) input.emit([0x90, note, 80])
      for (const note of notes) input.emit([0x80, note, 0])
    },
  }
})()

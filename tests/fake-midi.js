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

  const input = new FakeInput()

  navigator.requestMIDIAccess = () =>
    Promise.resolve({
      inputs: new Map([[input.id, input]]),
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null,
    })

  window.__midi = {
    input,
    send: (bytes) => input.emit(bytes),
    noteOn: (note, velocity = 80) => input.emit([0x90, note, velocity]),
    noteOff: (note) => input.emit([0x80, note, 0]),
    play: (notes) => {
      for (const note of notes) input.emit([0x90, note, 80])
      for (const note of notes) input.emit([0x80, note, 0])
    },
  }
})()

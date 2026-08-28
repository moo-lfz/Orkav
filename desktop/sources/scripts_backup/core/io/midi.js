'use strict'

/* global transposeTable */

function Midi (client) {
  this.mode = 0
  this.isClock = false

  this.outputIndexes = []
  this.inputIndex = -1

  this.outputs = []
  this.inputs = []
  this.stack = []

  this.start = function () {
    console.info('Midi Starting..')
    this.refresh()
  }

  this.clear = function () {
    this.stack = this.stack.filter((item) => { return item })
  }

  this.run = function () {
    for (const id in this.stack) {
      const item = this.stack[id]
      if (item.isPlayed === false) {
        this.press(item)
      }
      if (item.length < 1) {
        this.release(item, id)
      } else {
        item.length--
      }
    }
  }

    this.trigger = function (item, down) {
 if (!this.outputDevice() && (item.port === -1 || item.port === undefined)) { console.warn('MIDI', 'No midi output!'); return }
    const transposed = this.transpose(item.note, item.octave)
    const channel = !isNaN(item.channel) ? parseInt(item.channel) : client.orca.valueOf(item.channel)

    if (!transposed) { return }

    const c = down === true ? 0x90 + channel : 0x80 + channel
    const n = transposed.id
    const v = parseInt((item.velocity / 16) * 127)

    if (!n || c === 127) { return }

    // NUOVA LOGICA DI ROUTING:
    let devices = []
    if (item.port !== undefined && item.port >= 0 && item.port < this.outputs.length) {
      devices = [this.outputs[item.port]]
    } else {
      devices = this.outputDevice()
    }

    devices.forEach(device => device.send([c, n, v]))
  }

  this.press = function (item) {
    if (!item) { return }
    this.trigger(item, true)
    item.isPlayed = true
  }

  this.release = function (item, id) {
    if (!item) { return }
    this.trigger(item, false)
    delete this.stack[id]
  }

  this.silence = function () {
    for (const item of this.stack) {
      this.release(item)
    }
  }

   this.push = function (channel, octave, note, velocity, length, isPlayed = false, port = -1) {
    const item = { channel, octave, note, velocity, length, isPlayed, port }
    // Retrigger duplicates
    for (const id in this.stack) {
      const dup = this.stack[id]
      if (dup.channel === channel && dup.octave === octave && dup.note === note) { this.release(item, id) }
    }
    this.stack.push(item)
  }
   

  this.allNotesOff = function () {
    if (!this.outputDevice()) { return }
    console.log('MIDI', 'All Notes Off')
    for (let chan = 0; chan < 16; chan++) {
     this.outputDevice().forEach(device => device.send([0xB0 + chan, 123, 0]))
    }
  }

  // Clock

  this.ticks = []

  this.sendClockStart = function () {
    if (!this.outputDevice()) { return }
    this.isClock = true
    this.outputDevice().forEach(device => device.send([0xFA], 0))
    console.log('MIDI', 'MIDI Start Sent')
  }

  this.sendClockStop = function () {
    if (!this.outputDevice()) { return }
    this.isClock = false
    this.outputDevice().forEach(device => device.send([0xFC], 0))
    console.log('MIDI', 'MIDI Stop Sent')
  }

  this.sendClock = function () {
    if (!this.outputDevice()) { return }
    if (this.isClock !== true) { return }

    const bpm = client.clock.speed.value
    const frameTime = (60000 / bpm) / 4
    const frameFrag = frameTime / 6

    for (let id = 0; id < 6; id++) {
      if (this.ticks[id]) { clearTimeout(this.ticks[id]) }
      this.ticks[id] = setTimeout(() => { this.outputDevice().forEach(device => device.send([0xF8], 0))}, parseInt(id) * frameFrag)
    }
  }

  this.receive = function (msg) {
    switch (msg.data[0]) {
      // Clock
      case 0xF8:
        client.clock.tap()
        break
      case 0xFA:
        console.log('MIDI', 'Start Received')
        client.clock.play(false, true)
        break
      case 0xFB:
        console.log('MIDI', 'Continue Received')
        client.clock.play()
        break
      case 0xFC:
        console.log('MIDI', 'Stop Received')
        client.clock.stop()
        break
    }
  }

  // Tools

 this.selectOutput = function (id) {
  if (id === -1) { 
    this.outputIndexes = []; 
    console.log('MIDI', 'Select Output Device: None'); 
    return 
  }
  if (!this.outputs[id]) { 
    console.warn('MIDI', `Unknown device with id ${id}`); 
    return 
  }
  const index = this.outputIndexes.indexOf(parseInt(id))
  if (index > -1) {
    this.outputIndexes.splice(index, 1)
    console.log('MIDI', `Deselect Output Device: ${this.outputs[id].name}`)
  } else {
    this.outputIndexes.push(parseInt(id))
    console.log('MIDI', `Select Output Device: ${this.outputs[id].name}`)
  }
}

   

  this.selectInput = function (id) {
    if (this.inputDevice()) { this.inputDevice().onmidimessage = null }
    if (id === -1) { this.inputIndex = -1; console.log('MIDI', 'Select Input Device: None'); return }
    if (!this.inputs[id]) { console.warn('MIDI', `Unknown device with id ${id}`); return }

    this.inputIndex = parseInt(id)
    this.inputDevice().onmidimessage = (msg) => { this.receive(msg) }
    console.log('MIDI', `Select Input Device: ${this.inputDevice().name}`)
  }

 this.outputDevice = function () {
  var devices = []
  for (var i = 0; i < this.outputIndexes.length; i++) {
    var index = this.outputIndexes[i]
    var device = this.outputs[index]
    if (device) {
      devices.push(device)
    }
  }
  return devices
}

  this.inputDevice = function () {
    return this.inputs[this.inputIndex]
  }

 this.selectNextOutput = function () {
  const nextIndex = this.outputIndexes.length > 0 
    ? (Math.max(...this.outputIndexes) + 1) % this.outputs.length 
    : 0
  this.selectOutput(nextIndex)
}

  this.selectNextInput = () => {
    const id = this.inputIndex < this.inputs.length - 1 ? this.inputIndex + 1 : -1
    this.selectInput(id)
    client.update()
  }

  // Setup

  this.refresh = function () {
    if (!navigator.requestMIDIAccess) { return }
    navigator.requestMIDIAccess().then(this.access, (err) => {
      console.warn('No Midi', err)
    })
  }

  this.access = (midiAccess) => {
    const outputs = midiAccess.outputs.values()
    this.outputs = []
    for (let i = outputs.next(); i && !i.done; i = outputs.next()) {
      this.outputs.push(i.value)
    }
    this.selectOutput(0)

    const inputs = midiAccess.inputs.values()
    this.inputs = []
    for (let i = inputs.next(); i && !i.done; i = inputs.next()) {
      this.inputs.push(i.value)
    }
    this.selectInput(-1)
  }

  // UI

  this.transpose = function (n, o = 3) {
    if (!transposeTable[n]) { return null }
    const octave = clamp(parseInt(o) + parseInt(transposeTable[n].charAt(1)), 0, 8)
    const note = transposeTable[n].charAt(0)
    const value = ['C', 'c', 'D', 'd', 'E', 'F', 'f', 'G', 'g', 'A', 'a', 'B'].indexOf(note)
    const id = clamp((octave * 12) + value + 24, 0, 127)
    return { id, value, note, octave }
  }

  this.convert = function (id) {
    const note = ['C', 'c', 'D', 'd', 'E', 'F', 'f', 'G', 'g', 'A', 'a', 'B'][id % 12]
    const octave = Math.floor(id / 12) - 5
    const name = `${note}${octave}`
    const key = Object.values(transposeTable).indexOf(name)
    return Object.keys(transposeTable)[key]
  }

  this.toString = function () {
    const devices = this.outputDevice();
    return !navigator.requestMIDIAccess ? 'No Midi Support' 
           : devices.length > 0 ? devices.map(d => d.name).join(' + ') 
           : 'No Midi Device'
  }

  this.toInputString = () => {
    return !navigator.requestMIDIAccess ? 'No Midi Support' : this.inputDevice() ? `${this.inputDevice().name}` : 'No Input Device'
  }

    this.toOutputString = () => {
    const devices = this.outputDevice();
    return !navigator.requestMIDIAccess ? 'No Midi Support' 
           : devices.length > 0 ? devices.map(d => d.name).join(' + ') 
           : 'No Output Device'
  }


  this.length = function () {
    return this.stack.length
  }

  function clamp (v, min, max) { return v < min ? min : v > max ? max : v }

}
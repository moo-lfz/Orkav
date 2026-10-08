'use strict'

/* global transposeTable */

function Midi (client) {
  this.mode = 0
  this.isClock = false

  this.outputIndexes = []
  // Selezione separata per CLOCK/transport. Vuota = segue outputIndexes.
  this.clockIndexes = []
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
    if (!this.outputDevice().length && (item.port === -1 || item.port === undefined)) { console.warn('MIDI', 'No midi output!'); return }
    const transposed = this.transpose(item.note, item.octave)
    const channel = !isNaN(item.channel) ? parseInt(item.channel) : client.orca.valueOf(item.channel)

    if (!transposed) { return }

    const c = down === true ? 0x90 + channel : 0x80 + channel
    const n = transposed.id
    const v = parseInt((item.velocity / 16) * 127)

    if (n == null || c === 127) { return }

    // NUOVA LOGICA DI ROUTING:
    let devices = []
    if (item.port !== undefined && item.port >= 0 && item.port < this.outputs.length) {
      devices = [this.outputs[item.port]]
    } else {
      devices = this.outputDevice()
    }

    if (!devices.length) { console.warn('MIDI', 'Nessun device di output selezionato. Usa mididevices e midi:<indice>'); return }

    devices.forEach(device => device.send([c, n, v]))

    // Log diagnostico rate-limited (ogni ~2s) per verificare l'invio
    const now = performance.now()
    if (down === true && now - (this._lastNoteLog || 0) > 2000) {
      this._lastNoteLog = now
      console.log('MIDI', `nota ON  ch:${channel} note:${n} vel:${v} → ${devices.map(d => d.name).join(' + ')}`)
    }

    // Score → motore grafico: ogni nota ON generata da Orca pulsa le visual
    // (indipendente dal framerate: flash sincronizzato con lo score)
    if (down === true && client) {
      client.scoreFlash = Math.min(1, (client.scoreFlash || 0) + (v / 127) * 0.6)
      client._progDirty = true // la griglia è cambiata
    }
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
    if (!this.clockDevice().length) { return }
    console.log('MIDI', 'All Notes Off')
    for (let chan = 0; chan < 16; chan++) {
     this.clockDevice().forEach(device => device.send([0xB0 + chan, 123, 0]))
    }
  }

  // Clock

  this.ticks = []

  this.sendClockStart = function () {
  if (!this.clockDevice().length) return
  this.isClock = true
  this.clockDevice().forEach(device => device.send([0xFA], 0))
  console.log('MIDI', 'MIDI Start Sent')
  // Avvia il clock MIDI
  this.clockRunning = true
}

this.sendClockStop = function () {
  if (!this.clockDevice().length) return
  this.isClock = false
  this.clockDevice().forEach(device => device.send([0xFC], 0))
  console.log('MIDI', 'MIDI Stop Sent')
  this.clockRunning = false
}

  this.sendClock = function () {
    if (!this.clockDevice().length) { return }
    if (this.isClock !== true) { return }

    const bpm = client.clock.speed.value
    const frameTime = (60000 / bpm) / 4
    const frameFrag = frameTime / 6

    for (let id = 0; id < 6; id++) {
      if (this.ticks[id]) { clearTimeout(this.ticks[id]) }
      this.ticks[id] = setTimeout(() => { this.clockDevice().forEach(device => device.send([0xF8], 0))}, parseInt(id) * frameFrag)
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

 // OUTPUT MULTIPLO — si possono tenere attivi PIÙ device contemporaneamente.
 // Caso d'uso reale: mandare le stesse note all'IAC Driver (→ Ableton Live) E
 // via USB all'hardware esterno (es. Ableton Move) nello stesso momento.
 //
 //   midi:<n>     TOGGLE: aggiunge il device alla selezione, o lo toglie se c'è
 //   midi:<n>!    ESCLUSIVA: solo quel device (azzera gli altri)
 //   midi:-1      azzera tutta la selezione
 //   midi:<a>,<b> selezione esatta: solo i device elencati
 //
 // Ogni nota può comunque essere forzata su UNA porta specifica dall'operatore
 // `:` della patch (il suo argomento port), che scavalca questa selezione.
 this.selectOutput = function (id) {
  // id può essere -1, un numero, una stringa con "!" finale, o una lista "0,2"
  if (id === -1 || id === '-1' || id === null) {
    this.outputIndexes = []
    console.log('MIDI', 'Select Output Device: None')
    return
  }
  if (typeof id === 'string' && id.indexOf(',') >= 0) {
    const ids = id.split(',').map(s => parseInt(s)).filter(n => !isNaN(n) && this.outputs[n])
    this.outputIndexes = ids
    console.log('MIDI', 'Output:', ids.length ? ids.map(i => this.outputs[i].name).join(' + ') : 'None')
    return
  }
  let exclusive = false
  let raw = id
  if (typeof id === 'string' && id.trim().endsWith('!')) { exclusive = true; raw = id.trim().slice(0, -1) }
  const n = parseInt(raw)
  if (isNaN(n) || !this.outputs[n]) {
    console.warn('MIDI', `Unknown device with id ${id}`)
    return
  }
  if (exclusive) {
    this.outputIndexes = [n]
  } else {
    const at = this.outputIndexes.indexOf(n)
    if (at >= 0) { this.outputIndexes.splice(at, 1) } else { this.outputIndexes.push(n) }
  }
  console.log('MIDI', 'Output:', this.outputIndexes.length
    ? this.outputIndexes.map(i => `[${i}] ${this.outputs[i].name}`).join(' + ')
    : 'None')
}

   

  this.selectInput = function (id) {
    if (this.inputDevice()) { this.inputDevice().onmidimessage = null }
    if (id === -1) { this.inputIndex = -1; console.log('MIDI', 'Select Input Device: None'); return }
    if (!this.inputs[id]) { console.warn('MIDI', `Unknown device with id ${id}`); return }

    this.inputIndex = parseInt(id)
    this.inputDevice().onmidimessage = (msg) => { this.receive(msg) }
    console.log('MIDI', `Select Input Device: ${this.inputDevice().name}`)
  }

 // Device che ricevono il CLOCK/transport. Vuoto = tutti gli output selezionati.
 // Serve perché mandando note a IAC + USB insieme Ableton riceverebbe il clock
 // da due sorgenti e andrebbe in conflitto.
 this.selectClockOutputs = function (id) {
   if (id === -1 || id === '-1') { this.clockIndexes = []; console.log('MIDI', 'Clock: nessun device'); return }
   if (typeof id === 'string' && id.indexOf(',') >= 0) {
     this.clockIndexes = id.split(',').map(s2 => parseInt(s2)).filter(n => !isNaN(n) && this.outputs[n])
   } else {
     let exclusive = false, raw = id
     if (typeof id === 'string' && id.trim().endsWith('!')) { exclusive = true; raw = id.trim().slice(0, -1) }
     const n = parseInt(raw)
     if (isNaN(n) || !this.outputs[n]) { console.warn('MIDI', `Unknown device with id ${id}`); return }
     if (exclusive) { this.clockIndexes = [n] }
     else {
       const at = this.clockIndexes.indexOf(n)
       if (at >= 0) { this.clockIndexes.splice(at, 1) } else { this.clockIndexes.push(n) }
     }
   }
   console.log('MIDI', 'Clock →', this.clockIndexes.length ? this.clockIndexes.map(i => `[${i}] ${this.outputs[i].name}`).join(' + ') : 'nessun device')
 }

 // Device per il clock: la selezione dedicata, o tutti gli output selezionati
 this.clockDevice = function () {
   if (this.clockIndexes && this.clockIndexes.length) {
     return this.clockIndexes.map(i => this.outputs[i]).filter(Boolean)
   }
   return this.outputDevice()
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
    // sysex:false esplicito: evita il warning di permesso (Chrome milestone 82+)
    navigator.requestMIDIAccess({ sysex: false }).then(this.access, (err) => {
      console.warn('No Midi', err)
    })
  }

  this.access = (midiAccess) => {
    const outputs = midiAccess.outputs.values()
    this.outputs = []
    for (let i = outputs.next(); i && !i.done; i = outputs.next()) {
      this.outputs.push(i.value)
    }
    // Seleziona il PRIMO device disponibile e logga TUTTI gli output, così
    // l'utente può scegliere quello giusto (es. "Ableton Move" via USB) con
    // il comando midi:<indice>. NON diamo priorità all'IAC: quello serve solo
    // per il routing software (Ableton Live), non per hardware USB.
    console.log('MIDI', 'Output disponibili:', this.outputs.map((d, i) => `[${i}] ${d.name}`).join(', '))
    // All'avvio seleziona il primo device SOLO se non c'è già una selezione
    // (così un hot-plug non cancella la scelta multipla fatta con midi:<n>).
    if (!this.outputIndexes || !this.outputIndexes.length) {
      this.selectOutput(this.outputs.length ? 0 : -1)
    } else {
      // scarta gli indici non più validi e logga la selezione mantenuta
      this.outputIndexes = this.outputIndexes.filter(i => this.outputs[i])
      console.log('MIDI', 'Output mantenuti:', this.outputIndexes.map(i => `[${i}] ${this.outputs[i].name}`).join(' + ') || 'None')
    }

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
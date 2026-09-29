'use strict'

function IO (client) {
  this.client = client
  this.midi = new Midi(client)
  this.cc = new MidiCC(client)
  this.mono = new Mono(client)
  this.udp = new Udp(client)
  this.osc = new Osc(client)

  this.start = () => {
    this.midi.start()
    this.cc.start()
    this.mono.start()
    this.udp.start()
    this.osc.start()
  }

  this.clear = () => {
    this.midi.clear()
    this.cc.clear()
    this.mono.clear()
    this.udp.clear()
    this.osc.clear()
  }

  this.run = () => {
    this.midi.run()
    this.cc.run()
    this.mono.run()
    this.udp.run()
    this.osc.run()
  }

  this.length = () => {
    // --- MODIFICA: controlli di sicurezza ---
    let total = 0
    total += this.midi.length ? this.midi.length() : 0
    total += this.cc.stack ? this.cc.stack.length : 0
    total += this.mono.length ? this.mono.length() : 0
    total += (this.udp && this.udp.messages) ? this.udp.messages.length : 0
    total += (this.osc && this.osc.messages) ? this.osc.messages.length : 0
    return total
  }

  this.inspect = (max) => {
    // --- MODIFICA: controlli di sicurezza ---
    let str = ''
    if (this.cc && this.cc.stack) { str += this.cc.stack.length > 0 ? 'CC ' : '' }
    if (this.mono && this.mono.length && this.mono.length() > 0) { str += 'Mono ' }
    if (this.midi && this.midi.length && this.midi.length() > 0) { str += 'Midi ' }
    if (this.udp && this.udp.messages && this.udp.messages.length > 0) { str += 'UDP ' }
    if (this.osc && this.osc.messages && this.osc.messages.length > 0) { str += 'OSC ' }
    return str.trim() || 'idle'
  }
}
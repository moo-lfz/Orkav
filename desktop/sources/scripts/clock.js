'use strict'

/* global Blob */

function Clock (client) {
  // Worker che CAMBIA intervallo via messaggio (senza ricrearsi): ogni postMessage
  // resetta il setInterval interno. Così il randomizzatore BPM del glitch può
  // cambiare il tempo molto velocemente senza uccidere/ricreare il Worker ogni
  // 40ms (che causava: clock fermo → frame bassi → terminale non glitchato).
  const workerScript = 'let _t=null; onmessage = (e) => { if (_t) clearInterval(_t); _t = setInterval(() => { postMessage(true) }, e.data) }'
  const worker = window.URL.createObjectURL(new Blob([workerScript], { type: 'text/javascript' }))

  this.isPaused = true
  this.timer = null
  this.isPuppet = false

  this.speed = { value: 120, target: 120 }
  this.isAutomating = false
  this.isReceivingTempo = false
  // Durante il total glitch il BPM è randomico SOLO localmente: se lo
  // propagassimo ad Ableton Link ogni 40ms, il worker Link rimanderebbe
  // indietro il tempo (feedback loop) e il clock impazzirebbe all'uscita.
  this.glitching = false
  this.quantize = false // play immediato (la quantizzazione col tempo Link instabile bloccava il play)
  this._ignoreTempoUntil = 0 // debounce anti-feedback per il tempo
  this.peers = 0

  this.start = function () {
    const memory = parseInt(window.localStorage.getItem('bpm'))
    const target = memory >= 20 ? memory : 120
    this.setSpeed(target, target, true)
    this.play()

    if (window.api && window.api.abletonlink) {
      window.api.abletonlink.create(120)

      window.api.abletonlink.onTempoChange((tempo) => {
        // Debounce anti-feedback + soglia anti-rumore: il worker manda tempo ogni
        // 100ms e col consensus multi-peer il valore può rimbalzare. Ignoriamo
        // l'eco subito dopo un set locale E i cambi < 0.5 BPM (rumore).
        if (performance.now() < this._ignoreTempoUntil) return
        if (this.isAutomating === true) return
        if (Math.abs((this.speed.value || 120) - tempo) < 0.5) return
        this.isReceivingTempo = true
        this.setSpeed(tempo, tempo, true)
        this.isReceivingTempo = false
      })

      window.api.abletonlink.onStartStop((isPlaying) => {
        // Orkav è un peer Link BIDIREZIONALE: segue lo start/stop remoto e
        // propaga il proprio. Il worker manda startstop solo dal callback nativo
        // onPlayStateChanged (scatta quando lo stato condiviso cambia davvero),
        // quindi non c'è feedback loop: un eco ha SEMPRE lo stato già coerente.
        this.linkPlaying = isPlaying
        if (this.quantize) {
          // Protocollo Link: lo start/stop è quantizzato al prossimo beat
          const framesToNextBeat = 4 - (client.orca.f % 4)
          setTimeout(() => {
            if (isPlaying) { this.play() } else { this.stop() }
          }, framesToNextBeat * (60000 / this.speed.value) / 4)
        } else {
          if (isPlaying) { this.play() } else { this.stop() }
        }
      })

      window.api.abletonlink.onPeers((numPeers) => {
        this.peers = numPeers
        client.update()
      })
    }
  }

  this.touch = function () {
    this.stop()
    client.run()
  }

  this.run = function () {
    if (this.speed.target === this.speed.value) {
      // Automazione BPM completata: riabilita la ricezione del tempo da Link.
      // (Prima isAutomating restava true per sempre dopo un Cmd+>/< e bloccava
      // onTempoChange, quindi Orkav smetteva di seguire il BPM remoto.)
      this.isAutomating = false
      return
    }
    this.setSpeed(this.speed.value + (this.speed.value < this.speed.target ? 1 : -1), null, true)
  }

  this.setSpeed = (value, target = null, setTimer = false) => {
    if (this.speed.value === value && this.speed.target === target && this.timer) { return }
    if (value) { this.speed.value = clamp(value, 20, 999) }
    if (target) { this.speed.target = clamp(target, 20, 999) }
    if (setTimer === true) { this.setTimer(this.speed.value) }

    if (window.api && window.api.abletonlink && this.isReceivingTempo !== true && !this.glitching) {
      // Orkav ha impostato il tempo localmente: ignora l'eco Link per 1.5s
      this._ignoreTempoUntil = performance.now() + 1500
      window.api.abletonlink.setTempo(this.speed.value)
    }
  }

  this.modSpeed = (mod = 0, animate = false) => {
    if (animate === true) {
      this.isAutomating = true;
      this.setSpeed(null, this.speed.target + mod)
    } else {
      this.isAutomating = false;
      this.setSpeed(this.speed.value + mod, this.speed.value + mod, true)
      client.update()
    }
  }

  this.togglePlay = function (msg = false) {
    if (this.isPaused === true) {
      this.play(msg)
    } else {
      this.stop(msg)
    }
    client.update()
  }

  this.play = function (msg = false, midiStart = false) {
    if (this.isPaused === false && !midiStart) { return }
    this.isPaused = false
    // Propaga lo stato play alla sessione Link: gli altri peer lo ricevono
    if (window.api && window.api.abletonlink) {
      window.api.abletonlink.setIsPlaying(true)
    }
    if (this.isPuppet === true) {
      console.warn('Clock', 'External Midi control')
      if (!pulse.frame || midiStart) {
        this.setFrame(0)
        pulse.frame = 0
        pulse.count = 5
      }
    } else {
      if (msg === true) { client.io.midi.sendClockStart() }
      this.setSpeed(this.speed.target, this.speed.target, true)
    }
  }

  this.stop = function (msg = false) {
    if (this.isPaused === true) { return }
    this.isPaused = true
    // Propaga lo stato stop alla sessione Link: gli altri peer lo ricevono
    if (window.api && window.api.abletonlink) {
      window.api.abletonlink.setIsPlaying(false)
    }
    if (this.isPuppet === true) {
      console.warn('Clock', 'External Midi control')
    } else {
      if (msg === true || client.io.midi.isClock) { client.io.midi.sendClockStop() }
      this.clearTimer()
    }
    client.io.midi.allNotesOff()
    client.io.midi.silence()
  }

  const pulse = {
    count: 0,
    last: null,
    timer: null,
    frame: 0
  }

  this.tap = function () {
    pulse.count = (pulse.count + 1) % 6
    pulse.last = performance.now()
    if (!this.isPuppet) {
      console.log('Clock', 'Puppeteering starts..')
      this.isPuppet = true
      this.clearTimer()
      pulse.timer = setInterval(() => {
        if (performance.now() - pulse.last < 2000) { return }
        this.untap()
      }, 2000)
    }
    if (pulse.count == 0) {
      if (this.isPaused) { pulse.frame++ } else {
        if (pulse.frame > 0) {
          this.setFrame(client.orca.f + pulse.frame)
          pulse.frame = 0
        }
        client.run()
      }
    }
  }

  this.untap = function () {
    console.log('Clock', 'Puppeteering stops..')
    clearInterval(pulse.timer)
    this.isPuppet = false
    pulse.frame = 0
    pulse.last = null
    if (!this.isPaused) {
      this.setTimer(this.speed.value)
    }
  }

  this.setTimer = function (bpm) {
    if (bpm < 20) { console.warn('Clock', 'Error ' + bpm); return }
    window.localStorage.setItem('bpm', bpm)
    const ms = (60000 / parseInt(bpm)) / 4
    if (this.timer) {
      // RIUSA il worker esistente: cambia solo l'intervallo (il worker resetta
      // il suo setInterval interno ad ogni postMessage). Niente terminate/recreate.
      this.timer.postMessage(ms)
      return
    }
    this.timer = new Worker(worker)
    this.timer.postMessage(ms)
    this.timer.onmessage = (event) => {
      client.io.midi.sendClock()
      client.run()
    }
  }

  this.clearTimer = function () {
    if (this.timer) {
      this.timer.terminate()
    }
    this.timer = null
  }

  this.setFrame = function (f) {
    if (isNaN(f)) { return }
    client.orca.f = clamp(f, 0, 9999999)
  }

  this.toString = function () {
    const diff = this.speed.target - this.speed.value
    const _offset = Math.abs(diff) > 5 ? (diff > 0 ? `+${diff}` : diff) : ''
    const _message = this.isPuppet === true ? 'midi' : `${this.speed.value.toFixed(2)}${_offset}`
    const _beat = diff === 0 && client.orca.f % 4 === 0 ? '*' : ''
    const _main = `${_message}${_beat}`
    const _peers = this.peers > 0 ? ` peers:${this.peers}` : ''
    return { main: _main, peers: _peers }
  }

  function clamp (v, min, max) { return v < min ? min : v > max ? max : v }
}
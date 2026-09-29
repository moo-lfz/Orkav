'use strict'
// PRNG deterministico (mulberry32) a livello modulo: stesso seed → stessi filtri
function mulberry32 (a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function AudioReactor () {
  this.ctx = null
  this.analyser = null
  this.dataArray = null
  this.isActive = false
  this.envelope = 0
  this.attack = 0.25 // attack veloce: i transienti devono battere a tempo
  this.release = 0.08
  this.peak = 0
  this.peakThreshold = 0.3
  this.peakDecay = 0.95
  this.isPeaking = false
  this.bands = new Float32Array(7)
  this.smoothBands = new Float32Array(7)
  // Profilo RMS temporale (16 finestre time-domain): la forma d'onda del capture
  this.wave = new Float32Array(16)
  this.timeData = null
  this.inputGain = 3.5
  // Drive dell'audio capture (0-1): scala l'uscita dei filtri. Default 0.4 (=400)
  this.drive = 0.4
  // 7 filtri bandpass posizionati randomicamente nello spettro (seeded)
  this.filterWeights = null // Float32Array[7] di Float32Array[len]
  this.filterSeed = 400
  // Aggregate lette da client.js e shader
  this.bass = 0
  this.mid = 0
  this.high = 0
  this.vol = 0
  this._rng = mulberry32(400)
}

// Posiziona i 7 filtri bandpass in modo randomico (seeded) nello spettro logaritmico.
// Chiamato dal commander fx: con il primo valore (es. datamosh.400.400 → seed 400).
AudioReactor.prototype.randomizeFilters = function (seed) {
  this.filterSeed = seed | 0
  const rng = mulberry32(this.filterSeed)
  const len = this.analyser ? this.analyser.frequencyBinCount : 256
  this.filterWeights = []
  // Spettro log: da bin 1 (~94Hz) a bin len-1 (~24kHz)
  const logMin = Math.log(1)
  const logMax = Math.log(len - 1)
  // 7 centri random ordinati, con jitter — copertura spettrale sempre diversa
  const centers = []
  for (let f = 0; f < 7; f++) {
    const base = (f + 0.5) / 7 // distribuzione di base uniforme
    const jitter = (rng() - 0.5) * (0.9 / 7) // jitter fino a ±45% di una banda
    centers.push(Math.min(0.999, Math.max(0.001, base + jitter)))
  }
  centers.sort((a, b) => a - b)
  for (let f = 0; f < 7; f++) {
    const centerLog = logMin + centers[f] * (logMax - logMin)
    const centerBin = Math.exp(centerLog)
    const width = (0.35 + rng() * 0.9) * Math.max(1, centerBin * 0.35) // larghezza random
    const w = new Float32Array(len)
    for (let i = 0; i < len; i++) {
      const d = Math.abs(i - centerBin) / width
      w[i] = d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(d * Math.PI) // raised cosine
    }
    this.filterWeights.push(w)
  }
  console.log('[AudioReactor] 7 filtri randomizzati, seed:', seed)
}

AudioReactor.prototype.start = async function () {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    const source = this.ctx.createMediaStreamSource(stream)
    this.gainNode = this.ctx.createGain()
    this.gainNode.gain.value = this.inputGain
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.15 // poco smoothing nativo: reattività
    source.connect(this.gainNode)
    this.gainNode.connect(this.analyser)
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.timeData = new Uint8Array(this.analyser.frequencyBinCount)
    this.randomizeFilters(this.filterSeed)
    this.isActive = true
    this.loop()
    console.log('AudioReactor', 'Microfono attivo (7 filtri bandpass random, nessun filtro input)')
  } catch (e) {
    console.warn('AudioReactor', 'Microfono negato. Uso simulatore.')
    this.isActive = false
  }
}

AudioReactor.prototype.loop = function () {
  if (!this.isActive) return
  requestAnimationFrame(() => { this.loop() })
  this.analyser.getByteFrequencyData(this.dataArray)
  // Profilo RMS temporale: campiona la forma d'onda in 16 finestre
  if (this.timeData) {
    this.analyser.getByteTimeDomainData(this.timeData)
    const tl = this.timeData.length
    const win = Math.floor(tl / 16)
    for (let w = 0; w < 16; w++) {
      let sum = 0
      const s = w * win
      for (let i = s; i < s + win && i < tl; i++) {
        const v = (this.timeData[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / win)
      // smooth wave per evitare scatti
      this.wave[w] += 0.35 * (rms - this.wave[w])
    }
  }
  const len = this.dataArray.length
  const drive = this.drive
  if (!this.filterWeights || this.filterWeights.length !== 7 || this.filterWeights[0].length !== len) {
    this.randomizeFilters(this.filterSeed)
  }
  // Smoothing per banda: basse più lente, alte più veloci (transienti)
  const smoothPerBand = [0.30, 0.30, 0.38, 0.45, 0.52, 0.60, 0.65]
  // Tilt spettrale: l'energia musicale cala ~6dB/ottava, boost progressivo
  const gainTilt = [1.0, 1.1, 1.3, 1.6, 2.0, 2.6, 3.2]
  for (let b = 0; b < 7; b++) {
    const w = this.filterWeights[b]
    let sum = 0, wsum = 0
    for (let i = 0; i < len; i++) {
      const wi = w[i]
      if (wi > 0) { sum += (this.dataArray[i] / 255) * wi; wsum += wi }
    }
    let raw = wsum > 0 ? sum / wsum : 0
    raw *= gainTilt[b] * (0.25 + drive * 2.5) // drive scala la sensibilità
    raw = Math.max(0, raw - 0.02) / 0.98 // noise gate
    raw = Math.min(1, raw)
    const sf = smoothPerBand[b]
    this.smoothBands[b] += sf * (raw - this.smoothBands[b])
    this.bands[b] = this.smoothBands[b]
  }
  this.bass = (this.bands[0] + this.bands[1]) * 0.5
  this.mid = (this.bands[2] + this.bands[3] + this.bands[4]) / 3
  this.high = (this.bands[5] + this.bands[6]) * 0.5
  let total = 0
  for (let i = 0; i < 7; i++) total += this.bands[i]
  const rawVol = total / 7
  this.vol = rawVol
  // Envelope: attack in salita, release in discesa (fix bug precedente)
  if (rawVol > this.envelope) {
    this.envelope += this.attack * (rawVol - this.envelope)
  } else {
    this.envelope += this.release * (rawVol - this.envelope)
  }
  if (rawVol > this.peak) {
    this.peak = rawVol
    this.isPeaking = true
  } else {
    this.peak *= this.peakDecay
    if (this.peak < this.peakThreshold) this.isPeaking = false
  }
}

AudioReactor.prototype.getBands = function () {
  return this.bands
}

AudioReactor.prototype.getSimulated = function (beatTime) {
  const kick = Math.max(0, 1 - Math.abs(Math.sin(beatTime * Math.PI * 2)) * 3)
  const snare = Math.max(0, 1 - Math.abs(Math.sin(beatTime * Math.PI)) * 2)
  const hihat = Math.abs(Math.sin(beatTime * Math.PI * 4)) * 0.5
  for (let i = 0; i < 7; i++) {
    this.bands[i] = (kick + snare + hihat) / 3 * (0.5 + 0.5 * Math.sin(i * 1.2 + beatTime * 2))
  }
  this.bass = (this.bands[0] + this.bands[1]) * 0.5
  this.mid = (this.bands[2] + this.bands[3] + this.bands[4]) / 3
  this.high = (this.bands[5] + this.bands[6]) * 0.5
  this.envelope = (kick + snare + hihat) / 3
  this.vol = this.envelope
  this.isPeaking = kick > 0.5
  return { bands: this.bands, envelope: this.envelope, isPeaking: this.isPeaking }
}

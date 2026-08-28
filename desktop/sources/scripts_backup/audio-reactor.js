'use strict'

function AudioReactor () {
  this.ctx = null
  this.analyser = null
  this.dataArray = null
  this.isActive = false
  
  // Envelope follower
  this.envelope = 0
  this.attack = 0.08   // Veloce per catturare transienti (kick/snare)
  this.release = 0.15  // Lento per seguire il groove
  
  // Peak detection
  this.peak = 0
  this.peakThreshold = 0.3
  this.peakDecay = 0.95
  this.isPeaking = false
  
  // Bande frequenza
  this.bass = 0
  this.mid = 0
  this.high = 0
  this.vol = 0
  
  // Smoothed values (per evitare scatti)
  this.smoothBass = 0
  this.smoothMid = 0
  this.smoothHigh = 0
  this.smoothVol = 0
  this.smoothFactor = 0.3
  
  // Gain ingresso
  this.inputGain = 3.5
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
    
    // Filtro passa-alto per rimuovere rumori di fondo (sotto 80Hz)
    this.highpass = this.ctx.createBiquadFilter()
    this.highpass.type = 'highpass'
    this.highpass.frequency.value = 80
    
    // Gain per amplificare ingresso
    this.gainNode = this.ctx.createGain()
    this.gainNode.gain.value = this.inputGain
    
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.3
    
    source.connect(this.highpass)
    this.highpass.connect(this.gainNode)
    this.gainNode.connect(this.analyser)
    
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.isActive = true
    this.loop()
    console.log('AudioReactor', 'Microfono attivo con filtro HP e envelope follower')
  } catch (e) {
    console.warn('AudioReactor', 'Accesso microfono negato. Uso simulatore.')
    this.isActive = false
  }
}

AudioReactor.prototype.loop = function () {
  if (!this.isActive) { return }
  requestAnimationFrame(() => { this.loop() })
  this.analyser.getByteFrequencyData(this.dataArray)
  
  const len = this.dataArray.length
  const third = Math.floor(len / 3)
  let bassSum = 0, midSum = 0, highSum = 0, totalSum = 0
  
  for (let i = 0; i < len; i++) {
    const val = this.dataArray[i] / 255
    totalSum += val
    if (i < third) bassSum += val
    else if (i < third * 2) midSum += val
    else highSum += val
  }
  
  // Raw values
  const rawBass = (bassSum / third)
  const rawMid = (midSum / third)
  const rawHigh = (highSum / (len - third * 2))
  const rawVol = (totalSum / len)
  
  // Envelope follower (attack/release separati)
  if (rawVol > this.envelope) {
    this.envelope += this.attack * (rawVol - this.envelope)
  } else {
    this.envelope += this.release * (this.envelope - rawVol)
  }
  
  // Peak detection
  if (rawVol > this.peak) {
    this.peak = rawVol
    this.isPeaking = true
  } else {
    this.peak *= this.peakDecay
    if (this.peak < this.peakThreshold) { this.isPeaking = false }
  }
  
  // Smoothing per evitare scatti
  this.smoothBass += this.smoothFactor * (rawBass - this.smoothBass)
  this.smoothMid += this.smoothFactor * (rawMid - this.smoothMid)
  this.smoothHigh += this.smoothFactor * (rawHigh - this.smoothHigh)
  this.smoothVol += this.smoothFactor * (rawVol - this.smoothVol)
  
  this.bass = this.smoothBass
  this.mid = this.smoothMid
  this.high = this.smoothHigh
  this.vol = this.smoothVol
}

// Simulatore basato su tempo (usato se microfono non disponibile)
AudioReactor.prototype.getSimulated = function (beatTime) {
  // Simula un loop di batteria: kick ogni beat, snare ogni 2, hihat ogni 0.5
  const kick = Math.max(0, 1 - Math.abs(Math.sin(beatTime * Math.PI * 2)) * 3) 
  const snare = Math.max(0, 1 - Math.abs(Math.sin(beatTime * Math.PI)) * 2)
  const hihat = Math.abs(Math.sin(beatTime * Math.PI * 4)) * 0.5
  
  this.bass = kick * 0.8
  this.mid = snare * 0.6
  this.high = hihat
  this.vol = (this.bass + this.mid + this.high) / 3
  this.envelope = this.vol
  this.isPeaking = kick > 0.5
  return {
    bass: this.bass,
    mid: this.mid,
    high: this.high,
    vol: this.vol,
    envelope: this.envelope,
    isPeaking: this.isPeaking
  }
}
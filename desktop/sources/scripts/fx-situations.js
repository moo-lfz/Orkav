'use strict'

function FxSituations (client, audioReactor) {
  this.client = client
  this.audio = audioReactor
  this.chain = []
  this.scroll = 0
  this.phase = 'wave'
  this.nextSwitch = 0
  this.dropRaw = 0
  this.dropScroll = 0
  this.palette = ['#2e9cc3', '#ef8f7d', '#c81e4e', '#f5efe6', '#1f7fa8']
  this.dropPal = ['#ff4fd8', '#4bff5f', '#c81e4e', '#f5efe6']
  this.off = document.createElement('canvas')
  this.offCtx = this.off.getContext('2d')
  this.prev = null
}

FxSituations.prototype.set = function (name, seed, drive) {
  this.setChain([{ name: name, seed: seed, drive: drive }])
}

FxSituations.prototype.setChain = function (arr) {
  const names = ['datamosh', 'glitch', 'displace', 'fracture', 'brokentv']
  this.chain = (arr || []).filter(f => names.indexOf(f.name) >= 0).slice(0, 2)
}

function vnoise (x, y) {
  const xi = Math.floor(x); const yi = Math.floor(y)
  const xf = x - xi; const yf = y - yi
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s) }
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf)
  return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) + h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v
}
function hcol (n, pal) {
  return pal[Math.floor((((n % 1) + 1) % 1) * pal.length)]
}

FxSituations.prototype.getBeatTime = function () {
  const bpm = this.client.clock.speed.value || 120
  return (this.client.orca.f || 0) * (60 / bpm) / 4
}

FxSituations.prototype.drawCell = function (x, y, glyph, theme) {
  const ctx = this.client.context
  const ws = this.client.tile.ws
  const hs = this.client.tile.hs
  if (theme.bg) { ctx.fillStyle = theme.bg; ctx.fillRect(x * ws, y * hs, ws, hs) }
  if (theme.fg && glyph !== ' ') { ctx.fillStyle = theme.fg; ctx.fillText(glyph, (x + 0.5) * ws, (y + 1) * hs) }
}

FxSituations.prototype.postProcess = function () {
  if (!this.chain.length) { return }
  const c = this.client
  const ctx = c.context
  const W = c.el.width
  const H = c.el.height
  const termH = (c.tile.hs * 2) + 20
  const gridH = H - termH
  if (gridH <= 0 || W <= 0) { return }

  if (this.off.width !== W || this.off.height !== gridH) { this.off.width = W; this.off.height = gridH }

  const beat = this.getBeatTime()
  const bpmN = (c.clock.speed.value || 120) / 120
  const audio = this.audio.isActive ? this.audio : this.audio.getSimulated(beat)
  const vol0 = Math.min(1, audio.envelope * 2)

  // Fase wave/drop: ogni tanto l'ondulazione si ferma e scatta il pixel dropping
  const now = performance.now()
  if (this.phase === 'wave' && now > this.nextSwitch) {
    this.phase = 'drop'
    this.nextSwitch = now + 700 + Math.random() * 900
  } else if (this.phase === 'drop' && now > this.nextSwitch) {
    this.phase = 'wave'
    this.nextSwitch = now + 3000 + Math.random() * 5000
  }
  if (this.phase === 'drop') {
    this.dropRaw += gridH * 0.025 * (1 + vol0)
    this.dropScroll = Math.floor(this.dropRaw / 10) * 10
  } else {
    this.scroll = (this.scroll + gridH * 0.015 * (0.4 + vol0 * 1.4) * bpmN) % gridH
  }
  const drop = this.phase === 'drop'

  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, W, gridH); ctx.clip()

  for (let ci = 0; ci < this.chain.length; ci++) {
    const f = this.chain[ci]
    this.offCtx.drawImage(c.el, 0, 0, W, gridH, 0, 0, W, gridH)

    const intensity = Math.max(0, Math.min(1, (f.seed || 333) / 666))
    const drive = ((f.drive || 500) / 666) * 4.0
    const bass = Math.min(1, audio.bass * drive)
    const mid = Math.min(1, audio.mid * drive)
    const high = Math.min(1, audio.high * drive)
    const vol = Math.min(1, audio.envelope * drive)

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, gridH)

    const feedback = (f.name === 'datamosh' || f.name === 'glitch' || f.name === 'brokentv')
    if (this.prev && feedback) {
      ctx.globalAlpha = 0.45 + vol * 0.3
      ctx.drawImage(this.prev, 0, 2 + bass * 4)
      ctx.globalAlpha = 1
    }

    // Config DIFFERENZIATE per situazione
    const o = { t: beat, speed: 1.2 * bpmN, curveF: 4.5, ampX: 20, ampY: 14, cols: 18, rows: 12, tear: 0, tearGate: 0.8, quant: false, roll: this.scroll, drop: drop, dropScroll: this.dropScroll, dropAmt: 0.6, tv: 0.5 }
    if (f.name === 'glitch') { // NETTO: linee dure, quasi niente curve
      o.curveF = 1.2; o.ampY = 6; o.ampX = 60 * intensity * (1 + high); o.tear = 150 * intensity * (1 + high); o.tearGate = 0.45; o.cols = 26; o.rows = 10; o.quant = true; o.dropAmt = 1; o.tv = 0.3
    } else if (f.name === 'displace') { // CURVO: fluido, niente tearing
      o.curveF = 7.5; o.ampX = 80 * intensity * (1 + mid); o.ampY = 80 * intensity * (1 + mid); o.tear = 0; o.cols = 24; o.rows = 18; o.tv = 0.15; o.dropAmt = 0.4
    } else if (f.name === 'datamosh') { // PIXEL DROPPING forte
      o.curveF = 3; o.ampX = 50 * intensity; o.ampY = 70 * intensity * (1 + vol); o.roll = this.scroll * 2; o.dropAmt = 1; o.tv = 0.3
    } else if (f.name === 'fracture') { // MACROBLOCCHI duri
      o.curveF = 2; o.ampX = 130 * intensity * (1 + bass); o.ampY = 45 * intensity; o.cols = 9; o.rows = 7; o.quant = true; o.tv = 0.2
    } else if (f.name === 'brokentv') { // Lo stato acquisito
      o.tv = 1; o.dropAmt = 0.6
    }

    this.redrawWarped(ctx, W, gridH, o)
    this.accents(ctx, W, gridH, { intensity: intensity, high: high, bass: bass, beat: beat, tv: o.tv, drop: drop })

    if (feedback) {
      if (!this.prev || this.prev.width !== W || this.prev.height !== gridH) {
        this.prev = document.createElement('canvas'); this.prev.width = W; this.prev.height = gridH
      }
      this.prev.getContext('2d').drawImage(this.off, 0, 0)
    }
  }

  ctx.restore()
}

FxSituations.prototype.redrawWarped = function (ctx, W, gridH, o) {
  const cw = W / o.cols
  const ch = gridH / o.rows
  const tearT = Math.floor(o.t * 4)
  const waveScale = o.drop ? (1 - o.dropAmt) : 1
  for (let r = 0; r < o.rows; r++) {
    const ny = r / o.rows
    const rowWave = Math.sin(ny * o.curveF * 3 + o.t * o.speed * 2) + 0.5 * Math.sin(ny * o.curveF * 7 - o.t * o.speed * 2.6)
    const gn = vnoise(ny * 20, tearT)
    const gate = gn > o.tearGate ? (gn - o.tearGate) / (1 - o.tearGate) : 0
    const tear = (vnoise(ny * 60, tearT * 3.7) - 0.5) * o.tear * gate
    for (let k = 0; k < o.cols; k++) {
      const nx = k / o.cols
      const wx = Math.sin(ny * o.curveF * 4 + o.t * o.speed * 2 + nx * 2)
      const wy = Math.sin(nx * o.curveF * 3 - o.t * o.speed * 1.6 + ny * 2)
      let xoff = (rowWave * 0.6 + wx) * o.ampX * waveScale + tear
      let yoff = wy * o.ampY * waveScale
      yoff += o.drop ? o.dropScroll * (0.3 + ny * 0.7) * o.dropAmt : o.roll * 0.2 * (0.3 + ny)
      if (o.drop || o.quant) {
        xoff = Math.round(xoff / 32) * 32
        yoff = Math.round(yoff / 12) * 12
      }
      let sx = k * cw + xoff
      let sy = r * ch + yoff
      sx = Math.max(0, Math.min(W - cw, sx))
      sy = Math.max(0, Math.min(gridH - ch, sy))
      ctx.drawImage(this.off, sx, sy, cw + 1, ch + 1, k * cw, r * ch, cw + 1, ch + 1)
    }
  }
  // Pixel dropping: strisce orizzontali stirate (pixel sort) con palette magenta/verde
  if (o.drop) {
    const n = 4 + Math.floor(o.dropAmt * 8)
    for (let i = 0; i < n; i++) {
      const hn = vnoise(i * 7.7, Math.floor(o.t * 8))
      const y = Math.floor(hn * gridH)
      const h = 2 + Math.floor(vnoise(i * 3.3, 9.1) * 5)
      const srcW = W * (0.25 + vnoise(i * 5.1, 2.2) * 0.4)
      const x0 = Math.floor(vnoise(i * 8.8, 4.4) * (W - srcW))
      ctx.globalAlpha = 0.5 + o.dropAmt * 0.4
      ctx.drawImage(this.off, x0, y, srcW, h, 0, y + Math.floor(o.dropScroll * 0.2) % 12, W, h)
      ctx.globalCompositeOperation = 'color'
      ctx.globalAlpha = 0.4
      ctx.fillStyle = hcol(hn, ['#ff4fd8', '#4bff5f', '#c81e4e', '#f5efe6'])
      ctx.fillRect(0, y, W, h)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = 1
  }
}

FxSituations.prototype.accents = function (ctx, W, gridH, a) {
  const drips = Math.floor((14 + a.intensity * 20) * (0.5 + a.tv * 0.5))
  for (let i = 0; i < drips; i++) {
    const h1 = vnoise(i * 7.3, 1.7)
    const x = Math.floor(h1 * W)
    const w = 2 + Math.floor(vnoise(i * 3.1, 4.2) * 6)
    const len = 60 + vnoise(i * 5.7, 8.8) * gridH * 0.5
    const y = ((this.scroll * (1 + h1) + h1 * gridH) % (gridH + len)) - len
    ctx.globalAlpha = 0.5 + a.high * 0.4
    ctx.drawImage(this.off, x, 0, w, Math.min(len, gridH), x + (vnoise(i, Math.floor(a.beat * 2)) - 0.5) * 30 * a.intensity, y, w, Math.min(len, gridH))
    ctx.globalCompositeOperation = 'color'
    ctx.globalAlpha = 0.35
    ctx.fillStyle = hcol(h1, this.palette)
    ctx.fillRect(x, Math.max(0, y), w, Math.min(len, gridH))
    ctx.globalCompositeOperation = 'source-over'
  }
  const lines = Math.floor((6 + a.high * 14) * a.tv)
  for (let i = 0; i < lines; i++) {
    const hn = vnoise(i * 11.7, Math.floor(a.beat * 2) * 0.7)
    if (hn < 0.5) { continue }
    const y = Math.floor(hn * gridH)
    const hgt = 1 + Math.floor(vnoise(i * 2.3, 5.5) * 3)
    const x0 = Math.floor(vnoise(i * 9.1, 3.3) * W * 0.6)
    const wl = W * (0.3 + vnoise(i * 4.7, 6.6) * 0.7)
    ctx.globalAlpha = 0.35 + a.high * 0.4
    ctx.fillStyle = hcol(vnoise(i * 13.9, 2.2), this.palette)
    ctx.fillRect(x0, y, wl, hgt)
  }
  if (a.high > 0.35) {
    const off = 6 + a.bass * 14
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.3
    ctx.drawImage(this.off, off, 0)
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.25
    ctx.drawImage(this.off, -off, 0)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = 1
}
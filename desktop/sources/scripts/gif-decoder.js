'use strict'
function decodeGif (bytes) {
  const b = bytes; let p = 0
  const u8 = () => b[p++]
  const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v }
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(b[p + i]); p += n; return s }
  if (str(6).indexOf('GIF') !== 0) { return null }
  const W = u16(), H = u16()
  const packed = u8(); u8(); u8()
  const gctFlag = (packed & 0x80) !== 0
  const gctSize = 2 << (packed & 7)
  let gct = null
  if (gctFlag) { gct = []; for (let i = 0; i < gctSize * 3; i += 3) { gct.push([b[p], b[p + 1], b[p + 2]]); p += 3 } }
  const buf = new Uint8ClampedArray(W * H * 4)
  const frames = []
  let gDelay = 100, gTrans = -1, gDisp = 0
  while (p < b.length) {
    const sep = u8()
    if (sep === 0x3B) { break }
    else if (sep === 0x21) {
      const label = u8()
      if (label === 0xF9) {
        u8(); const f = u8(); gDelay = u16() * 10; gTrans = u8(); u8()
        if (gDelay < 20) { gDelay = 100 }
        gDisp = (f >> 2) & 7
        if ((f & 1) === 0) { gTrans = -1 }
      } else { let len; while ((len = u8()) !== 0) { p += len } }
    }
    else if (sep === 0x2C) {
      const ix = u16(), iy = u16(), iw = u16(), ih = u16()
      const ip = u8()
      const inter = (ip & 0x40) !== 0
      const lctFlag = (ip & 0x80) !== 0
      let pal = gct
      if (lctFlag) { const n = 2 << (ip & 7); pal = []; for (let i = 0; i < n * 3; i += 3) { pal.push([b[p], b[p + 1], b[p + 2]]); p += 3 } }
      const minCode = u8()
      const data = []; let len
      while ((len = u8()) !== 0) { for (let i = 0; i < len; i++) { data.push(b[p + i]) } p += len }
      const idx = lzwDecode(minCode, data)
      const pre = (gDisp === 3) ? buf.slice() : null
      let k = 0
      const rowOrder = inter ? interlaceRows(ih) : null
      for (let ry = 0; ry < ih; ry++) {
        const dy = inter ? rowOrder[ry] : ry
        for (let rx = 0; rx < iw; rx++) {
          const ci = idx[k++]
          if (ci === undefined) { break }
          if (ci === gTrans) { continue }
          const c = pal ? pal[ci] : null
          if (!c) { continue }
          const o = ((iy + dy) * W + (ix + rx)) * 4
          buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255
        }
      }
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H
      cv.getContext('2d').putImageData(new ImageData(buf, W, H), 0, 0)
      frames.push({ canvas: cv, delay: gDelay })
      if (gDisp === 2) { for (let ry = 0; ry < ih; ry++) { for (let rx = 0; rx < iw; rx++) { const o = ((iy + ry) * W + (ix + rx)) * 4; buf[o + 3] = 0 } } }
      else if (gDisp === 3 && pre) { buf.set(pre) }
      gTrans = -1; gDisp = 0
    }
    else { p++ }
  }
  return { width: W, height: H, frames: frames }
}
function interlaceRows (h) {
  const rows = new Array(h); let r = 0
  for (let pass = 0; pass < 4; pass++) {
    const start = [0, 4, 2, 1][pass]; const step = [8, 8, 4, 2][pass]
    for (let y = start; y < h; y += step) { rows[r++] = y }
  }
  return rows
}
function lzwDecode (minCodeSize, data) {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  const dict = []
  for (let i = 0; i < clearCode; i++) { dict[i] = [i] }
  dict[clearCode] = []; dict[eoiCode] = []
  const out = []
  let prev = null
  let bitBuf = 0, bitCnt = 0, di = 0
  const readCode = () => {
    while (bitCnt < codeSize) {
      if (di >= data.length) { return eoiCode }
      bitBuf |= data[di++] << bitCnt
      bitCnt += 8
    }
    const code = bitBuf & ((1 << codeSize) - 1)
    bitBuf >>= codeSize; bitCnt -= codeSize
    return code
  }
  while (true) {
    const code = readCode()
    if (code === eoiCode) { break }
    if (code === clearCode) {
      codeSize = minCodeSize + 1; nextCode = eoiCode + 1
      for (let i = 0; i < clearCode; i++) { dict[i] = [i] }
      prev = null; continue
    }
    let entry
    if (dict[code]) { entry = dict[code] }
    else if (code === nextCode && prev) { entry = prev.concat(prev[0]) }
    else { break }
    for (let i = 0; i < entry.length; i++) { out.push(entry[i]) }
    if (prev) { dict[nextCode++] = prev.concat(entry[0]) }
    if (nextCode >= (1 << codeSize) && codeSize < 12) { codeSize++ }
    prev = entry
  }
  return out
}
// --- GIF DECODER CLASS with MIDI control ---
function GifDecoder (client) {
  this.client = client
  this.midiNote = { note: 0, channel: 0 }
  this.midiCC = new Array(16)
  for (let i = 0; i < 16; i++) {
    this.midiCC[i] = new Array(128).fill(0)
  }

  this.onMidiNote = function (channel, note, velocity) {
    // In ascolto su TUTTI i canali MIDI (0-15)
    // Ogni nota = nuovo GIF swarm. Velocity = size
    var sizeFactor = velocity / 127;
    this.pendingGifSize = 0.3 + sizeFactor * 2.2; // scala 0.3..2.5
    var tagKey = this.client.tags[(note + channel * 3) % this.client.tags.length];
    if (this.client.background) {
      this.client.background.gifScale = this.pendingGifSize;
      this.client.background.loadSwarmByTag(tagKey);
    }
    console.log('GIF MIDI note:', { note: note, vel: velocity, size: this.pendingGifSize, tag: tagKey });
  }

  this.onMidiCC = function (channel, cc, value) {
    // CC disabilitati — solo note attivi
  }
}

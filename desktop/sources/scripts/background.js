'use strict'

function Background (client) {
  this.client = client
  this.mode = 'none'
  this.video = null
  this.layers = []
  this.swarm = null
  this.autoTimer = null
  this.autoUntil = 0
  this.lastT = 0
  this.localDir = '/Users/moo/Orca/backgrounds'
  this.tags = ['ambiente', 'politica', 'storia', 'sport', 'cultura', 'arte', 'insetti', 'tatuaggi', 'gore', 'cibo', 'sextoys', 'sacro', 'complotti', 'cartoni', 'fumetti', 'famosi', 'cantanti', 'attrici']
  this.commonsTags = {
    ambiente: 'nature landscape', politica: 'politics', storia: 'history', sport: 'sport',
    cultura: 'culture', arte: 'art', insetti: 'insects', tatuaggi: 'tattoo', gore: 'horror',
    cibo: 'food', sextoy: 'sex toy', sacro: 'religious ceremony', complotti: 'conspiracy',
    cartoni: 'cartoon', fumetti: 'comic', famosi: 'celebrity', cantanti: 'singer', attrici: 'actress'
  }
}

Background.prototype.pickTag = function () {
  return this.tags[Math.floor(Math.random() * this.tags.length)]
}

// === WIKIMEDIA COMMONS (primario) ===
Background.prototype.fetchCommons = function (tag, wantGif) {
  const q = this.commonsTags[tag] || tag
  const search = (wantGif ? 'filetype:video ' : 'filetype:bitmap ') + q
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=' + encodeURIComponent(search) + '&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|name&iiurlwidth=900'
  fetch(url).then(r => r.json()).then(json => {
    const pages = json.query && json.query.pages
    if (!pages) { throw new Error('no pages') }
    const urls = []
    for (const k in pages) {
      const ii = pages[k].imageinfo && pages[k].imageinfo[0]
      if (!ii) { continue }
      if (wantGif) {
        if (/\.gif$/i.test(ii.name || ii.url)) { urls.push(ii.url) }
      } else {
        if (/\.(jpg|jpeg|png)$/i.test(ii.url || '')) { urls.push(ii.thumburl || ii.url) }
      }
    }
    if (!urls.length) { throw new Error('none') }
    const src = urls[Math.floor(Math.random() * urls.length)]
    if (wantGif) { this.setSwarmImg(src) } else { this.addLayerFromUrl(src) }
  }).catch(() => {
    if (wantGif) { this.tryGiphy() } else { this.fetchArchive() }
  })
}

// === ARCHIVE.ORG (secondario, tag in inglese) ===
Background.prototype.fetchArchive = function () {
  const tag = this.commonsTags[this.pickTag()] || 'history'
  const wantVideo = Math.random() > 0.75
  const mt = wantVideo ? 'movies' : 'image'
  const q = encodeURIComponent(`subject:(${tag}) AND mediatype:(${mt})`)
  fetch(`https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&rows=50&page=1&output=json`)
    .then(r => r.json())
    .then(json => {
      const docs = json.response && json.response.docs
      if (!docs || !docs.length) { throw new Error('no docs') }
      const id = docs[Math.floor(Math.random() * docs.length)].identifier
      return fetch(`https://archive.org/metadata/${id}`).then(r => r.json()).then(meta => {
        const files = meta.files || []
        const vids = files.filter(f => /\.(mp4|ogv)$/.test(f.name))
        const imgs = files.filter(f => /\.(jpg|jpeg|png)$/.test(f.name))
        if (wantVideo && vids.length) {
          const f = vids[Math.floor(Math.random() * vids.length)]
          this.setVideo('https://archive.org/download/' + id + '/' + encodeURIComponent(f.name))
        } else if (imgs.length) {
          const f = imgs[Math.floor(Math.random() * imgs.length)]
          this.addLayerFromUrl('https://archive.org/download/' + id + '/' + encodeURIComponent(f.name))
        } else { throw new Error('no files') }
      })
    })
    .catch(() => { this.loadWeb() })
}

Background.prototype.loadWeb = function () {
  const seed = this.pickTag() + Math.floor(Math.random() * 1000)
  this.addLayerFromUrl('https://picsum.photos/seed/' + seed + '/960/720')
}

Background.prototype.addLayerFromUrl = function (src) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { this.addLayer(img) }
  img.onerror = () => { this.loadWeb() }
  img.src = src
}

Background.prototype.loadBackground = function () {
  try {
    const fs = require('fs')
    const path = require('path')
    const files = fs.readdirSync(this.localDir).filter(f => /\.(png|jpe?g|gif|webp|mp4|webm|ogv)$/i.test(f))
    if (files.length) {
      const f = files[Math.floor(Math.random() * files.length)]
      const url = 'file://' + path.join(this.localDir, f)
      if (/\.(mp4|webm|ogv)$/i.test(f)) { this.setVideo(url); return }
      const img = new Image()
      img.onload = () => { this.addLayer(img) }
      img.src = url
      return
    }
  } catch (e) {}
  const n = Math.random() < 0.5 ? 1 : 1 + Math.floor(Math.random() * 7)
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.7) { this.fetchCommons(this.pickTag(), false) } else { this.fetchArchive() }
  }
}

Background.prototype.startAuto = function () {
  this.stopAuto()
  this.autoUntil = Date.now() + 60000
  this.loadBackground()
  this.autoTimer = setInterval(() => {
    if (Date.now() > this.autoUntil) { this.stopAuto(); return }
    this.loadBackground()
  }, 30000)
}

Background.prototype.stopAuto = function () {
  if (this.autoTimer) { clearInterval(this.autoTimer); this.autoTimer = null }
}

Background.prototype.setVideo = function (url) {
  if (!this.video) {
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.loop = true
    this.video.playsInline = true
  }
  if (/^https?:/.test(url)) { this.video.crossOrigin = 'anonymous' }
  this.video.src = url
  this.video.play().catch(() => {})
  this.mode = 'video'
  this.layers = []
}

Background.prototype.addLayer = function (img) {
  if (!img.naturalWidth) { return }
  const W = this.client.el.width
  const H = this.client.el.height
  const scale = (0.25 + Math.random() * 0.45) * H / img.naturalHeight
  this.layers.push({
    img: img,
    x: Math.random() * W,
    y: Math.random() * H,
    w: img.naturalWidth * scale,
    h: img.naturalHeight * scale,
    vx: (Math.random() > 0.5 ? 1 : -1) * (90 + Math.random() * 180),
    vy: (Math.random() - 0.5) * 70,
    jx: 0, jy: 0, flick: 0
  })
  while (this.layers.length > 7) { this.layers.shift() }
  this.mode = 'layers'
  if (this.video) { this.video.pause() }
}

Background.prototype.draw = function (ctx, W, H) {
  const now = performance.now()
  const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000)
  this.lastT = now

  if (this.mode === 'video' && this.video) {
    const sw = this.video.videoWidth
    const sh = this.video.videoHeight
    if (sw && sh) {
      const scale = Math.min(W / sw, H / sh)
      ctx.save()
      ctx.globalAlpha = 0.85
      ctx.drawImage(this.video, (W - sw * scale) / 2, (H - sh * scale) / 2, sw * scale, sh * scale)
      ctx.restore()
    }
    return
  }

  for (let i = 0; i < this.layers.length; i++) {
    const L = this.layers[i]
    L.x += L.vx * dt
    L.y += L.vy * dt
    if (L.x > W) { L.x = -L.w } if (L.x + L.w < 0) { L.x = W }
    if (L.y > H) { L.y = -L.h } if (L.y + L.h < 0) { L.y = H }
    if (!L.flick || now > L.flick) {
      L.jx = (Math.random() - 0.5) * 10
      L.jy = (Math.random() - 0.5) * 8
      L.flick = now + 60 + Math.random() * 120
    }
    ctx.save()
    ctx.globalAlpha = 0.8
    ctx.drawImage(L.img, L.x + L.jx, L.y + L.jy, L.w, L.h)
    ctx.restore()
  }
}

// === STORMO BOIDS (Alt+G) — più spaziato ===
Background.prototype.loadSwarm = function () {
  let src = null
  try {
    const fs = require('fs')
    const path = require('path')
    const gifs = fs.readdirSync(this.localDir).filter(f => /\.gif$/i.test(f))
    if (gifs.length) { src = 'file://' + path.join(this.localDir, gifs[Math.floor(Math.random() * gifs.length)]) }
  } catch (e) {}
  if (src) { this.setSwarmImg(src); return }
  // Prima Commons (gif reali), poi giphy
  this.fetchCommons(this.pickTag(), true)
}

Background.prototype.tryGiphy = function () {
  const ids = ['3o7aCTfyEawdYEfr7W', 'l0HlQ7lr2wcHs0Bte', 'xT9IgGIlGtl8Gt0QaQ', 'l0MYt5b5J1m41XQxy', '3o6Zt6MLr1vAIs9bTG']
  const id = ids[Math.floor(Math.random() * ids.length)]
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { this.initSwarm(img) }
  img.onerror = () => { this.fetchCommons('cartoni', true) }
  img.src = 'https://media.giphy.com/media/' + id + '/giphy.gif'
}

Background.prototype.setSwarmImg = function (src) {
  const img = new Image()
  if (/^https?:/.test(src)) { img.crossOrigin = 'anonymous' }
  img.onload = () => { this.initSwarm(img) }
  img.onerror = () => { this.tryGiphy() }
  img.src = src
}

Background.prototype.initSwarm = function (img) {
  const W = this.client.el.width
  const H = this.client.el.height
  const boids = []
  const cx = W * (0.3 + Math.random() * 0.4)
  const cy = H * (0.3 + Math.random() * 0.4)
  for (let i = 0; i < 17; i++) {
    boids.push({
      x: cx + (Math.random() - 0.5) * 350,
      y: cy + (Math.random() - 0.5) * 250,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4
    })
  }
  this.swarm = { img: img, boids: boids, nextTeleport: Date.now() + 6000 + Math.random() * 8000 }
}

Background.prototype.stepSwarm = function (W, H, bass) {
  const s = this.swarm
  const now = Date.now()
  if (now > s.nextTeleport) {
    const dx = (Math.random() - 0.5) * W * 0.8
    const dy = (Math.random() - 0.5) * H * 0.6
    for (let i = 0; i < s.boids.length; i++) { s.boids[i].x += dx; s.boids[i].y += dy }
    s.nextTeleport = now + 6000 + Math.random() * 9000
  }
  const R = 170
  for (let i = 0; i < s.boids.length; i++) {
    const b = s.boids[i]
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0
    for (let j = 0; j < s.boids.length; j++) {
      if (j === i) { continue }
      const o = s.boids[j]
      const dx = o.x - b.x
      const dy = o.y - b.y
      const d = Math.hypot(dx, dy)
      if (d < R) {
        n++
        // Separazione forte e a largo raggio
        if (d < 90 && d > 0) { sx -= (dx / d) * (1 - d / 90); sy -= (dy / d) * (1 - d / 90) }
        ax += o.vx; ay += o.vy
        cx += o.x; cy += o.y
      }
    }
    if (n) {
      b.vx += sx * 0.22 + (ax / n - b.vx) * 0.02 + (cx / n - b.x) * 0.0008
      b.vy += sy * 0.22 + (ay / n - b.vy) * 0.02 + (cy / n - b.y) * 0.0008
    }
    b.vx += (Math.random() - 0.5) * 0.12
    b.vy += (Math.random() - 0.5) * 0.12
    if (b.x < 60) { b.vx += 0.2 } if (b.x > W - 60) { b.vx -= 0.2 }
    if (b.y < 60) { b.vy += 0.2 } if (b.y > H - 120) { b.vy -= 0.2 }
    const sp = Math.hypot(b.vx, b.vy) || 0.001
    const max = 4.5 + bass * 4
    const min = 1.8
    if (sp > max) { b.vx = b.vx / sp * max; b.vy = b.vy / sp * max }
    if (sp < min) { b.vx = b.vx / sp * min; b.vy = b.vy / sp * min }
    b.x += b.vx * (1 + bass)
    b.y += b.vy * (1 + bass)
  }
}

Background.prototype.drawSwarm = function (ctx, W, H) {
  if (!this.swarm) { return }
  const img = this.swarm.img
  if (!img.naturalWidth) { return }
  const bass = this.client.audioReactor ? (this.client.audioReactor.bass || 0) : 0
  this.stepSwarm(W, H, bass)
  const th = 90
  const sc = th / img.naturalHeight
  const dw = img.naturalWidth * sc
  ctx.save()
  ctx.globalAlpha = 0.9
  for (let i = 0; i < this.swarm.boids.length; i++) {
    const b = this.swarm.boids[i]
    ctx.drawImage(img, b.x - dw / 2, b.y - th / 2, dw, th)
  }
  ctx.restore()
}

Background.prototype.off = function () {
  this.stopAuto()
  this.mode = 'none'
  this.layers = []
  this.swarm = null
  if (this.video) { this.video.pause() }
}
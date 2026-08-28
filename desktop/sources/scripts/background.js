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
  this.localUsed = 0
  this.gifTries = 0
  this.localDir = '/Users/moo/Orca/backgrounds'
  // Chiavi tag + varianti EN / ES / FR (usate per gif, immagini e video)
  this.tagKeys = ['ambiente', 'politica', 'storia', 'sport', 'cultura', 'arte', 'insetti', 'tatuaggi', 'gore', 'cibo', 'sextoys', 'sacro', 'complotti', 'cartoni', 'fumetti', 'famosi', 'cantanti', 'attrici', 'concerti', 'musica', 'macchine', 'sportestremi', 'viaggi', 'soldi', 'religione', 'battlerobots']
  this.commonsTags = {
    ambiente: ['nature landscape', 'paisaje natural', 'paysage naturel'],
    politica: ['politics', 'política', 'politique'],
    storia: ['history', 'historia', 'histoire'],
    sport: ['sport', 'deporte', 'sport'],
    cultura: ['culture', 'cultura', 'culture'],
    arte: ['art', 'arte', 'art'],
    insetti: ['insects', 'insectos', 'insectes'],
    tatuaggi: ['tattoo', 'tatuaje', 'tatouage'],
    gore: ['horror', 'terror', 'horreur'],
    cibo: ['food', 'comida', 'nourriture'],
    sextoy: ['sex toy', 'juguete sexual', 'sex toy'],
    sacro: ['religious ceremony', 'ceremonia religiosa', 'cérémonie religieuse'],
    complotti: ['conspiracy', 'conspiración', 'complot'],
    cartoni: ['cartoon', 'dibujos animados', 'dessin animé'],
    fumetti: ['comic', 'cómic', 'bande dessinée'],
    famosi: ['celebrity', 'celebridad', 'célébrité'],
    cantanti: ['singer', 'cantante', 'chanteur'],
    attrici: ['actress', 'actriz', 'actrice'],
    concerti: ['concert poster', 'cartel de concierto', 'affiche de concert'],
    musica: ['music poster', 'cartel de música', 'affiche de musique'],
    macchine: ['car', 'coche', 'voiture'],
    sportestremi: ['extreme sports', 'deportes extremos', 'sports extrêmes'],
    viaggi: ['travel', 'viaje', 'voyage'],
    soldi: ['money', 'dinero', 'argent'],
    religione: ['religion', 'religión', 'religion'],
    battlerobots: ['battle robot', 'robot de combate', 'robot de combat']
  }
  // Unico database GIF: solo Giphy, ogni voce agganciata a una tag
  this.gifDatabase = [
    { url: 'https://media.giphy.com/media/l0HlNQ03J5JxX2rza/giphy.gif', tag: 'cartoni' },
    { url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', tag: 'musica' },
    { url: 'https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif', tag: 'gore' },
    { url: 'https://media.giphy.com/media/xT0xeJpnrWC3XWblEk/giphy.gif', tag: 'sport' },
    { url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', tag: 'famosi' },
    { url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', tag: 'macchine' },
    { url: 'https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif', tag: 'viaggi' },
    { url: 'https://media.giphy.com/media/l4FGuhL4U2WS8lkli/giphy.gif', tag: 'arte' },
    { url: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif', tag: 'insetti' },
    { url: 'https://media.giphy.com/media/3oKIPnAiaMCp8dO5Z6/giphy.gif', tag: 'cibo' },
    { url: 'https://media.giphy.com/media/l0HlBOQeyd6VteGZq/giphy.gif', tag: 'concerti' },
    { url: 'https://media.giphy.com/media/l3q2Wl7Wpz09amZni/giphy.gif', tag: 'sportestremi' },
    { url: 'https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif', tag: 'battlerobots' },
    { url: 'https://media.giphy.com/media/l0MYEqEzwMWFCg8rm/giphy.gif', tag: 'complotti' },
    { url: 'https://media.giphy.com/media/l0HlNQ03J5JxX2rza/giphy.gif', tag: 'tatuaggi' }
  ]
}

// Una chiave tag a caso
Background.prototype.pickTagKey = function () {
  return this.tagKeys[Math.floor(Math.random() * this.tagKeys.length)]
}

// Una lingua a caso (EN/ES/FR) per la ricerca di immagini e video
Background.prototype.pickTag = function () {
  const key = this.pickTagKey()
  const list = this.commonsTags[key]
  return list[Math.floor(Math.random() * list.length)]
}

Background.prototype.fetchCommons = function (tag, kind) {
  const search = (kind === 'video' ? 'filetype:video ' : 'filetype:bitmap ') + tag
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=' + encodeURIComponent(search) + '&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|name&iiurlwidth=900'
  fetch(url).then(r => r.json()).then(json => {
    const pages = json.query && json.query.pages
    if (!pages) { throw new Error('no pages') }
    const urls = []
    for (const k in pages) {
      const ii = pages[k].imageinfo && pages[k].imageinfo[0]
      if (!ii) { continue }
      const name = (ii.name || ii.url || '').toLowerCase()
      if (kind === 'video' && /\.(mp4|ogv)$/.test(name)) { urls.push(ii.url) }
      else if (kind === 'img' && /\.(jpg|jpeg|png)$/.test(name)) { urls.push(ii.thumburl || ii.url) }
    }
    if (!urls.length) { throw new Error('none') }
    const src = urls[Math.floor(Math.random() * urls.length)]
    if (kind === 'video') { this.addVideoLayer(src) } else { this.addLayerFromUrl(src) }
  }).catch(() => { this.fetchArchive() })
}

// STORMO: una sola GIF da Giphy (scelta con la tag), replicata 17 volte
Background.prototype.loadSwarm = function () {
  let src = null
  try {
    const fs = require('fs')
    const path = require('path')
    const gifs = fs.readdirSync(this.localDir).filter(f => /\.gif$/i.test(f))
    if (gifs.length) { src = 'file://' + path.join(this.localDir, gifs[Math.floor(Math.random() * gifs.length)]) }
  } catch (e) {}
  if (src) { this.setSwarmImg(src); return }

  const key = this.pickTagKey()
  let pool = this.gifDatabase.filter(g => g.tag === key)
  if (!pool.length) { pool = this.gifDatabase }
  const entry = pool[Math.floor(Math.random() * pool.length)]
  this.gifTries = 0
  this.setSwarmImg(entry.url)
}

Background.prototype.setSwarmImg = function (src) {
  const img = new Image()
  if (/^https?:/.test(src)) { img.crossOrigin = 'anonymous' }
  img.onload = () => { this.gifTries = 0; this.initSwarm(img) }
  img.onerror = () => {
    this.gifTries++
    if (this.gifTries > 5) {
      console.warn('Swarm', 'giphy non risponde, riprova piu tardi')
      this.gifTries = 0
      return
    }
    const entry = this.gifDatabase[Math.floor(Math.random() * this.gifDatabase.length)]
    this.setSwarmImg(entry.url)
  }
  img.src = src
}

// 17 boids che replicano la stessa gif
Background.prototype.initSwarm = function (img) {
  const W = this.client.el.width
  const H = this.client.el.height
  const boids = []
  const cx = W * (0.3 + Math.random() * 0.4)
  const cy = H * (0.3 + Math.random() * 0.4)
  for (let i = 0; i < 17; i++) {
    boids.push({ x: cx + (Math.random() - 0.5) * 350, y: cy + (Math.random() - 0.5) * 250, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 })
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
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < R) {
        n++
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
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 0.001
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
  ctx.save(); ctx.globalAlpha = 0.9
  for (let i = 0; i < this.swarm.boids.length; i++) {
    const b = this.swarm.boids[i]
    ctx.drawImage(img, b.x - dw / 2, b.y - th / 2, dw, th)
  }
  ctx.restore()
}

Background.prototype.fetchArchive = function () {
  const tag = this.pickTag()
  const wantVideo = Math.random() > 0.6
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
          this.addVideoLayer('https://archive.org/download/' + id + '/' + encodeURIComponent(vids[Math.floor(Math.random() * vids.length)].name))
        } else if (imgs.length) {
          this.addLayerFromUrl('https://archive.org/download/' + id + '/' + encodeURIComponent(imgs[Math.floor(Math.random() * imgs.length)].name))
        } else { throw new Error('no files') }
      })
    })
    .catch(() => { this.addLayerFromUrl('https://picsum.photos/seed/' + this.pickTag() + Math.floor(Math.random() * 1000) + '/960/720') })
}

Background.prototype.loadBackground = function () {
  let files = []
  try {
    const fs = require('fs')
    const path = require('path')
    files = fs.readdirSync(this.localDir).filter(f => /\.(png|jpe?g|gif|webp|mp4|webm|ogv)$/i.test(f))
  } catch (e) {}
  if (files.length && this.localUsed < 3) {
    this.localUsed++
    const n = Math.min(files.length, 1 + Math.floor(Math.random() * 3))
    for (let i = 0; i < n; i++) {
      const f = files[Math.floor(Math.random() * files.length)]
      const url = 'file://' + require('path').join(this.localDir, f)
      if (/\.(mp4|webm|ogv)$/i.test(f)) { this.addVideoLayer(url) } else { this.addLocalImg(url) }
    }
    return
  }
  const n = Math.random() < 0.5 ? 1 : 1 + Math.floor(Math.random() * 7)
  for (let i = 0; i < n; i++) {
    const r = Math.random()
    if (r < 0.45) { this.fetchCommons(this.pickTag(), 'img') }
    else if (r < 0.75) { this.fetchCommons(this.pickTag(), 'video') }
    else { this.fetchArchive() }
  }
}

Background.prototype.addLocalImg = function (url) {
  const img = new Image()
  img.onload = () => { this.addLayer(img) }
  img.src = url
}

Background.prototype.addLayerFromUrl = function (src) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { this.addLayer(img) }
  img.onerror = () => { this.fetchArchive() }
  img.src = src
}

Background.prototype.makeSpeed = function () {
  const r = Math.random()
  let v
  if (r < 0.35) { v = 30 + Math.random() * 60 }
  else if (r < 0.75) { v = 120 + Math.random() * 160 }
  else { v = 350 + Math.random() * 450 }
  if (Math.random() > 0.5) { v = -v }
  return v
}

Background.prototype.addVideoLayer = function (url) {
  const v = document.createElement('video')
  v.muted = true; v.loop = true; v.playsInline = true
  if (/^https?:/.test(url)) { v.crossOrigin = 'anonymous' }
  v.onloadedmetadata = () => {
    const W = this.client.el.width
    const H = this.client.el.height
    if (!v.videoHeight) { return }
    const scale = (0.25 + Math.random() * 0.45) * H / v.videoHeight
    const vx = this.makeSpeed()
    this.layers.push({ type: 'video', img: v, x: Math.random() * W, y: Math.random() * H, w: v.videoWidth * scale, h: v.videoHeight * scale, vx: vx, vy: (Math.random() - 0.5) * 70, jx: 0, jy: 0, flick: 0, fast: Math.abs(vx) > 300 })
    while (this.layers.length > 7) { const old = this.layers.shift(); if (old.type === 'video') { old.img.pause() } }
    this.mode = 'layers'
    v.play().catch(() => {})
  }
  v.onerror = () => { this.fetchArchive() }
  v.src = url
}

Background.prototype.addLayer = function (img) {
  if (!img.naturalWidth) { return }
  const W = this.client.el.width
  const H = this.client.el.height
  const scale = (0.25 + Math.random() * 0.45) * H / img.naturalHeight
  const vx = this.makeSpeed()
  this.layers.push({ type: 'img', img: img, x: Math.random() * W, y: Math.random() * H, w: img.naturalWidth * scale, h: img.naturalHeight * scale, vx: vx, vy: (Math.random() - 0.5) * 70, jx: 0, jy: 0, flick: 0, fast: Math.abs(vx) > 300 })
  while (this.layers.length > 7) { const old = this.layers.shift(); if (old.type === 'video') { old.img.pause() } }
  this.mode = 'layers'
  if (this.video) { this.video.pause() }
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
    this.video.muted = true; this.video.loop = true; this.video.playsInline = true
  }
  if (/^https?:/.test(url)) { this.video.crossOrigin = 'anonymous' }
  this.video.src = url
  this.video.play().catch(() => {})
  this.mode = 'video'
  this.layers = []
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
      ctx.save(); ctx.globalAlpha = 0.85
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
    if (!L.fast && (!L.flick || now > L.flick)) {
      L.jx = (Math.random() - 0.5) * 5
      L.jy = (Math.random() - 0.5) * 4
      L.flick = now + 120 + Math.random() * 200
    } else if (L.fast) { L.jx = 0; L.jy = 0 }
    ctx.save(); ctx.globalAlpha = 0.8
    ctx.drawImage(L.img, L.x + L.jx, L.y + L.jy, L.w, L.h)
    ctx.restore()
  }
}

Background.prototype.off = function () {
  this.stopAuto()
  this.mode = 'none'
  for (let i = 0; i < this.layers.length; i++) { if (this.layers[i].type === 'video') { this.layers[i].img.pause() } }
  this.layers = []
  this.swarm = null
  if (this.video) { this.video.pause() }
}
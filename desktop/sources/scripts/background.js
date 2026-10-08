'use strict'
function Background (client) {
  this.client = client
  this.mode = 'none'; this.video = null; this.layers = []; this.swarm = null
  this.webcam = null; this.webcamStream = null
  this.autoTimer = null; this.autoUntil = 0; this.lastT = 0; this.localUsed = 0
  this.gifSourceIndex = 0; this.gifHost = null; this.swarmAuto = null
  // Cartella locale di background/GIF (OPZIONALE). Di default nessuna: si usa
  // la rete (Giphy/Commons) o i frame procedurali. Impostala con bgdir:<path>.
  this.localDir = null
  try { this.localDir = window.localStorage.getItem('bg_dir') || null } catch (e) { this.localDir = null }
  // Chiave Giphy (OPZIONALE). NON è nel repo: creane una gratuita su
  // developers.giphy.com e impostala con  giphykey:<LA_TUA_KEY>.
  // Senza chiave il swarm passa a Commons e poi ai frame procedurali.
  this.giphyKey = null
  try { this.giphyKey = window.localStorage.getItem('giphy_key') || null } catch (e) { this.giphyKey = null }
  this.tagKeys = ['pokemon','merda','1312','michale jackson','twin peaks','gatti','simpson','rick and morty','the office','friends','south park',
    'liminal space','horror vacui','cyberfeminism','cyberdeck','hacktivism','hacker','matrix','red pill','blue pill','sex workers','demons',
    'lucifer','satan','esoterism','ai','ki','solar opposites','brickleberry','futurama']
  this.commonsTags = {
    pokemon: ['pokemon','pikachu','charizard','pokemon battle'],
    merda: ['shit','poop','crap','merda'],
    '1312': ['1312','acab','police','riot'],
    'michale jackson': ['michael jackson','mj','thriller','moonwalk'],
    'twin peaks': ['twin peaks','david lynch','cooper','black lodge'],
    gatti: ['cat','kitten','felix','cat meme'],
    simpson: ['simpson','homer','bart','simpsons'],
    'rick and morty': ['rick and morty','rick','morty','pickle rick'],
    'the office': ['the office','michael scott','dwight','office'],
    friends: ['friends','rachel','monica','joey'],
    'south park': ['south park','cartman','kenny','stan'],
    'liminal space': ['liminal space','liminal','backrooms','vaporwave corridor'],
    'horror vacui': ['horror vacui','busy pattern','dense ornament','maximalism'],
    cyberfeminism: ['cyberfeminism','cyber feminist','glitch feminism','vns matrix'],
    cyberdeck: ['cyberdeck','cyberpunk computer','hacker deck','raspberry pi cyberdeck'],
    hacktivism: ['hacktivism','anonymous','hacker protest','activist hacking'],
    hacker: ['hacker','computer hacker','matrix code','hoodie hacker'],
    matrix: ['matrix','matrix code','green rain','digital rain'],
    'red pill': ['red pill','matrix red pill','pill','awakening'],
    'blue pill': ['blue pill','matrix blue pill','pill','ignorance'],
    'sex workers': ['sex worker','sex workers rights','activist','solidarity'],
    demons: ['demon','devil','dark entity','horror demon'],
    lucifer: ['lucifer','fallen angel','morning star','light bringer'],
    satan: ['satan','devil','baphomet','occult'],
    esoterism: ['esoterism','esoteric','occult symbol','mysticism'],
    ai: ['artificial intelligence','ai','neural network','robot'],
    ki: ['künstliche intelligenz','ki','artificial intelligence','robot'],
    'solar opposites': ['solar opposites','korvo','terry','alien'],
    brickleberry: ['brickleberry','brickleberry cartoon','steve williams','comedy central cartoon'],
    futurama: ['futurama','fry','bender','futurama robot']
  }
  // MIDI control intervals
  this.imageBackgroundInterval = 30000; // default 30 seconds
  this.swarmInterval = 8000; // default 8 seconds
}

// Chiave Giphy: si salva in localStorage, NON nel repo (era hardcoded).
Background.prototype.setGiphyKey = function (k) {
  this.giphyKey = (k || '').trim() || null
  try {
    if (this.giphyKey) window.localStorage.setItem('giphy_key', this.giphyKey)
    else window.localStorage.removeItem('giphy_key')
  } catch (e) {}
  console.log('[Background] Giphy key', this.giphyKey ? 'impostata' : 'rimossa')
  return !!this.giphyKey
}

// Cartella locale di background/GIF (opzionale)
Background.prototype.setLocalDir = function (d) {
  this.localDir = (d || '').trim() || null
  try {
    if (this.localDir) window.localStorage.setItem('bg_dir', this.localDir)
    else window.localStorage.removeItem('bg_dir')
  } catch (e) {}
  console.log('[Background] cartella locale:', this.localDir || '(nessuna)')
  return this.localDir
}

Background.prototype.pickTagKey = function () {
  const keys = this.tagKeys || Object.keys(this.commonsTags || {})
  return keys[Math.floor(Math.random() * keys.length)] || 'storia'
}

Background.prototype.pickTag = function () {
  const key = this.pickTagKey()
  const entry = this.commonsTags ? this.commonsTags[key] : null
  if (!entry) { return key }
  if (typeof entry === 'string') { return entry }
  return entry[Math.floor(Math.random() * entry.length)] || key
}

// --- METODI PER TAG ---
Background.prototype.loadBackgroundByTag = function(tag) {
  const entry = this.commonsTags[tag]
  if (!entry) { this.loadBackground(); return }
  const searchTerm = Array.isArray(entry) ? entry[Math.floor(Math.random() * entry.length)] : entry
  this.fetchCommons(searchTerm, 'img')
}

Background.prototype.loadSwarmByTag = function(tag) {
  const entry = this.commonsTags[tag]
  if (!entry) { this.loadSwarm(); return }
  const searchTerm = Array.isArray(entry) ? entry[Math.floor(Math.random() * entry.length)] : entry
  this.gifSourceIndex = 0
  this.fetchGiphy(searchTerm)
}

Background.prototype.httpGet = function (url, cb, eb, redirects) {
  redirects = redirects || 0
  // Renderer sandbox: niente Buffer/require. Uso fetch + Uint8Array/TextDecoder.
  // Net.fetch applica un timeout: senza di esso una CDN lenta blocca la coda.
  const ctl = Net.controller('bg-http') || Net.begin('bg-http')
  Net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctl.signal }, 5000)
    .then((res) => {
      if (res.status >= 300 && res.status < 400 && res.headers.get('location') && redirects < 5) {
        this.httpGet(res.headers.get('location'), cb, eb, redirects + 1); return
      }
      if (res.status !== 200) { eb(); return }
      res.arrayBuffer().then((ab) => cb(new Uint8Array(ab))).catch(eb)
    })
    .catch(() => eb())
}

Background.prototype.fetchText = function (url, cb, eb) {
  this.httpGet(url, (u8) => { try { cb(new TextDecoder('utf-8').decode(u8)) } catch (e) { eb() } }, eb)
}
Background.prototype.fetchJSON = function (url, cb, eb) { this.fetchText(url, (t) => { try { cb(JSON.parse(t)) } catch (e) { eb() } }, eb) }

Background.prototype.loadSwarm = async function () {
  if (!this.swarmAuto) { this.swarmAuto = setInterval(() => { this.loadSwarm() }, 8000) }
  let src = null
  try {
    if (window.api && window.api.fs && this.localDir) {
      // readdirSync è async (IPC invoke) → await
      const gifs = (await window.api.fs.readdirSync(this.localDir)).filter(f => /\.gif$/i.test(f))
      if (gifs.length) { src = 'file://' + this.localDir + '/' + gifs[Math.floor(Math.random() * gifs.length)] }
    }
  } catch (e) {}
  if (src) { this.setSwarmData(src); return }
  this.gifSourceIndex = 0
  this.tryNextGifSource()
}

Background.prototype.tryNextGifSource = function () {
  const en = this.commonsTags[this.pickTagKey()]
  const enTag = Array.isArray(en) ? en[0] : (en || 'art')
  // Giphy PRIMARIA (GIF piccole fixed_height_small, decodifica nativa browser).
  // Commons solo fallback. Le key pubbliche Giphy possono dare 429 → fallback.
  const sources = ['giphy', 'commons', 'procedural']
  if (this.gifSourceIndex >= sources.length) {
    console.warn('Swarm', 'rete non disponibile: uso frame procedurali')
    this.gifSourceIndex = 0
    this.initSwarmFrames(this.makeProceduralFrames())
    return
  }
  const s = sources[this.gifSourceIndex++]
  if (s === 'giphy') { this.fetchGiphy(enTag) }
  else if (s === 'commons') { this.fetchCommonsGif(enTag) }
  else { this.initSwarmFrames(this.makeProceduralFrames()) }
}

// Giphy: usa fixed_height_small (GIF ~200px, leggere) → decodifica nativa del browser,
// NIENTE decodeGif sincrono che bloccava il main thread su GIF grandi.
Background.prototype.fetchGiphy = function (q) {
  // Chiave non configurata → salta subito alla sorgente successiva
  if (!this.giphyKey) { this.tryNextGifSource(); return }
  const url = 'https://api.giphy.com/v1/gifs/search?api_key=' + this.giphyKey + '&q=' + encodeURIComponent(q) + '&limit=25&rating=r'
  this.fetchJSON(url, (json) => {
    const gifs = json.data
    if (!gifs || !gifs.length) { this.tryNextGifSource(); return }
    const g = gifs[Math.floor(Math.random() * gifs.length)]
    // fixed_height_small = GIF piccola e leggera (no blocco CPU)
    const src = (g.images && (g.images.fixed_height_small || g.images.fixed_width_small || g.images.downsized_small) || {}).url
    if (src) { this.setSwarmData(src) } else { this.tryNextGifSource() }
  }, () => { this.tryNextGifSource() })
}

// Fonte GIF affidabile: Wikimedia Commons (API pubblica, no key, CORS aperto).
// Cerca "animated gif <tag>" — restituisce GIF animate reali con URL diretto.
Background.prototype.fetchCommonsGif = function (tag) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=' + encodeURIComponent('animated gif ' + tag) + '&gsrnamespace=6&gsrlimit=30&prop=imageinfo&iiprop=url|mime'
  this.fetchJSON(url, (json) => {
    const pages = json.query && json.query.pages
    if (!pages) { this.tryNextGifSource(); return }
    const urls = []
    for (const k in pages) {
      const ii = pages[k].imageinfo && pages[k].imageinfo[0]
      // Accetta sia image/gif che image/gif espliciti
      if (ii && ii.url && /\.gif($|\?)/i.test(ii.url)) { urls.push(ii.url) }
    }
    if (!urls.length) { this.tryNextGifSource(); return }
    const gifUrl = urls[Math.floor(Math.random() * urls.length)]
    this.useGifUrl(gifUrl)
  }, () => { this.tryNextGifSource() })
}

// Usa direttamente l'URL nell'<img> nativo: il browser decodifica/Anima la GIF
// in modo ottimizzato (niente decodeGif sincrono che bloccava il main thread).
Background.prototype.useGifUrl = function (url) {
  this.setSwarmData(url)
}

Background.prototype.ensureGifHost = function () {
  if (!this.gifHost) {
    this.gifHost = document.createElement('img')
    this.gifHost.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:1;z-index:-1;pointer-events:none;'
    this.gifHost.setAttribute('aria-hidden', 'true')
    document.body.appendChild(this.gifHost)
  }
  return this.gifHost
}

Background.prototype.setSwarmData = function (src) {
  const img = this.ensureGifHost()
  img.onload = () => { if (img.naturalWidth) { this.initSwarm() } }
  img.onerror = () => { this.tryNextGifSource() }
  img.src = src
}

Background.prototype.initSwarm = function () {
  const img = this.gifHost
  const W = this.client.el.width; const H = this.client.el.height
  const boids = []
  const cx = W * (0.3 + Math.random() * 0.4); const cy = H * (0.3 + Math.random() * 0.4)
  for (let i = 0; i < 17; i++) { boids.push({ x: cx + (Math.random() - 0.5) * 350, y: cy + (Math.random() - 0.5) * 250, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 }) }
  this.swarm = { img: img, boids: boids, start: performance.now(), nextTeleport: Date.now() + 6000 + Math.random() * 8000 }
}

Background.prototype.initSwarmFrames = function (g) {
  const W = this.client.el.width; const H = this.client.el.height
  const boids = []
  const cx = W * (0.3 + Math.random() * 0.4); const cy = H * (0.3 + Math.random() * 0.4)
  for (let i = 0; i < 17; i++) { boids.push({ x: cx + (Math.random() - 0.5) * 350, y: cy + (Math.random() - 0.5) * 250, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 }) }
  this.swarm = { frames: g.frames, width: g.width, height: g.height, boids: boids, start: performance.now(), nextTeleport: Date.now() + 6000 + Math.random() * 8000 }
}

Background.prototype.makeProceduralFrames = function () {
  const W = 64, H = 64, N = 10, frames = []
  for (let f = 0; f < N; f++) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const cx = cv.getContext('2d')
    const img = cx.createImageData(W, H)
    for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) {
      const v = Math.sin((x + f * 3) * 0.3) + Math.cos((y - f * 2) * 0.25) + Math.sin((x + y + f * 4) * 0.15)
      const t = Math.floor(((v + 3) / 6) * 255)
      const o = (y * W + x) * 4
      img.data[o] = t; img.data[o + 1] = 80 + (t >> 1); img.data[o + 2] = 255 - t; img.data[o + 3] = 255
    } }
    cx.putImageData(img, 0, 0)
    frames.push({ canvas: cv, delay: 80 })
  }
  return { width: W, height: H, frames: frames }
}

Background.prototype.stepSwarm = function (W, H, bass) {
  const s = this.swarm; const now = Date.now()
  if (now > s.nextTeleport) {
    const dx = (Math.random() - 0.5) * W * 0.8; const dy = (Math.random() - 0.5) * H * 0.6
    for (let i = 0; i < s.boids.length; i++) { s.boids[i].x += dx; s.boids[i].y += dy }
    s.nextTeleport = now + 6000 + Math.random() * 9000
  }
  const R = 170
  for (let i = 0; i < s.boids.length; i++) {
    const b = s.boids[i]
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0
    for (let j = 0; j < s.boids.length; j++) {
      if (j === i) { continue }
      const o = s.boids[j]; const dx = o.x - b.x; const dy = o.y - b.y; const d = Math.sqrt(dx * dx + dy * dy)
      if (d < R) { n++; if (d < 90 && d > 0) { sx -= (dx / d) * (1 - d / 90); sy -= (dy / d) * (1 - d / 90) } ax += o.vx; ay += o.vy; cx += o.x; cy += o.y }
    }
    if (n) { b.vx += sx * 0.22 + (ax / n - b.vx) * 0.02 + (cx / n - b.x) * 0.0008; b.vy += sy * 0.22 + (ay / n - b.vy) * 0.02 + (cy / n - b.y) * 0.0008 }
    b.vx += (Math.random() - 0.5) * 0.12; b.vy += (Math.random() - 0.5) * 0.12
    if (b.x < 60) { b.vx += 0.2 } if (b.x > W - 60) { b.vx -= 0.2 }
    if (b.y < 60) { b.vy += 0.2 } if (b.y > H - 120) { b.vy -= 0.2 }
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 0.001
    const speedBoost = 1 + (this.swarmSpeedBoost || 0) * 3
    const max = (4.5 + bass * 4) * speedBoost; const min = 1.8
    if (sp > max) { b.vx = b.vx / sp * max; b.vy = b.vy / sp * max }
    if (sp < min) { b.vx = b.vx / sp * min; b.vy = b.vy / sp * min }
    b.x += b.vx * (1 + bass); b.y += b.vy * (1 + bass)
  }
}

Background.prototype.drawSwarm = function (ctx, W, H) {
  if (!this.swarm) { return }
  const s = this.swarm
  const bass = this.client.audioReactor ? (this.client.audioReactor.bass || 0) : 0
  this.stepSwarm(W, H, bass)
  let img = null, nw = 0, nh = 0
  if (s.frames) {
    let total = 0; for (const f of s.frames) { total += f.delay }
    const t = (performance.now() - s.start) % total
    let acc = 0, idx = 0
    for (let i = 0; i < s.frames.length; i++) { acc += s.frames[i].delay; if (t < acc) { idx = i; break } }
    img = s.frames[idx].canvas; nw = s.width; nh = s.height
  } else { img = s.img; nw = img.naturalWidth; nh = img.naturalHeight }
  if (!img || !nw || !nh) { return }
  const th = 90 * (this.gifScale || 1.0); const sc = th / nh; const dw = nw * sc
  ctx.save(); ctx.globalAlpha = 0.9
  for (let i = 0; i < s.boids.length; i++) { const b = s.boids[i]; ctx.drawImage(img, b.x - dw / 2, b.y - th / 2, dw, th) }
  ctx.restore()
}

Background.prototype.fetchCommons = function (tag, kind) {
  const search = (kind === 'video' ? 'filetype:video ' : 'filetype:bitmap ') + tag
  // iiprop=size serve a scartare i video enormi prima di scaricarli (erano la
  // causa principale dei blocchi: un .ogv da 200 MB intasa il decoder).
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=' + encodeURIComponent(search) + '&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|name|size&iiurlwidth=900'
  const ctl = Net.begin('bg-fetch')
  Net.json(url, { signal: ctl.signal }, 4500).then(json => {
    if (Net.stale('bg-fetch', ctl.signal)) { return }
    const pages = json.query && json.query.pages
    if (!pages) { throw new Error('no pages') }
    const urls = []
    const MAXV = 15 * 1000 * 1000
    for (const k in pages) {
      const ii = pages[k].imageinfo && pages[k].imageinfo[0]
      if (!ii) { continue }
      const name = (ii.name || ii.url || '').toLowerCase()
      if (kind === 'video') {
        if (!/\.(mp4|webm|ogv)$/.test(name)) { continue }
        if (ii.size && ii.size > MAXV) { continue }
        urls.push(ii.url)
      } else if (/\.(jpg|jpeg|png|webp)$/.test(name)) {
        // le thumb da 900px sono sempre leggere: ii.url no
        urls.push(ii.thumburl || ii.url)
      }
    }
    if (!urls.length) { throw new Error('none') }
    const src = urls[Math.floor(Math.random() * urls.length)]
    if (kind === 'video') { this.addVideoLayer(src) } else { this.addLayerFromUrl(src) }
  }).catch(() => { this.fetchArchive() })
}

Background.prototype.fetchArchive = function () {
  const tag = this.pickTag()
  const wantVideo = Math.random() > 0.6
  const mt = wantVideo ? 'movies' : 'image'
  const q = encodeURIComponent(`subject:(${tag}) AND mediatype:(${mt})`)
  const ctl = Net.begin('bg-fetch')
  Net.json(`https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&rows=50&page=1&output=json`, { signal: ctl.signal }, 4500).then(json => {
    if (Net.stale('bg-fetch', ctl.signal)) { return }
    const docs = json.response && json.response.docs
    if (!docs || !docs.length) { throw new Error('no docs') }
    const id = docs[Math.floor(Math.random() * docs.length)].identifier
    return Net.json(`https://archive.org/metadata/${id}`, { signal: ctl.signal }, 4500).then(meta => {
      if (Net.stale('bg-fetch', ctl.signal)) { return }
      const files = meta.files || []
      const MAXV = 12 * 1000 * 1000
      const small = (f, max) => {
        const n = parseInt(f.size, 10)
        return !n || n <= max
      }
      // Ordine di preferenza: mp4 (decodifica HW) → webm → ogv (spesso enormi)
      const vids = files
        .filter(f => /\.(mp4|webm|ogv)$/i.test(f.name) && small(f, MAXV))
        .sort((a, b) => {
          const rank = (f) => /\.mp4$/i.test(f.name) ? 0 : (/\.webm$/i.test(f.name) ? 1 : 2)
          return rank(a) - rank(b)
        })
      const imgs = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f.name) && small(f, 6 * 1000 * 1000))
      if (wantVideo && vids.length) { this.addVideoLayer('https://archive.org/download/' + id + '/' + encodeURIComponent(vids[0].name)) }
      else if (imgs.length) { this.addLayerFromUrl('https://archive.org/download/' + id + '/' + encodeURIComponent(imgs[Math.floor(Math.random() * imgs.length)].name)) }
      else { throw new Error('no files') }
    })
  }).catch(() => { this.addLayerFromUrl('https://picsum.photos/seed/' + this.pickTag() + Math.floor(Math.random() * 1000) + '/960/720') })
}

Background.prototype.loadBackground = async function () {
  let files = []
  try {
    if (window.api && window.api.fs && this.localDir) {
      // readdirSync è async (IPC invoke) → await
      files = (await window.api.fs.readdirSync(this.localDir)).filter(f => /\.(png|jpe?g|gif|webp|mp4|webm|ogv)$/i.test(f))
    }
  } catch (e) {}
  if (files.length && this.localUsed < 3) {
    this.localUsed++
    const n = Math.min(files.length, 1 + Math.floor(Math.random() * 3))
    for (let i = 0; i < n; i++) {
      const f = files[Math.floor(Math.random() * files.length)]
      const url = 'file://' + this.localDir + '/' + f
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

Background.prototype.addLocalImg = function (url) { const img = new Image(); img.onload = () => { this.addLayer(img) }; img.src = url }
Background.prototype.addLayerFromUrl = function (src) { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { this.addLayer(img) }; img.onerror = () => { this.fetchArchive() }; img.src = src }
Background.prototype.makeSpeed = function () {
  const r = Math.random(); let v
  if (r < 0.35) { v = 30 + Math.random() * 60 } else if (r < 0.75) { v = 120 + Math.random() * 160 } else { v = 350 + Math.random() * 450 }
  if (Math.random() > 0.5) { v = -v }
  return v
}
Background.prototype.addVideoLayer = function (url) {
  const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true
  if (/^https?:/.test(url)) { v.crossOrigin = 'anonymous' }
  v.onloadedmetadata = () => {
    const W = this.client.el.width; const H = this.client.el.height
    if (!v.videoHeight) { return }
    // Usa pendingSize se impostato da MIDI, altrimenti scala casuale
    const basePct = this.pendingSize != null ? this.pendingSize : (0.25 + Math.random() * 0.45)
    this.pendingSize = null; // consuma il valore
    const scale = basePct * H / v.videoHeight
    const vx = this.makeSpeed()
    // Assegna un canale MIDI al layer (round-robin 0-15) o usa quello MIDI forzato
    const ch = (this.pendingMidiChannel != null) ? this.pendingMidiChannel : this._nextMidiChannel()
    this.pendingMidiChannel = null
    this.layers.push({ type: 'video', midiChannel: ch, img: v, x: Math.random() * W, y: Math.random() * H, w: v.videoWidth * scale, h: v.videoHeight * scale, vx: vx, vy: (Math.random() - 0.5) * 70, jx: 0, jy: 0, flick: 0, fast: Math.abs(vx) > 300 })
    while (this.layers.length > (this.maxLayers || 7)) { const old = this.layers.shift(); if (old.type === 'video') { old.img.pause() } }
    this.mode = 'layers'; v.play().catch(() => {})
  }
  v.onerror = () => { this.fetchArchive() }
  v.src = url
}
Background.prototype.addLayer = function (img) {
  if (!img.naturalWidth) { return }
  const W = this.client.el.width; const H = this.client.el.height
  // Usa pendingSize se impostato da MIDI, altrimenti scala casuale
  const basePct = this.pendingSize != null ? this.pendingSize : (0.25 + Math.random() * 0.45)
  this.pendingSize = null; // consuma il valore
  const scale = basePct * H / img.naturalHeight
  const vx = this.makeSpeed()
  const ch = (this.pendingMidiChannel != null) ? this.pendingMidiChannel : this._nextMidiChannel()
  this.pendingMidiChannel = null
  this.layers.push({ type: 'img', midiChannel: ch, img: img, x: Math.random() * W, y: Math.random() * H, w: img.naturalWidth * scale, h: img.naturalHeight * scale, vx: vx, vy: (Math.random() - 0.5) * 70, jx: 0, jy: 0, flick: 0, fast: Math.abs(vx) > 300 })
  while (this.layers.length > (this.maxLayers || 7)) { const old = this.layers.shift(); if (old.type === 'video') { old.img.pause() } }
  this.mode = 'layers'
  if (this.video) { this.video.pause() }
}
Background.prototype._nextMidiChannel = function () {
  // Canale MIDI RANDOM per ogni elemento (0-15)
  return Math.floor(Math.random() * 16)
}
Background.prototype.startAuto = function () {
  this.stopAuto(); this.autoUntil = Date.now() + 60000; this.loadBackground()
  this.autoTimer = setInterval(() => { if (Date.now() > this.autoUntil) { this.stopAuto(); return } this.loadBackground() }, this.imageBackgroundInterval)
}
Background.prototype.stopAuto = function () { if (this.autoTimer) { clearInterval(this.autoTimer); this.autoTimer = null } }

Background.prototype.restartAutoTimer = function () {
  this.stopAuto()
  this.startAuto()
}
Background.prototype.setVideo = function (url) {
  if (!this.video) { this.video = document.createElement('video'); this.video.muted = true; this.video.loop = true; this.video.playsInline = true }
  if (/^https?:/.test(url)) { this.video.crossOrigin = 'anonymous' }
  this.video.src = url; this.video.play().catch(() => {})
  this.mode = 'video'; this.layers = []
}
Background.prototype.draw = function (ctx, W, H) {
  const now = performance.now(); const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000); this.lastT = now
  const alpha = this.overlayOpacity != null ? this.overlayOpacity : 0.85
  // === AUDIO-REATTIVITÀ + SYNC MIDI ===
  const a = this.client.audioReactor
  const bass = a ? (a.bass || 0) : 0
  const mid = a ? (a.mid || 0) : 0
  const high = a ? (a.high || 0) : 0
  const scoreFlash = this.client.scoreFlash || 0

  // === FEEDBACK MELTING POT (ping-pong buffer, NIENTE self-drawImage) ===
  const FBSCALE = 0.33
  const fbW = Math.max(2, Math.floor(W * FBSCALE))
  const fbH = Math.max(2, Math.floor(H * FBSCALE))
  if (!this.fbCanvas || this.fbCanvas.width !== fbW || this.fbCanvas.height !== fbH) {
    this.fbCanvas = document.createElement('canvas')
    this.fbCanvas.width = fbW; this.fbCanvas.height = fbH
    this.fbCtx = this.fbCanvas.getContext('2d')
    this.fbCtx.fillStyle = '#000'; this.fbCtx.fillRect(0, 0, fbW, fbH)
    this.fbTmp = document.createElement('canvas')
    this.fbTmp.width = fbW; this.fbTmp.height = fbH
    this.fbTmpCtx = this.fbTmp.getContext('2d')
  }
  const fb = this.fbCtx

  // Fade LENTO: la scia resta impressa a lungo (cluster di pixel persistente)
  fb.globalCompositeOperation = 'destination-out'
  fb.fillStyle = 'rgba(0,0,0,0.05)'
  fb.fillRect(0, 0, fbW, fbH)
  fb.globalCompositeOperation = 'source-over'

  // MELTING: disegna il feed (webcam, video o layers) sul feedback canvas
  // con distorsione audio-reattiva (bass=scale, high=jitter, mid=offset)
  const audioScale = 1.0 + bass * 0.25 + scoreFlash * 0.15
  const jitterX = high * 4 * (0.5 + bass) + scoreFlash * 6
  const jitterY = mid * 3

  if (this.mode === 'webcam' && this.webcam && this.webcam.videoWidth) {
    const sw = this.webcam.videoWidth; const sh = this.webcam.videoHeight
    const scale = Math.min(fbW / sw, fbH / sh) * audioScale
    const dw = sw * scale; const dh = sh * scale
    fb.save(); fb.globalAlpha = alpha
    fb.drawImage(this.webcam, (fbW - dw) / 2 + (Math.random() - 0.5) * jitterX, (fbH - dh) / 2 + (Math.random() - 0.5) * jitterY, dw, dh)
    fb.restore()
  } else if (this.mode === 'video' && this.video) {
    const sw = this.video.videoWidth; const sh = this.video.videoHeight
    if (sw && sh) { const scale = Math.min(fbW / sw, fbH / sh) * audioScale; fb.save(); fb.globalAlpha = alpha; fb.drawImage(this.video, (fbW - sw * scale) / 2 + (Math.random() - 0.5) * jitterX, (fbH - sh * scale) / 2 + (Math.random() - 0.5) * jitterY, sw * scale, sh * scale); fb.restore() }
  } else {
    for (let i = 0; i < this.layers.length; i++) {
      const L = this.layers[i]
      L.x += L.vx * dt; L.y += L.vy * dt
      if (L.x > W) { L.x = -L.w } if (L.x + L.w < 0) { L.x = W }
      if (L.y > H) { L.y = -L.h } if (L.y + L.h < 0) { L.y = H }
      // Audio-reactivity: basso fa pulsare le dimensioni, high aggiunge jitter
      const lScale = audioScale * (1 + Math.sin(now * 0.01 + i * 2) * bass * 0.04)
      const lw = L.w * lScale; const lh = L.h * lScale
      const jx = (Math.random() - 0.5) * jitterX
      const jy = (Math.random() - 0.5) * jitterY
      fb.save(); fb.globalAlpha = alpha
      fb.drawImage(L.img, (L.x + L.jx + jx) * FBSCALE, (L.y + L.jy + jy) * FBSCALE, lw * FBSCALE, lh * FBSCALE)
      fb.restore()
    }
  }

  // ============ PIXEL GLITCH FEEDBACK (solo webcam/video: effetto glitch pixel) ============
  // Slice-shift orizzontali + channel-split RGB su blocchi casuali, audio-reattivi.
  // Più bassi/high/scoreFlash → più glitch. Il rumore è deterministico nel tempo.
  if ((this.mode === 'webcam' || this.mode === 'video') && (bass + high + scoreFlash) > 0.02) {
    const gIntensity = Math.min(1, (bass * 1.2 + high * 0.8 + scoreFlash * 1.5) / 2)
    const rows = 24
    const rowH = fbH / rows
    const tmp = this.fbTmpCtx
    tmp.clearRect(0, 0, fbW, fbH)
    for (let r = 0; r < rows; r++) {
      const rnd = hash2(r, Math.floor(now / 90))
      if (rnd > 0.55 - gIntensity * 0.4) {
        // riga non glitchata: copia dritta
        tmp.drawImage(this.fbCanvas, 0, r * rowH, fbW, rowH, 0, r * rowH, fbW, rowH)
      } else {
        // riga glitchata: shift orizzontale + eventuale swap canale
        const shift = (hash2(r, Math.floor(now / 30)) - 0.5) * fbW * 0.35 * gIntensity
        const srcX = Math.max(0, Math.min(fbW, shift))
        tmp.drawImage(this.fbCanvas, srcX, r * rowH, fbW - Math.abs(shift), rowH, 0, r * rowH, fbW - Math.abs(shift), rowH)
        // ghost colorato (channel split) su alcune righe
        if (hash2(r, 13) > 0.7) {
          tmp.globalCompositeOperation = 'lighter'
          tmp.globalAlpha = 0.25 * gIntensity
          tmp.fillStyle = hash2(r, 7) > 0.5 ? '#ff0040' : '#00ffff'
          tmp.fillRect(0, r * rowH, fbW, rowH)
          tmp.globalAlpha = 1
          tmp.globalCompositeOperation = 'source-over'
        }
      }
    }
    // copia il risultato glitchato su fbCanvas
    fb.clearRect(0, 0, fbW, fbH)
    fb.drawImage(this.fbTmp, 0, 0)

    // Pixelate block: blocchi che diventano a bassa risoluzione (pixel grossi)
    const blocks = 10 + Math.floor(gIntensity * 20)
    for (let b = 0; b < blocks; b++) {
      const bx = Math.floor(hash2(b, 3) * (fbW / 8)) * 8
      const by = Math.floor(hash2(b, 5) * (fbH / 8)) * 8
      const bs = 8 + Math.floor(hash2(b, 9) * 24) * (0.5 + gIntensity)
      if (bx + bs <= fbW && by + bs <= fbH) {
        const px = Math.floor(bx / bs) * bs
        const py = Math.floor(by / bs) * bs
        try { fb.drawImage(this.fbCanvas, px, py, bs, bs, bx, by, bs, bs) } catch (e) {}
      }
    }
  }

  // MELTING POT: colonne che si sciolgono/ristrutturano (ping-pong, no self-draw)
  const cols = 16
  const colW = fbW / cols
  const meltAmp = (1 + bass * 5 + scoreFlash * 3) * (0.5 + 0.5 * Math.sin(now * 0.0004))
  const tmp2 = this.fbTmpCtx
  tmp2.clearRect(0, 0, fbW, fbH)
  for (let c = 0; c < cols; c++) {
    const phase = Math.sin(now * 0.0008 + c * 1.3) * meltAmp
    const oy = Math.round(phase * 2)
    tmp2.drawImage(this.fbCanvas, c * colW, 0, colW, fbH, c * colW, oy, colW, fbH)
  }
  fb.clearRect(0, 0, fbW, fbH)
  fb.drawImage(this.fbTmp, 0, 0)

  // Flash MIDI: lampeggio luminoso quando lo score invia una nota
  if (scoreFlash > 0.01) {
    fb.globalCompositeOperation = 'lighter'
    fb.fillStyle = `rgba(255,16,240,${Math.min(0.35, scoreFlash * 0.5)})`
    fb.fillRect(0, 0, fbW, fbH)
    fb.globalCompositeOperation = 'source-over'
  }

  // Blit finale: upscale con smoothing disabilitato → cluster di pixel grossi
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(this.fbCanvas, 0, 0, fbW, fbH, 0, 0, W, H)
  ctx.restore()
}
Background.prototype.onMidiNote = function (channel, note, velocity) {
  // Ogni canale MIDI (0-15) controlla UN layer immagine specifico.
  // Nota sul canale → CAMBIA l'immagine di quel layer.
  // Velocity → DIMENSIONE del layer (8%–100% altezza schermo).
  var sizeFactor = velocity / 127;
  const size = 0.08 + sizeFactor * 0.92;
  this.pendingSize = size;
  // Forza il canale MIDI sul prossimo layer creato
  this.pendingMidiChannel = channel;

  // Trova il layer esistente con questo canale: ne aggiorniamo la dimensione
  const W = this.client.el.width; const H = this.client.el.height;
  for (let i = 0; i < this.layers.length; i++) {
    const L = this.layers[i];
    if (L.midiChannel === channel) {
      // Velocity → dimensione immediata del layer esistente
      const scale = size * H / (L.img.naturalHeight || L.h || H);
      L.w = (L.img.naturalWidth || L.w) * scale;
      L.h = size * H;
      // Cambia immagine: carichiamo una nuova dal tag (nota → tag)
      const tagKey = this.tagKeys[(note + channel * 3) % this.tagKeys.length];
      const entry = this.commonsTags[tagKey];
      const searchTerm = Array.isArray(entry) ? entry[Math.floor(Math.random() * entry.length)] : (entry || tagKey);
      this.fetchCommons(searchTerm, Math.random() > 0.65 ? 'video' : 'img');
      console.log('BG MIDI note (update layer ch' + channel + '):', { note: note, vel: velocity, size: size });
      return;
    }
  }

  // Nessun layer con questo canale: creane uno nuovo con canale forzato
  var tagKey = this.tagKeys[(note + channel * 3) % this.tagKeys.length];
  var entry = this.commonsTags[tagKey];
  var searchTerm = Array.isArray(entry) ? entry[Math.floor(Math.random() * entry.length)] : (entry || tagKey);
  var wantVideo = Math.random() > 0.65;
  if (wantVideo) {
    this.fetchCommons(searchTerm, 'video');
  } else {
    this.fetchCommons(searchTerm, 'img');
  }
  console.log('BG MIDI note (new layer ch' + channel + '):', { note: note, vel: velocity, size: size, tag: tagKey });
};

Background.prototype.onMidiCC = function (channel, cc, value) {
  // CC disabilitati — solo note attivi
};

// ============ WEBCAM LIVEFEED ============
Background.prototype.startWebcam = function () {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('Webcam: API getUserMedia non disponibile')
    return
  }
  this.stopWebcam()
  navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
    .then((stream) => {
      this.webcamStream = stream
      this.webcam = document.createElement('video')
      this.webcam.muted = true
      this.webcam.playsInline = true
      this.webcam.srcObject = stream
      this.webcam.play().catch(() => {})
      this.mode = 'webcam'
      console.log('Webcam: livefeed attivo')
    })
    .catch((e) => {
      console.warn('Webcam: accesso negato o errore:', e.message || e)
    })
}

Background.prototype.stopWebcam = function () {
  if (this.webcamStream) {
    try {
      const tracks = this.webcamStream.getTracks()
      for (const t of tracks) { t.stop() }
    } catch (e) {}
    this.webcamStream = null
  }
  if (this.webcam) {
    try { this.webcam.pause(); this.webcam.srcObject = null } catch (e) {}
    this.webcam = null
  }
  if (this.mode === 'webcam') { this.mode = 'none' }
}

Background.prototype.off = function () {
  this.stopAuto()
  this.stopWebcam()
  if (this.swarmAuto) { clearInterval(this.swarmAuto); this.swarmAuto = null }
  this.mode = 'none'
  for (let i = 0; i < this.layers.length; i++) { if (this.layers[i].type === 'video') { this.layers[i].img.pause() } }
  this.layers = []; this.swarm = null
  if (this.video) { this.video.pause() }
  // Resetta il feedback canvas (azzera la scia residua)
  if (this.fbCtx && this.fbCanvas) { this.fbCtx.clearRect(0, 0, this.fbCanvas.width, this.fbCanvas.height) }
}
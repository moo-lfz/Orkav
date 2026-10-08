'use strict'
function Background (client) {
  this.client = client
  this.mode = 'none'; this.video = null; this.layers = []
  // STORMI GIF: array (multipli). `swarm` resta l'ultimo pronto per compatibilita'.
  this.swarms = []; this.swarm = null; this.maxSwarms = 4
  this.webcam = null; this.webcamStream = null
  this.autoTimer = null; this.autoUntil = 0; this.lastT = 0; this.localUsed = 0
  this.swarmAuto = null
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

// Chiave Giphy: NON è nel repo. Si salva ANCHE SU DISCO (userData/orkav-cache)
// perché localStorage su origine file:// in Electron non viene mai scritto su
// disco: la chiave spariva ad ogni riavvio e le GIF tornavano a cadere sulle
// sorgenti di ripiego. Era il motivo per cui "le GIF non si caricano".
Background.prototype.setGiphyKey = function (k) {
  this.giphyKey = (k || '').trim() || null
  try {
    if (this.giphyKey) window.localStorage.setItem('giphy_key', this.giphyKey)
    else window.localStorage.removeItem('giphy_key')
  } catch (e) {}
  if (window.Net) {
    if (this.giphyKey) { Net.cacheSave('giphy_key', this.giphyKey) }
    else { Net.cacheDrop('giphy_key').catch(() => {}) }
  }
  console.log('[Background] Giphy key', this.giphyKey ? 'impostata (salvata su disco)' : 'rimossa')
  return !!this.giphyKey
}

// Cartella locale di background/GIF (opzionale) — stessa persistenza su disco
Background.prototype.setLocalDir = function (d) {
  this.localDir = (d || '').trim() || null
  try {
    if (this.localDir) window.localStorage.setItem('bg_dir', this.localDir)
    else window.localStorage.removeItem('bg_dir')
  } catch (e) {}
  if (window.Net) {
    if (this.localDir) { Net.cacheSave('bg_dir', this.localDir) }
    else { Net.cacheDrop('bg_dir').catch(() => {}) }
  }
  console.log('[Background] cartella locale:', this.localDir || '(nessuna)')
  return this.localDir
}

// Ripristina chiave Giphy e cartella locale dalla cache su disco (async, al boot)
Background.prototype.loadPersisted = async function () {
  if (!window.Net) { return }
  try {
    if (!this.giphyKey) {
      const k = await Net.cacheLoad('giphy_key', 0)
      if (k && typeof k === 'string') {
        this.giphyKey = k
        try { window.localStorage.setItem('giphy_key', k) } catch (e) {}
        console.log('[Background] Giphy key ripristinata dal disco')
      }
    }
    if (!this.localDir) {
      const d = await Net.cacheLoad('bg_dir', 0)
      if (d && typeof d === 'string') {
        this.localDir = d
        try { window.localStorage.setItem('bg_dir', d) } catch (e) {}
        console.log('[Background] cartella locale ripristinata dal disco:', d)
      }
    }
  } catch (e) {}
}

// Chiave-tag per un canale ('bg' immagini, 'gif' stormo). Se il canale ha un
// tag proprio (impostato con tagbg:/taggif:) e quel tag esiste nella tabella,
// lo usa; altrimenti pesca a caso come prima.
Background.prototype.tagKeyFor = function (kind) {
  const t = (this.client && this.client.tagFor) ? this.client.tagFor(kind || 'bg') : null
  if (t && this.commonsTags && this.commonsTags[t]) { return t }
  return this.pickTagKey()
}

Background.prototype.pickTagKey = function () {
  const keys = this.tagKeys || Object.keys(this.commonsTags || {})
  return keys[Math.floor(Math.random() * keys.length)] || 'storia'
}

Background.prototype.pickTag = function (kind) {
  const key = this.tagKeyFor(kind || 'bg')
  const entry = this.commonsTags ? this.commonsTags[key] : null
  if (!entry) { return key }
  if (typeof entry === 'string') { return entry }
  return entry[Math.floor(Math.random() * entry.length)] || key
}

// --- HTTP (tutto passa da Net: timeout, annullamento per canale) ---
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

Background.prototype.fetchJSON = function (url, cb, eb) {
  this.fetchText(url, (t) => { try { cb(JSON.parse(t)) } catch (e) { eb() } }, eb)
}

// ============================================================================
// STORMI GIF — MULTIPLI
// Prima `this.swarm` era UNO solo: ogni nuovo Alt+G sostituiva il precedente.
// Ora `this.swarms` è un array (max maxSwarms): ogni stormo ha la sua GIF, il
// suo <img> nascosto, i suoi boid e la sua zona dello schermo, quindi se ne
// possono avere diversi contemporaneamente.
// Ogni volta che se ne carica uno NUOVO il tag avanza (vedi client.nextTagFor):
// stormi diversi pescano da tag diversi.
// ============================================================================

// Crea lo <img> nascosto di uno stormo (uno per stormo: non si può condividere)
Background.prototype.makeGifHost = function () {
  const img = document.createElement('img')
  img.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:1;z-index:-1;pointer-events:none;'
  img.setAttribute('aria-hidden', 'true')
  document.body.appendChild(img)
  return img
}

// --- METODI PER TAG ---
Background.prototype.loadBackgroundByTag = function(tag) {
  tag = tag || this.tagKeyFor('bg')
  const entry = this.commonsTags[tag]
  if (!entry) { this.loadBackground(); return }
  const searchTerm = Array.isArray(entry) ? entry[Math.floor(Math.random() * entry.length)] : entry
  this.fetchCommons(searchTerm, 'img')
}

// Carica un NUOVO stormo. Se non si passa un tag, il tag del canale 'gif' avanza
// (a meno che sia pinnato con taggif:). opts.replace = sostituisci invece di
// aggiungere. Oltre maxSwarms si elimina il più vecchio.
Background.prototype.loadSwarm = async function (tag, opts) {
  opts = opts || {}
  if (!this.swarmAuto) {
    this.swarmAuto = setInterval(() => { this.loadSwarm() }, this.swarmInterval || 8000)
  }
  const swarms = this.swarms || (this.swarms = [])
  const max = this.maxSwarms || 4
  if (opts.replace) { this.clearSwarms() }
  while (swarms.length >= max) { this._dropSwarm(0) }

  // TAG: se non è passato esplicitamente, avanza il cursore del canale
  let t = tag
  if (!t) {
    t = (this.client && this.client.nextTagFor) ? this.client.nextTagFor('gif') : null
  }
  const target = { tag: t || null, host: this.makeGifHost(), boids: [], srcIndex: 0, token: 0, ready: false }
  swarms.push(target)
  console.log('[Background] stormo #' + swarms.length + ' tag:', target.tag || '(nessuno)')

  // 1) GIF locali, se c'è una cartella configurata
  try {
    if (window.api && window.api.fs && this.localDir) {
      const gifs = (await window.api.fs.readdirSync(this.localDir)).filter(f => /\.gif$/i.test(f))
      if (gifs.length) {
        this.setSwarmData('file://' + this.localDir + '/' + gifs[Math.floor(Math.random() * gifs.length)], target)
        return
      }
    }
  } catch (e) {}
  this.tryNextGifSource(target)
}

// Come loadSwarm ma con un tag esplicito (Cmd+Shift+T, taggif:, MIDI).
// Non pinna il canale: forza solo il tag di questo stormo.
Background.prototype.loadSwarmByTag = function (tag) {
  this.loadSwarm(tag)
}

Background.prototype.clearSwarms = function () {
  const swarms = this.swarms || []
  for (const s of swarms) {
    try { if (s.timer) { clearTimeout(s.timer) } } catch (e) {}
    try { if (s.host && s.host.parentNode) { s.host.parentNode.removeChild(s.host) } } catch (e) {}
  }
  this.swarms = []
  this.swarm = null
  console.log('[Background] stormi azzerati')
}

Background.prototype._dropSwarm = function (i) {
  const swarms = this.swarms || []
  const s = swarms[i]
  if (!s) { return }
  try { if (s.timer) { clearTimeout(s.timer) } } catch (e) {}
  try { if (s.host && s.host.parentNode) { s.host.parentNode.removeChild(s.host) } } catch (e) {}
  swarms.splice(i, 1)
}

Background.prototype.tryNextGifSource = function (target) {
  if (!target) { return }
  const en = this.commonsTags[this.tagKeyFor('gif')]
  const enTag = target.tag || (Array.isArray(en) ? en[0] : (en || 'art'))
  // Ordine: Giphy (leggera) → Commons per tag → Commons per categoria → procedurali
  const sources = ['giphy', 'commons', 'commonscat', 'procedural']
  if (target.srcIndex >= sources.length) {
    console.warn('Swarm', 'rete non disponibile: uso frame procedurali')
    this.initSwarmFrames(this.makeProceduralFrames(), target)
    return
  }
  const s = sources[target.srcIndex++]
  if (s === 'giphy') { this.fetchGiphy(enTag, target) }
  else if (s === 'commons') { this.fetchCommonsGif(enTag, target) }
  else if (s === 'commonscat') { this.fetchCommonsGifCategory(target) }
  else { this.initSwarmFrames(this.makeProceduralFrames(), target) }
}

// Giphy: usa fixed_height_small (GIF ~200px, leggere) → decodifica nativa del browser.
Background.prototype.fetchGiphy = function (q, target) {
  if (!this.giphyKey) { this.tryNextGifSource(target); return }
  const url = 'https://api.giphy.com/v1/gifs/search?api_key=' + this.giphyKey + '&q=' + encodeURIComponent(q) + '&limit=25&rating=r'
  this.fetchJSON(url, (json) => {
    const gifs = json.data
    if (!gifs || !gifs.length) { this.tryNextGifSource(target); return }
    const g = gifs[Math.floor(Math.random() * gifs.length)]
    const src = (g.images && (g.images.fixed_height_small || g.images.fixed_width_small || g.images.downsized_small) || {}).url
    if (src) { this.setSwarmData(src, target) } else { this.tryNextGifSource(target) }
  }, () => { this.tryNextGifSource(target) })
}

// Fonte GIF affidabile: Wikimedia Commons (API pubblica, no key, CORS aperto).
// FILTRO DIMENSIONE: molte GIF della Commons sono da 5-20 MB a 1796×1820.
Background.prototype.fetchCommonsGif = function (tag, target) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=' + encodeURIComponent('animated gif ' + tag) + '&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url|mime|size'
  this.fetchJSON(url, (json) => {
    const pages = json.query && json.query.pages
    if (!pages) { this.tryNextGifSource(target); return }
    this._pickCommonsGif(pages, 'search', target)
  }, () => { this.tryNextGifSource(target) })
}

// Categoria "Animated GIF files": sempre disponibile senza chiave, nessun tag.
Background.prototype.fetchCommonsGifCategory = function (target) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=categorymembers&gcmtitle=Category:Animated_GIF_files&gcmtype=file&gcmlimit=40&prop=imageinfo&iiprop=url|mime|size'
  this.fetchJSON(url, (json) => {
    const pages = json.query && json.query.pages
    if (!pages) { this.tryNextGifSource(target); return }
    this._pickCommonsGif(pages, 'category', target)
  }, () => { this.tryNextGifSource(target) })
}

// Sceglie una GIF caricabile fra le pagine restituite dall'API.
// Preferisce le LEGGERE e a risoluzione contenuta: lo stormo le disegna 17
// volte per frame a 90px di altezza.
Background.prototype._pickCommonsGif = function (pages, why, target) {
  const MAXB = 2 * 1024 * 1024
  const MAXW = 900
  const good = [], huge = []
  for (const k in pages) {
    const ii = pages[k].imageinfo && pages[k].imageinfo[0]
    if (!ii || !ii.url) { continue }
    if (!/\.gif($|\?)/i.test(ii.url)) { continue }
    const sz = ii.size || 0
    const w = ii.width || 0
    if ((sz && sz > MAXB) || (w && w > MAXW * 2)) { huge.push({ url: ii.url, sz: sz, w: w }) }
    else { good.push({ url: ii.url, sz: sz, w: w }) }
  }
  const pool = good.length ? good : huge
  if (!pool.length) { this.tryNextGifSource(target); return }
  pool.sort((a, b) => (a.sz + a.w * 400) - (b.sz + b.w * 400))
  const top = pool.slice(0, Math.max(1, Math.ceil(pool.length * 0.6)))
  const pick = top[Math.floor(Math.random() * top.length)].url
  console.log('[Background] GIF da Commons (' + why + '):', good.length, 'leggere /', huge.length, 'pesanti')
  this.useGifUrl(pick, target)
}

// L'<img> nativo decodifica e anima la GIF in modo ottimizzato.
Background.prototype.useGifUrl = function (url, target) {
  this.setSwarmData(url, target)
}

Background.prototype.setSwarmData = function (src, target) {
  if (!target) { return }
  const img = target.host
  if (!img) { this.tryNextGifSource(target); return }
  // Le GIF della Commons possono pesare diversi MB: senza timeout si resta
  // fermi su un caricamento che non finisce mai. Se in 8 s non è pronta, si
  // passa alla sorgente successiva di QUESTO stormo.
  if (target.timer) { clearTimeout(target.timer) }
  const token = (target.token = (target.token || 0) + 1)
  target.timer = setTimeout(() => {
    if (token !== target.token) { return }
    console.warn('[Background] GIF troppo lenta (>8s), provo un\'altra sorgente')
    this.tryNextGifSource(target)
  }, 8000)
  img.onload = () => {
    if (token !== target.token) { return }
    if (target.timer) { clearTimeout(target.timer); target.timer = null }
    if (img.naturalWidth) { this.initSwarm(target) }
  }
  img.onerror = () => {
    if (token !== target.token) { return }
    if (target.timer) { clearTimeout(target.timer); target.timer = null }
    this.tryNextGifSource(target)
  }
  img.src = src
}

// Costruisce i boid di uno stormo nella sua zona dello schermo.
Background.prototype._makeBoids = function (count) {
  const W = this.client.el.width; const H = this.client.el.height
  const boids = []
  const slot = (this.client && this.client.nextSlot) ? this.client.nextSlot() : { x: 0.35 + Math.random() * 0.3, y: 0.35 + Math.random() * 0.3 }
  const cx = W * slot.x; const cy = H * slot.y
  for (let i = 0; i < count; i++) {
    boids.push({ x: cx + (Math.random() - 0.5) * 350, y: cy + (Math.random() - 0.5) * 250, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 })
  }
  return boids
}

Background.prototype.initSwarm = function (target) {
  target = target || (this.swarms && this.swarms[this.swarms.length - 1])
  if (!target || target.ready) { return }
  target.img = target.host
  target.boids = this._makeBoids(17)
  target.start = performance.now()
  target.nextTeleport = Date.now() + 6000 + Math.random() * 8000
  target.ready = true
  // compatibilità: `swarm` resta l'ultimo pronto
  this.swarm = target
}

Background.prototype.initSwarmFrames = function (g, target) {
  target = target || (this.swarms && this.swarms[this.swarms.length - 1])
  if (!target) { return }
  target.frames = g.frames
  target.width = g.width
  target.height = g.height
  target.boids = this._makeBoids(17)
  target.start = performance.now()
  target.nextTeleport = Date.now() + 6000 + Math.random() * 8000
  target.ready = true
  this.swarm = target
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

Background.prototype.stepSwarm = function (s, W, H, bass) {
  if (!s || !s.boids || !s.boids.length) { return }
  const now = Date.now()
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

// Disegna TUTTI gli stormi pronti.
Background.prototype.drawSwarm = function (ctx, W, H) {
  const swarms = this.swarms || []
  if (!swarms.length) { return }
  const bass = this.client.audioReactor ? (this.client.audioReactor.bass || 0) : 0
  // Con più stormi in scena le GIF sono più piccole, così non si accavallano
  const crowd = swarms.length > 1 ? Math.max(0.55, 1 - (swarms.length - 1) * 0.12) : 1
  ctx.save()
  ctx.globalAlpha = 0.9
  for (let k = 0; k < swarms.length; k++) {
    const s = swarms[k]
    if (!s || !s.ready) { continue }
    this.stepSwarm(s, W, H, bass)
    let img = null, nw = 0, nh = 0
    if (s.frames) {
      let total = 0; for (const f of s.frames) { total += f.delay }
      const t = (performance.now() - s.start) % Math.max(1, total)
      let acc = 0, idx = 0
      for (let i = 0; i < s.frames.length; i++) { acc += s.frames[i].delay; if (t < acc) { idx = i; break } }
      img = s.frames[idx].canvas; nw = s.width; nh = s.height
    } else if (s.img) {
      img = s.img; nw = img.naturalWidth; nh = img.naturalHeight
    }
    if (!img || !nw || !nh) { continue }
    const th = 90 * (this.gifScale || 1.0) * crowd
    const sc = th / nh; const dw = nw * sc
    for (let i = 0; i < s.boids.length; i++) {
      const b = s.boids[i]
      ctx.drawImage(img, b.x - dw / 2, b.y - th / 2, dw, th)
    }
  }
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
  const tag = this.pickTag('bg')
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
  }).catch(() => { this.addLayerFromUrl('https://picsum.photos/seed/' + this.pickTag('bg') + Math.floor(Math.random() * 1000) + '/960/720') })
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
    if (r < 0.45) { this.fetchCommons(this.pickTag('bg'), 'img') }
    else if (r < 0.75) { this.fetchCommons(this.pickTag('bg'), 'video') }
    else { this.fetchArchive() }
  }
}

// DECODE OFF-MAIN-THREAD.
// Un'immagine della Commons può essere 4000×3000: il primo drawImage la
// decodifica sul main thread e il frame salta (era uno dei "blocchi" percepiti
// quando si carica roba dal web). `img.decode()` sposta la decodifica fuori dal
// main thread, e `createImageBitmap` la trasferisce in un ImageBitmap
// ridimensionato — che poi si disegna senza lavoro aggiuntivo.
Background.prototype._decodeOffThread = async function (img, maxW) {
  try { if (img.decode) { await img.decode() } } catch (e) {}
  try {
    if (!window.createImageBitmap) { return img }
    const w = img.naturalWidth || 0; const h = img.naturalHeight || 0
    if (!w || !h) { return img }
    const lim = maxW || 1600
    if (w > lim) {
      const s = lim / w
      return await createImageBitmap(img, {
        resizeWidth: Math.max(1, Math.round(w * s)),
        resizeHeight: Math.max(1, Math.round(h * s)),
        resizeQuality: 'medium'
      })
    }
    return await createImageBitmap(img)
  } catch (e) {
    return img   // fallback: l'<img> originale (come prima)
  }
}

// Larghezza/altezza valide sia per <img> sia per ImageBitmap
Background.prototype._imgW = function (img) { return img ? (img.naturalWidth || img.width || 0) : 0 }
Background.prototype._imgH = function (img) { return img ? (img.naturalHeight || img.height || 0) : 0 }

Background.prototype.addLocalImg = function (url) {
  const img = new Image()
  img.onload = () => { this._decodeOffThread(img).then((b) => this.addLayer(b)) }
  img.src = url
}
Background.prototype.addLayerFromUrl = function (src) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { this._decodeOffThread(img).then((b) => this.addLayer(b)) }
  img.onerror = () => { this.fetchArchive() }
  img.src = src
}
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
    const _sv = (this.client && this.client.nextSlot) ? this.client.nextSlot() : { x: Math.random(), y: Math.random() }
    this.layers.push({ type: 'video', midiChannel: ch, img: v, x: _sv.x * W, y: _sv.y * H, w: v.videoWidth * scale, h: v.videoHeight * scale, vx: vx, vy: (Math.random() - 0.5) * 70, jx: 0, jy: 0, flick: 0, fast: Math.abs(vx) > 300 })
    while (this.layers.length > (this.maxLayers || 7)) { const old = this.layers.shift(); if (old.type === 'video') { old.img.pause() } }
    this.mode = 'layers'; v.play().catch(() => {})
  }
  v.onerror = () => { this.fetchArchive() }
  v.src = url
}
Background.prototype.addLayer = function (img) {
  // `img` può essere un <img> o un ImageBitmap (decode off-main-thread):
  // ImageBitmap non ha naturalWidth/naturalHeight, ma ha width/height.
  const iw = this._imgW(img); const ih = this._imgH(img)
  if (!iw || !ih) { return }
  const W = this.client.el.width; const H = this.client.el.height
  // Usa pendingSize se impostato da MIDI, altrimenti scala casuale
  const basePct = this.pendingSize != null ? this.pendingSize : (0.25 + Math.random() * 0.45)
  this.pendingSize = null; // consuma il valore
  const scale = basePct * H / ih
  const vx = this.makeSpeed()
  const ch = (this.pendingMidiChannel != null) ? this.pendingMidiChannel : this._nextMidiChannel()
  this.pendingMidiChannel = null
  const _s = (this.client && this.client.nextSlot) ? this.client.nextSlot() : { x: Math.random(), y: Math.random() }
  this.layers.push({ type: 'img', midiChannel: ch, img: img, x: _s.x * W, y: _s.y * H, w: iw * scale, h: ih * scale, vx: vx, vy: (Math.random() - 0.5) * 70, jx: 0, jy: 0, flick: 0, fast: Math.abs(vx) > 300 })
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
      const _lh = this._imgH(L.img) || L.h || H
      const scale = size * H / _lh
      L.w = (this._imgW(L.img) || L.w) * scale;
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
  this.layers = []
  this.clearSwarms()
  if (this.video) { this.video.pause() }
  // Resetta il feedback canvas (azzera la scia residua)
  if (this.fbCtx && this.fbCanvas) { this.fbCtx.clearRect(0, 0, this.fbCanvas.width, this.fbCanvas.height) }
}
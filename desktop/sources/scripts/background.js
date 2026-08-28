'use strict'
function Background (client) {
  this.client = client
  this.mode = 'none'; this.video = null; this.layers = []; this.swarm = null
  this.autoTimer = null; this.autoUntil = 0; this.lastT = 0; this.localUsed = 0
  this.gifSourceIndex = 0; this.gifHost = null; this.swarmAuto = null
  this.localDir = '/Users/moo/Orca/backgrounds'
  this.giphyKey = 'REMOVED-BY-SECURITY-CLEANUP'
  this.tagKeys = ['ambiente','politica','storia','sport','cultura','arte','insetti','tatuaggi','gore','cibo','sextoys','sacro','complotti','cartoni','fumetti','famosi','cantanti','attrici','concerti','musica','macchine','sportestremi','viaggi','soldi','religione','battlerobots','attori','porno','magia','bdsm']
  this.commonsTags = {
    ambiente: ['nature landscape','paisaje natural','paysage naturel','自然','自然','природа'],
    politica: ['politics','política','politique','政治','政治','политика'],
    storia: ['history','historia','histoire','历史','歴史','история'],
    sport: ['sport','deporte','sport','体育','スポーツ','спорт'],
    cultura: ['culture','cultura','culture','文化','文化','культура'],
    arte: ['art','arte','art','艺术','芸術','искусство'],
    insetti: ['insects','insectos','insectes','昆虫','昆虫','насекомые'],
    tatuaggi: ['tattoo','tatuaje','tatouage','纹身','入れ墨','татуировки'],
    gore: ['horror','terror','horreur','恐怖','ホラー','ужасы'],
    cibo: ['food','comida','nourriture','食物','料理','еда'],
    sextoy: ['sex toy','juguete sexual','sex toy','性玩具','セックス玩具','секс-игрушки'],
    sacro: ['religious ceremony','ceremonia religiosa','cérémonie religieuse','宗教仪式','宗教儀式','обряд'],
    complotti: ['conspiracy','conspiración','complot','阴谋','阴谋','заговор'],
    cartoni: ['cartoon','dibujos animados','dessin animé','卡通','アニメ','мультфильмы'],
    fumetti: ['comic','cómic','bande dessinée','漫画','漫画','комиксы'],
    famosi: ['celebrity','celebridad','célébrité','名人','有名人','знаменитости'],
    cantanti: ['singer','cantante','chanteur','歌手','歌手','певцы'],
    attrici: ['actress','actriz','actrice','女演员','女優','актрисы'],
    concerti: ['concert poster','cartel de concierto','affiche de concert','演唱会','コンサート','афиша концерта'],
    musica: ['music poster','cartel de música','affiche de musique','音乐','音楽','музыка'],
    macchine: ['car','coche','voiture','汽车','車','автомобили'],
    sportestremi: ['extreme sports','deportes extremos','sports extrêmes','极限运动','エクストリームスポーツ','экстрим'],
    viaggi: ['travel','viaje','voyage','旅行','旅行','путешествия'],
    soldi: ['money','dinero','argent','钱','お金','деньги'],
    religione: ['religion','religión','religion','宗教','宗教','религия'],
    battlerobots: ['battle robot','robot de combate','robot de combat','战斗机器人','戦闘ロボット','боевые роботы'],
    attori: ['actor','actor','acteur','演员','俳优','актеры'],
    porno: ['porn','porno','porno','色情','ポルノ','порно'],
    magia: ['magic','magia','magie','魔法','魔法','магия'],
    bdsm: ['bdsm','bdsm','bdsm','束缚','紧缚','бдсм']
  }
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
Background.prototype.httpGet = function (url, cb, eb, redirects) {
  redirects = redirects || 0
  try {
    const mod = url.indexOf('https') === 0 ? require('https') : require('http')
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) { this.httpGet(res.headers.location, cb, eb, redirects + 1); return }
      if (res.statusCode !== 200) { eb(); return }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => cb(Buffer.concat(chunks)))
      res.on('error', eb)
    })
    req.on('error', eb)
  } catch (e) { eb() }
}
Background.prototype.fetchText = function (url, cb, eb) { this.httpGet(url, (b) => cb(b.toString('utf8')), eb) }
Background.prototype.fetchJSON = function (url, cb, eb) { this.fetchText(url, (t) => { try { cb(JSON.parse(t)) } catch (e) { eb() } }, eb) }
Background.prototype.loadSwarm = function () {
  // auto-rotate: il stormo cambia gif da solo
  if (!this.swarmAuto) { this.swarmAuto = setInterval(() => { this.loadSwarm() }, 6000) }
  let src = null
  try {
    const fs = require('fs'); const path = require('path')
    const gifs = fs.readdirSync(this.localDir).filter(f => /\.gif$/i.test(f))
    if (gifs.length) { src = 'file://' + path.join(this.localDir, gifs[Math.floor(Math.random() * gifs.length)]) }
  } catch (e) {}
  if (src) { this.setSwarmData(src); return }
  this.gifSourceIndex = 0
  this.tryNextGifSource()
}
Background.prototype.tryNextGifSource = function () {
  const en = this.commonsTags[this.pickTagKey()]
  const enTag = Array.isArray(en) ? en[0] : (en || 'art')
  const sources = ['giphy', 'reddit', 'imgur', 'gifbin']
  if (this.gifSourceIndex >= sources.length) { this.gifSourceIndex = 0; return }
  const s = sources[this.gifSourceIndex++]
  if (s === 'giphy') { this.fetchGiphy(enTag) }
  else if (s === 'reddit') { this.fetchReddit(enTag) }
  else if (s === 'imgur') { this.fetchImgur(enTag) }
  else { this.fetchGifbin() }
}
Background.prototype.fetchGiphy = function (q) {
  const url = 'https://api.giphy.com/v1/gifs/search?api_key=' + this.giphyKey + '&q=' + encodeURIComponent(q) + '&limit=25&rating=r'
  this.fetchJSON(url, (json) => {
    const gifs = json.data
    if (!gifs || !gifs.length) { this.tryNextGifSource(); return }
    const g = gifs[Math.floor(Math.random() * gifs.length)]
    const src = (g.images && (g.images.fixed_height_small || g.images.downsized || g.images.original) || {}).url
    if (src) { this.useGifUrl(src) } else { this.tryNextGifSource() }
  }, () => this.tryNextGifSource())
}
Background.prototype.fetchReddit = function (q) {
  const url = 'https://www.reddit.com/search.json?q=' + encodeURIComponent(q + ' url:.gif') + '&limit=25'
  this.fetchJSON(url, (json) => {
    const kids = json.data && json.data.children
    if (!kids || !kids.length) { this.tryNextGifSource(); return }
    const urls = []
    for (const k of kids) {
      const d = k.data
      const u = d && (d.url || (d.preview && d.preview.images && d.preview.images[0] && d.preview.images[0].source && d.preview.images[0].source.url))
      if (u && /\.gif($|\?)/i.test(u)) { urls.push(u) }
    }
    if (!urls.length) { this.tryNextGifSource(); return }
    this.useGifUrl(urls[Math.floor(Math.random() * urls.length)])
  }, () => this.tryNextGifSource())
}
Background.prototype.fetchImgur = function (q) { this.scrapeGifUrls('https://imgur.com/search/score?q=' + encodeURIComponent(q), (u) => this.useGifUrl(u), () => this.tryNextGifSource()) }
Background.prototype.fetchGifbin = function () { this.scrapeGifUrls('https://gifbin.com/', (u) => this.useGifUrl(u), () => this.tryNextGifSource()) }
Background.prototype.scrapeGifUrls = function (pageUrl, cb, eb) {
  this.fetchText(pageUrl, (html) => {
    const m = html.match(/https?:\/\/[^"'\s\\<>]+\.gif/g) || []
    const uniq = []
    for (const u of m) { if (uniq.indexOf(u) < 0) { uniq.push(u) } }
    if (!uniq.length) { eb(); return }
    cb(uniq[Math.floor(Math.random() * uniq.length)])
  }, eb)
}
Background.prototype.useGifUrl = function (url) {
  this.httpGet(url, (buf) => { this.setSwarmData('data:image/gif;base64,' + buf.toString('base64')) }, () => { this.setSwarmData(url) })
}
Background.prototype.ensureGifHost = function () {
  if (!this.gifHost) {
    this.gifHost = document.createElement('img')
    this.gifHost.style.cssText = 'position:fixed;left:-9999px;top:-9999px;pointer-events:none;'
    this.gifHost.setAttribute('aria-hidden', 'true')
    document.body.appendChild(this.gifHost)
  }
  return this.gifHost
}
Background.prototype.setSwarmData = function (src) {
  const img = this.ensureGifHost()
  img.onload = () => { if (img.naturalWidth) { img.width = img.naturalWidth; img.height = img.naturalHeight; this.initSwarm() } }
  img.onerror = () => { this.tryNextGifSource() }
  img.src = src
}
Background.prototype.initSwarm = function () {
  const img = this.gifHost
  const W = this.client.el.width; const H = this.client.el.height
  const boids = []
  const cx = W * (0.3 + Math.random() * 0.4); const cy = H * (0.3 + Math.random() * 0.4)
  for (let i = 0; i < 17; i++) { boids.push({ x: cx + (Math.random() - 0.5) * 350, y: cy + (Math.random() - 0.5) * 250, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 }) }
  this.swarm = { img: img, boids: boids, nextTeleport: Date.now() + 6000 + Math.random() * 8000 }
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
    const max = 4.5 + bass * 4; const min = 1.8
    if (sp > max) { b.vx = b.vx / sp * max; b.vy = b.vy / sp * max }
    if (sp < min) { b.vx = b.vx / sp * min; b.vy = b.vy / sp * min }
    b.x += b.vx * (1 + bass); b.y += b.vy * (1 + bass)
  }
}
Background.prototype.drawSwarm = function (ctx, W, H) {
  if (!this.swarm) { return }
  const img = this.swarm.img
  if (!img.naturalWidth) { return }
  const bass = this.client.audioReactor ? (this.client.audioReactor.bass || 0) : 0
  this.stepSwarm(W, H, bass)
  const th = 90; const sc = th / img.naturalHeight; const dw = img.naturalWidth * sc
  ctx.save(); ctx.globalAlpha = 0.9
  for (let i = 0; i < this.swarm.boids.length; i++) { const b = this.swarm.boids[i]; ctx.drawImage(img, b.x - dw / 2, b.y - th / 2, dw, th) }
  ctx.restore()
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
Background.prototype.fetchArchive = function () {
  const tag = this.pickTag()
  const wantVideo = Math.random() > 0.6
  const mt = wantVideo ? 'movies' : 'image'
  const q = encodeURIComponent(`subject:(${tag}) AND mediatype:(${mt})`)
  fetch(`https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&rows=50&page=1&output=json`).then(r => r.json()).then(json => {
    const docs = json.response && json.response.docs
    if (!docs || !docs.length) { throw new Error('no docs') }
    const id = docs[Math.floor(Math.random() * docs.length)].identifier
    return fetch(`https://archive.org/metadata/${id}`).then(r => r.json()).then(meta => {
      const files = meta.files || []
      const vids = files.filter(f => /\.(mp4|ogv)$/.test(f.name))
      const imgs = files.filter(f => /\.(jpg|jpeg|png)$/.test(f.name))
      if (wantVideo && vids.length) { this.addVideoLayer('https://archive.org/download/' + id + '/' + encodeURIComponent(vids[Math.floor(Math.random() * vids.length)].name)) }
      else if (imgs.length) { this.addLayerFromUrl('https://archive.org/download/' + id + '/' + encodeURIComponent(imgs[Math.floor(Math.random() * imgs.length)].name)) }
      else { throw new Error('no files') }
    })
  }).catch(() => { this.addLayerFromUrl('https://picsum.photos/seed/' + this.pickTag() + Math.floor(Math.random() * 1000) + '/960/720') })
}
Background.prototype.loadBackground = function () {
  let files = []
  try {
    const fs = require('fs'); const path = require('path')
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
    const scale = (0.25 + Math.random() * 0.45) * H / v.videoHeight
    const vx = this.makeSpeed()
    this.layers.push({ type: 'video', img: v, x: Math.random() * W, y: Math.random() * H, w: v.videoWidth * scale, h: v.videoHeight * scale, vx: vx, vy: (Math.random() - 0.5) * 70, jx: 0, jy: 0, flick: 0, fast: Math.abs(vx) > 300 })
    while (this.layers.length > 7) { const old = this.layers.shift(); if (old.type === 'video') { old.img.pause() } }
    this.mode = 'layers'; v.play().catch(() => {})
  }
  v.onerror = () => { this.fetchArchive() }
  v.src = url
}
Background.prototype.addLayer = function (img) {
  if (!img.naturalWidth) { return }
  const W = this.client.el.width; const H = this.client.el.height
  const scale = (0.25 + Math.random() * 0.45) * H / img.naturalHeight
  const vx = this.makeSpeed()
  this.layers.push({ type: 'img', img: img, x: Math.random() * W, y: Math.random() * H, w: img.naturalWidth * scale, h: img.naturalHeight * scale, vx: vx, vy: (Math.random() - 0.5) * 70, jx: 0, jy: 0, flick: 0, fast: Math.abs(vx) > 300 })
  while (this.layers.length > 7) { const old = this.layers.shift(); if (old.type === 'video') { old.img.pause() } }
  this.mode = 'layers'
  if (this.video) { this.video.pause() }
}
Background.prototype.startAuto = function () {
  this.stopAuto(); this.autoUntil = Date.now() + 60000; this.loadBackground()
  this.autoTimer = setInterval(() => { if (Date.now() > this.autoUntil) { this.stopAuto(); return } this.loadBackground() }, 30000)
}
Background.prototype.stopAuto = function () { if (this.autoTimer) { clearInterval(this.autoTimer); this.autoTimer = null } }
Background.prototype.setVideo = function (url) {
  if (!this.video) { this.video = document.createElement('video'); this.video.muted = true; this.video.loop = true; this.video.playsInline = true }
  if (/^https?:/.test(url)) { this.video.crossOrigin = 'anonymous' }
  this.video.src = url; this.video.play().catch(() => {})
  this.mode = 'video'; this.layers = []
}
Background.prototype.draw = function (ctx, W, H) {
  const now = performance.now(); const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000); this.lastT = now
  if (this.mode === 'video' && this.video) {
    const sw = this.video.videoWidth; const sh = this.video.videoHeight
    if (sw && sh) { const scale = Math.min(W / sw, H / sh); ctx.save(); ctx.globalAlpha = 0.85; ctx.drawImage(this.video, (W - sw * scale) / 2, (H - sh * scale) / 2, sw * scale, sh * scale); ctx.restore() }
    return
  }
  for (let i = 0; i < this.layers.length; i++) {
    const L = this.layers[i]
    L.x += L.vx * dt; L.y += L.vy * dt
    if (L.x > W) { L.x = -L.w } if (L.x + L.w < 0) { L.x = W }
    if (L.y > H) { L.y = -L.h } if (L.y + L.h < 0) { L.y = H }
    if (!L.fast && (!L.flick || now > L.flick)) { L.jx = (Math.random() - 0.5) * 5; L.jy = (Math.random() - 0.5) * 4; L.flick = now + 120 + Math.random() * 200 } else if (L.fast) { L.jx = 0; L.jy = 0 }
    ctx.save(); ctx.globalAlpha = 0.8; ctx.drawImage(L.img, L.x + L.jx, L.y + L.jy, L.w, L.h); ctx.restore()
  }
}
Background.prototype.off = function () {
  this.stopAuto()
  if (this.swarmAuto) { clearInterval(this.swarmAuto); this.swarmAuto = null }
  this.mode = 'none'
  for (let i = 0; i < this.layers.length; i++) { if (this.layers[i].type === 'video') { this.layers[i].img.pause() } }
  this.layers = []; this.swarm = null
  if (this.video) { this.video.pause() }
}
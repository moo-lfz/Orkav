'use strict'
// ============================================================================
// Model3d — carica modelli 3D (GLB/GLTF) via web con sistema TAG, come per le
// GIF e i background. Usa three.js (import dinamico da CDN, CSP jsdelivr già ok).
// Reattivo ad audio (rotazione/scala da bass/mid/high) e al face tracking
// (rotazione testa → rotazione modello, bocca → scala, posizione → orbita).
// Supporta aggiunta di nuovi tag via Cmd+W (come per gif/background) e modelli
// locali nella cartella <sources>/models.
// ============================================================================
function Model3d (client) {
  this.client = client
  this.ready = false
  this.active = false
  this.loading = false
  this._initPromise = null
  this.THREE = null
  this.GLTFLoader = null
  this.renderer = null
  this.scene = null
  this.camera = null
  this.model = null
  this.mixer = null
  this.canvas = null
  this.modelDir = null
  // Tag → URL GLB. Curated + fallback Khronos sample models (gratuiti, CORS aperti).
  // FALLBACK locale (usato solo se Thingiverse non è configurato):
  // modelli GLB campione con CORS aperto.
  this.tagModels = {
    duck: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Duck/glTF-Binary/Duck.glb',
    brain: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/BrainStem/glTF-Binary/BrainStem.glb',
    fox: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Fox/glTF-Binary/Fox.glb',
    robot: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb',
    aviator: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb',
    helmet: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb'
  }
  this._keys = Object.keys(this.tagModels)
  this._idx = 0
  // --- THINGIVERSE (sorgente principale dei modelli) ---------------------
  // L'API pubblica richiede un token personale (gratuito): thingiverse.com/apps
  // Impostalo con il comando  tvtoken:<IL_TUO_TOKEN>  e Orkav cercherà i modelli
  // su Thingiverse in base al tag corrente (STL/OBJ/GLB).
  this.tvToken = null
  this.tvBase = 'https://api.thingiverse.com'
  this.tvCache = []          // ultimi risultati di ricerca (thing)
  this._tvLoading = false
  try { this.tvToken = window.localStorage.getItem('thingiverse_token') || null } catch (e) { this.tvToken = null }
  // Parametri di controllo esposti (letti/scritti da client + audio + face).
  // Deformazione strutturale via vertex displacement (vedi _setupDeformation).
  this.params = {
    rotationY: 0,    // rotazione continua (auto, velocità da bass)
    roll: 0,         // inclinazione testa (face tracking)
    pitch: 0,        // annuire su/giù (face tracking)
    yaw: 0,          // gira la testa dx/sx (face tracking)
    scale: 1,        // scala globale (bocca aperta → cresce)
    dispAmount: 0,   // 0..1 ampiezza deformazione struttura (mid/high audio)
    dispFreq: 4,     // frequenza ondulazione (high audio)
    dispTime: 0,     // tempo accumulato per l'ondulazione
    posX: 0,         // posizione orizzontale nello schermo (vagabondaggio)
    posY: 0,         // posizione verticale nello schermo
    drift: 0,        // tempo accumulato del vagabondaggio
    spinX: 0,        // rotazione sull'asse X (capriole)
    spinZ: 0         // rotazione sull'asse Z (rollio)
  }
  this._dispUniform = null
  this._meshes = []
  // --- MULTI-OGGETTO: più modelli contemporaneamente -----------------------
  // Ogni voce: { obj, mixer, uniform, baseScale, basePos, phase, spinX, spinZ, tag }
  this.models = []
  // Fino a 10 modelli in scena (era 6). Regolabile con models:<n>.
  this.maxModels = 10
  // --- GLOSSY: materiale lucido con riflessi d'ambiente -------------------
  this.glossy = false
  this._envTexture = null
  this._pmrem = null
  // Ultimo modello scelto: evita di ripescare lo stesso a ogni ricarica
  this._lastPick = null
}

Model3d.prototype.resolveModelsDir = function () {
  try {
    const base = window.location.href.replace('file://', '').replace(/\/[^\/]*$/, '')
    return base + '/models'
  } catch (e) {
    return null   // nessun path personale hardcoded
  }
}

Model3d.prototype.init = function () {
  if (this._initPromise) return this._initPromise
  this.loading = true
  this._initPromise = (async () => {
    try {
      // Usa gli alias definiti nell'import map di index.html:
      //   "three"          → three.module.js
      //   "three/addons/"  → examples/jsm/
      // (importare l'URL diretto fallirebbe perché GLTFLoader.js importa 'three'
      //  come bare specifier → serve l'import map)
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
      const { STLLoader } = await import('three/addons/loaders/STLLoader.js')
      const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js')
      // RoomEnvironment serve per l'effetto GLOSSY (riflessi d'ambiente)
      let RoomEnvironment = null
      try {
        const envMod = await import('three/addons/environments/RoomEnvironment.js')
        RoomEnvironment = envMod.RoomEnvironment || envMod.default || null
      } catch (e) { console.warn('[Model3d] RoomEnvironment non disponibile:', e && e.message) }
      this.THREE = THREE
      this.GLTFLoader = GLTFLoader
      this.STLLoader = STLLoader
      this.OBJLoader = OBJLoader
      this._RoomEnvironment = RoomEnvironment
      this.modelDir = this.resolveModelsDir()
      this.ready = true
      console.log('[Model3d] three.js pronto (GLTF + STL + OBJ) — Thingiverse:', this.tvToken ? 'configurato' : 'token mancante')
    } catch (e) {
      console.error('[Model3d] init fallito:', e)
      this._initPromise = null
    } finally {
      this.loading = false
    }
  })()
  return this._initPromise
}

Model3d.prototype._buildScene = function () {
  const THREE = this.THREE
  const canvas = document.createElement('canvas')
  // 960×540 invece di 1280×720: −44% pixel da renderizzare, e il modello è un
  // elemento di scena sopra il feed — l'upscale in drawImage è gratis (GPU).
  const W3D = 960, H3D = 540
  canvas.width = W3D; canvas.height = H3D
  canvas.style.cssText = 'display:block;'
  this.canvas = canvas
  this.renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, preserveDrawingBuffer: true,
    powerPreference: 'high-performance', stencil: false, depth: true
  })
  this.renderer.setPixelRatio(1)        // niente retina: raddoppierebbe i pixel
  this.renderer.setSize(W3D, H3D, false)
  this.renderer.setClearColor(0x000000, 0)
  // Colori corretti + tonemapping: senza questi un glTF PBR (Poly Haven)
  // esce piatto e scuro, con le alte luci bruciate.
  try {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
  } catch (e) {}
  this.scene = new THREE.Scene()
  this.camera = new THREE.PerspectiveCamera(45, W3D / H3D, 0.1, 100)
  this.camera.position.set(0, 1, 3)
  this.camera.lookAt(0, 0, 0)
  // luci
  this.scene.add(new THREE.AmbientLight(0xffffff, 0.85))
  // Hemisphere = luce ambiente direzionale morbida: schiarisce le facce in ombra
  // senza appiattire (era il motivo principale per cui i modelli restavano scuri).
  this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x30303a, 1.1))
  const d = new THREE.DirectionalLight(0xffffff, 1.6)
  d.position.set(2, 3, 4)
  this.scene.add(d)
  const d2 = new THREE.DirectionalLight(0xbfd4ff, 0.7)   // controluce di riempimento
  d2.position.set(-3, 1.5, -2)
  this.scene.add(d2)
  const p = new THREE.PointLight(0x39ff14, 1.0, 20)
  p.position.set(-2, 1, 2)
  this.scene.add(p)
  // Environment map SEMPRE attiva (non solo col glossy): i materiali PBR
  // metallici di Poly Haven senza IBL vengono renderizzati neri.
  this._ensureEnv()
}

// Alt+P: ON (ricarica 1 modello per il tag corrente) / OFF
Model3d.prototype.toggle = async function (tag) {
  if (!this.ready) { await this.init(); if (!this.ready) return false }
  this.active = !this.active
  if (this.active) {
    this.clearModels()
    // Riparti da una zona diversa dello schermo ad ogni attivazione
    if (this.client && this.client.resetSlots) { this.client.resetSlots() }
    await this.loadRandom(tag)
  } else {
    console.log('[Model3d] disattivato')
  }
  return this.active
}

// Alt+M: aggiunge un ALTRO modello (multi-oggetto) restando attivo
Model3d.prototype.addModel = async function (tag) {
  if (!this.ready) { await this.init(); if (!this.ready) return false }
  this.active = true
  await this.loadRandom(tag, { add: true })
  return true
}

// Carica un modello nuovo, provando le sorgenti in ordine:
//   1) Thingiverse  (solo se il token è configurato)
//   2) Poly Haven   (CC0, API pubblica senza token)  ← default
//   3) lista GLB di fallback
// opts.add = true → AGGIUNGE invece di sostituire (multi-oggetto)
Model3d.prototype.loadRandom = async function (tag, opts) {
  const add = !!(opts && opts.add)
  if (!add) this.clearModels()
  // TAG: se non è passato esplicitamente AVANZA il cursore del canale 'model',
  // così ogni Alt+P / Alt+M carica un modello da un tag diverso. Se il canale
  // è pinnato con tag3d:<x>, nextTagFor restituisce quello e non ruota.
  let term = tag
  if (!term && this.client && this.client.nextTagFor) { term = this.client.nextTagFor('model') }
  if (!term && this.client && this.client.tagFor) { term = this.client.tagFor('model') }
  if (!term) { term = 'low poly' }
  this._lastTerm = term
  this.status('3D ' + (add ? '+ ' : '') + term)
  if (this.tvToken) {
    const okTv = await this.loadFromThingiverse(term)
    if (okTv) { this.status(null); console.log('[Model3d] attivo (Thingiverse):', term); return true }
    console.warn('[Model3d] Thingiverse fallito, provo Poly Haven')
  }
  const okPh = await this.loadFromPolyHaven(term)
  if (okPh) { this.status(null); console.log('[Model3d] attivo (Poly Haven):', term); return true }
  console.warn('[Model3d] Poly Haven fallito, uso il fallback GLB locale')
  const url = this.pickModelUrl(tag)
  const ok = await this.loadModel(url)
  this.status(null)
  console.log('[Model3d] attivo (fallback GLB):', url)
  return ok
}

// Messaggio di stato mostrato nel terminale di Orkav (riga telemetria).
Model3d.prototype.status = function (msg) {
  try { if (this.client && this.client.setLoader) { this.client.setLoader(msg) } } catch (e) {}
}

Model3d.prototype.stop = function () {
  this.active = false
}

// ============================================================================
// POLY HAVEN — 520+ modelli CC0, API pubblica SENZA token, CORS aperto.
// È la sorgente principale quando Thingiverse non è configurato.
// ============================================================================
Model3d.PH_API = 'https://api.polyhaven.com'

// Tag Orkav → termini Poly Haven (categorie/tag/parole nel nome del modello).
// Poly Haven è realistico (props, natura, industria), quindi i tag pop vengono
// tradotti in qualcosa di equivalente e visivamente sensato.
Model3d.PH_ALIAS = {
  pokemon: ['creature'],
  gatti: ['creature', 'cat'],
  merda: ['dirty', 'weathered'],
  '1312': ['industrial', 'barrier'],
  'michale jackson': ['instrument', 'stage'],
  'twin peaks': ['forest', 'tree', 'pine'],
  simpson: ['food', 'donut'],
  'rick and morty': ['electronics', 'lab'],
  'the office': ['office', 'desk', 'furniture'],
  friends: ['seating', 'furniture', 'couch'],
  'south park': ['snow', 'mountain'],
  'liminal space': ['structures', 'corridor', 'office'],
  'horror vacui': ['decorative', 'ornate'],
  cyberfeminism: ['electronics', 'plastic'],
  cyberdeck: ['electronics', 'computer', 'keyboard'],
  hacktivism: ['electronics', 'computer'],
  hacker: ['electronics', 'computer', 'office'],
  matrix: ['electronics', 'monitor'],
  'red pill': ['dish', 'bottle', 'container'],
  'blue pill': ['dish', 'bottle', 'container'],
  'sex workers': ['decorative', 'neon'],
  demons: ['creature', 'statue'],
  lucifer: ['lighting', 'lamp', 'candle'],
  satan: ['creature', 'statue'],
  esoterism: ['decorative', 'ornate', 'vintage'],
  ai: ['electronics', 'robot'],
  ki: ['electronics', 'robot'],
  'solar opposites': ['ships', 'structures'],
  brickleberry: ['nature', 'trees', 'forest'],
  futurama: ['electronics', 'spaceship']
}

Model3d.prototype._phAssets = async function () {
  if (this._phCache) return this._phCache
  // L'indice è ~530 KB e cambia raramente: cache su disco per 7 giorni
  // (userData/cache/ph_index_v1.json via Net). Prima era riscaricato a ogni avvio.
  const CACHE_KEY = 'ph_index_v1'
  const TTL = 7 * 24 * 3600 * 1000
  const hit = window.Net ? await Net.cacheLoad(CACHE_KEY, TTL) : null
  if (hit && typeof hit === 'object') {
    this._phCache = hit
    const age = Math.round((Net.cacheAge(CACHE_KEY) || 0) / 3600000)
    console.log('[Model3d] Poly Haven: indice in cache (' + Object.keys(hit).length + ' modelli, ' + age + 'h fa)')
    return this._phCache
  }
  const ctl = window.Net ? Net.begin('ph-index') : null
  const json = window.Net
    ? await Net.json(Model3d.PH_API + '/assets?t=models', ctl ? { signal: ctl.signal } : {}, 8000)
    : await fetch(Model3d.PH_API + '/assets?t=models').then(r => { if (!r.ok) throw new Error('Poly Haven HTTP ' + r.status); return r.json() })
  this._phCache = json
  if (window.Net && this._phCache) {
    const ok = await Net.cacheSave(CACHE_KEY, this._phCache)
    if (!ok) { console.warn('[Model3d] indice Poly Haven non salvato in cache') }
  }
  console.log('[Model3d] Poly Haven:', Object.keys(this._phCache).length, 'modelli disponibili (CC0)')
  return this._phCache
}

// Sceglie un id di modello Poly Haven per un termine/tag.
// Ritorna { id, name, matched } oppure null.
Model3d.prototype.pickPolyHaven = function (assets, term) {
  const ids = Object.keys(assets || {})
  if (!ids.length) return null
  const raw = String(term || '').toLowerCase().trim()
  const aliases = Model3d.PH_ALIAS[raw] || []
  // termini da cercare: alias + le singole parole del tag
  const terms = aliases.concat(raw.split(/[\s,]+/).filter(w => w.length > 2))

  const score = (id) => {
    const a = assets[id] || {}
    const hay = (
      id + ' ' + (a.name || '') + ' ' +
      (a.categories || []).join(' ') + ' ' +
      (a.tags || []).join(' ')
    ).toLowerCase()
    let s = 0
    for (const t of terms) { if (t && hay.indexOf(t) >= 0) s += 1 }
    return s
  }

  // Tutti i candidati in ordine di punteggio
  const ranked = ids.map(id => ({ id: id, s: score(id) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
  let chosen = null, why = ''
  if (ranked.length) {
    // Scelta fra i migliori, EVITANDO l'ultimo usato: due Alt+P di fila danno
    // modelli diversi invece di ripescare sempre lo stesso.
    const top = ranked.slice(0, Math.min(8, ranked.length))
    const fresh = top.filter(x => x.id !== this._lastPick)
    const pickFrom = fresh.length ? fresh : top
    chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)].id
    why = `(match ${ranked[0].s}, ${ranked.length} candidati)`
  } else {
    // Nessuna corrispondenza → modello a caso, evitando il precedente
    const fresh = ids.filter(i => i !== this._lastPick)
    chosen = (fresh.length ? fresh : ids)[Math.floor(Math.random() * (fresh.length ? fresh.length : ids.length))]
    why = '(nessun match → casuale)'
  }
  this._lastPick = chosen
  console.log('[Model3d] Poly Haven pick:', chosen, why)
  return { id: chosen, name: (assets[chosen] && assets[chosen].name) || chosen, matched: ranked.length > 0 }
}

// Scarica i file di un modello passando dalla cache BINARIA su disco e li
// restituisce come blob URL (basename → blob:). `__hits` conta quanti sono
// arrivati dal disco, per il log.
Model3d.prototype._cacheModelFiles = async function (id, res, byName) {
  const out = {}
  let hits = 0
  const api = window.api && window.api.cache
  const names = Object.keys(byName)
  if (!api || !api.getBin || !names.length) { return out }
  const TTL = 30 * 24 * 3600 * 1000   // 30 giorni: i modelli Poly Haven non cambiano
  const base = ('mdl_' + id + '_' + (res || '1k')).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40)
  await Promise.all(names.map(async (n) => {
    const ck = (base + '_' + n).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64)
    let buf = null
    try {
      const box = await api.getBin(ck)
      if (box && box.b && (!box.t || (Date.now() - box.t) < TTL)) { buf = box.b; hits++ }
    } catch (e) {}
    if (!buf) {
      try {
        const res2 = await Net.fetch(byName[n], {}, 20000)
        if (!res2.ok) { return }
        buf = await res2.arrayBuffer()
        if (api.setBin) { await api.setBin(ck, buf) }
      } catch (e) { return }
    }
    try { out[n] = URL.createObjectURL(new Blob([buf])) } catch (e) {}
  }))
  out.__hits = hits
  // Tiene traccia dei blob per poterli revocare quando il modello esce di scena
  if (!this._blobUrls) this._blobUrls = []
  for (const k of names) { if (out[k]) { this._blobUrls.push(out[k]) } }
  while (this._blobUrls.length > 160) {   // ~20 modelli in cache di blob
    const u = this._blobUrls.shift()
    try { URL.revokeObjectURL(u) } catch (e) {}
  }
  return out
}

// Carica un modello Poly Haven (glTF multi-file risolto via tabella `include`)
Model3d.prototype.loadFromPolyHaven = async function (term, res) {
  try {
    const assets = await this._phAssets()
    const pick = this.pickPolyHaven(assets, term)
    if (!pick) throw new Error('nessun modello Poly Haven')
    const fresCtl = window.Net ? Net.begin('ph-files') : null
    const fres = window.Net
      ? await Net.fetch(Model3d.PH_API + '/files/' + encodeURIComponent(pick.id), fresCtl ? { signal: fresCtl.signal } : {}, 6000)
      : await fetch(Model3d.PH_API + '/files/' + encodeURIComponent(pick.id))
    if (!fres.ok) throw new Error('Poly Haven files HTTP ' + fres.status)
    const files = await fres.json()
    const wanted = res || '1k'
    const entry = files.gltf && files.gltf[wanted] && files.gltf[wanted].gltf
    if (!entry || !entry.url) throw new Error('glTF non disponibile per ' + pick.id)

    // Mappa basename → URL assoluto (il .gltf referenzia .bin e texture relativi)
    const include = entry.include || {}
    const byName = {}
    for (const k of Object.keys(include)) {
      const base = decodeURIComponent(String(k).split('/').pop())
      if (include[k] && include[k].url) byName[base] = include[k].url
    }

    // CACHE SU DISCO DEI FILE DEL MODELLO (.gltf + .bin + texture).
    // Il primo caricamento li scarica e li salva in userData/orkav-cache/bin/;
    // dal secondo in poi sono letti dal disco (nessuna rete). I byte vengono
    // esposti come blob URL, così il modifier resta sincrono.
    this.status('3D ' + pick.id)
    const cached = await this._cacheModelFiles(pick.id, wanted, byName)
    const modifier = (u) => {
      const base = decodeURIComponent(String(u).split('/').pop().split('?')[0])
      return cached[base] || byName[base] || u
    }
    this._lastBlobUrls = null

    console.log('[Model3d] Poly Haven glTF:', entry.url, '| risorse:', Object.keys(byName).length,
      cached.__hits ? '| dalla cache: ' + cached.__hits : '| scaricate')
    const ok = await this._loadGLTF(entry.url, modifier)
    if (ok) {
      this.current = { source: 'polyhaven', id: pick.id, name: pick.name }
      console.log('[Model3d] Poly Haven caricato:', pick.name)
      return true
    }
    console.warn('[Model3d] Poly Haven: glTF non caricato per', pick.id)
    return false
  } catch (e) {
    console.warn('[Model3d] Poly Haven non disponibile:', e.message)
    return false
  }
}

// ============================================================================
// THINGIVERSE (richiede token approvato)
// ============================================================================
Model3d.prototype.setToken = function (token) {
  this.tvToken = (token || '').trim() || null
  try {
    if (this.tvToken) window.localStorage.setItem('thingiverse_token', this.tvToken)
    else window.localStorage.removeItem('thingiverse_token')
  } catch (e) {}
  console.log('[Model3d] Thingiverse token', this.tvToken ? 'impostato' : 'rimosso')
  return !!this.tvToken
}

// Istruzioni per ottenere il token (l'API risponde 401 senza).
Model3d.TOKEN_HELP = [
  'Thingiverse richiede un token personale:',
  '1) fai LOGIN su thingiverse.com (senza login la pagina del token non si apre)',
  '2) apri https://www.thingiverse.com/apps/create',
  '3) "Create an App" (nome/URL qualsiasi) e copia l\'Access Token',
  '4) qui esegui: tvtoken:<IL_TOKEN>'
]

Model3d.prototype._tvFetch = async function (path) {
  if (!this.tvToken) throw new Error('token Thingiverse mancante')
  const sep = path.indexOf('?') >= 0 ? '&' : '?'
  const url = this.tvBase + path + sep + 'access_token=' + encodeURIComponent(this.tvToken)
  const res = await Net.fetch(url, { headers: { Accept: 'application/json' } }, 6000)
  if (!res.ok) {
    // 401 = token assente/scaduto → messaggio azionabile
    if (res.status === 401) {
      let kind = ''
      try { const j = await res.json(); kind = (j && j.type) ? j.type : '' } catch (e) {}
      throw new Error('token non valido (' + (kind || '401') + ') — rigeneralo su thingiverse.com/apps/create')
    }
    if (res.status === 404) throw new Error('non trovato su Thingiverse (404)')
    if (res.status === 429) throw new Error('troppe richieste a Thingiverse (429) — riprova fra poco')
    throw new Error('Thingiverse HTTP ' + res.status)
  }
  return res.json()
}

// Cerca "things" su Thingiverse per parola chiave. Ritorna [{id,name,url,creator}]
Model3d.prototype.search = async function (term, page = 1) {
  const q = encodeURIComponent(term || 'low poly')
  const list = await this._tvFetch('/search/' + q + '?type=things&per_page=24&page=' + page)
  const out = (Array.isArray(list) ? list : []).map(t => ({
    id: t.id,
    name: t.name,
    url: t.public_url || ('https://www.thingiverse.com/thing:' + t.id),
    creator: (t.creator && (t.creator.name || t.creator.first_name)) || ''
  }))
  this.tvCache = out
  console.log('[Model3d] Thingiverse:', out.length, 'risultati per', term)
  return out
}

// Elenca i file di un thing e sceglie il primo stampabile 3D (stl/obj/glb)
Model3d.prototype.filesFor = async function (thingId) {
  const files = await this._tvFetch('/things/' + thingId + '/files')
  const list = (Array.isArray(files) ? files : []).map(f => ({
    name: f.name || '',
    url: f.download_url || (f.public_url ? f.public_url + '?access_token=' + this.tvToken : null),
    thumb: f.thumbnail || null
  })).filter(f => f.url)
  // preferisci stl → obj → glb/gltf
  const rank = (n) => {
    const l = (n || '').toLowerCase()
    if (l.endsWith('.stl')) return 0
    if (l.endsWith('.obj')) return 1
    if (l.endsWith('.glb')) return 2
    if (l.endsWith('.gltf')) return 3
    return 9
  }
  list.sort((a, b) => rank(a.name) - rank(b.name))
  return list
}

// Sceglie un modello da Thingiverse per tag e lo carica.
// throwOnError=true → rilancia (così il chiamante può fare fallback)
Model3d.prototype.loadFromThingiverse = async function (term, throwOnError = false) {
  try {
    if (!this.tvToken) throw new Error('token Thingiverse mancante')
    const things = await this.search(term || (this.client && this.client.tagFor ? this.client.tagFor('model') : null) || (this.client && this.client.currentTag) || 'low poly')
    if (!things.length) throw new Error('nessun risultato per "' + term + '"')
    // mescola e prova finché trova un file caricabile
    const pool = things.slice().sort(() => Math.random() - 0.5).slice(0, 6)
    for (const t of pool) {
      const files = await this.filesFor(t.id)
      if (!files.length) continue
      const file = files[0]
      const ok = await this.loadModel(file.url, file.name)
      if (ok) {
        this.current = { source: 'thingiverse', thing: t, file: file.name }
        console.log('[Model3d] Thingiverse caricato:', t.name, '→', file.name)
        return true
      }
    }
    throw new Error('nessun file 3D caricabile nei risultati')
  } catch (e) {
    console.warn('[Model3d] Thingiverse non disponibile:', e.message)
    if (throwOnError) throw e
    return false
  }
}

// Sceglie un modello: 1) tag passato 2) tag corrente del client 3) rotazione
Model3d.prototype.pickModelUrl = function (tag) {
  const t = (tag || (this.client && this.client.currentTag) || '').toLowerCase()
  if (t && this.tagModels[t]) return this.tagModels[t]
  // fuzzy: cerca una key che contiene il tag
  for (const k of this._keys) { if (t && k.indexOf(t) >= 0) return this.tagModels[k] }
  // rotazione casuale
  this._idx = (this._idx + 1) % this._keys.length
  return this.tagModels[this._keys[this._idx]]
}

// Prepara la deformazione strutturale: inietta displacement nei vertex shader
// di TUTTI i materiali del modello. L'uniform `u_disp` (vec4) pilota
// l'ondulazione della geometria: x=ampiezza, y=frequenza, z=asse, w=tempo.
Model3d.prototype._setupDeformation = function (root, uniform) {
  if (!root || !this.THREE) return
  const THREE = this.THREE
  if (!uniform) {
    uniform = { value: new THREE.Vector4(0, 4, 0, 0) }
    this._dispUniform = uniform
    this._meshes = []
  }
  root.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      if (uniform === this._dispUniform) this._meshes.push(obj)
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (!mat || mat._orkavDeformed) continue
        mat._orkavDeformed = true
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.u_disp = uniform
          shader.vertexShader = 'uniform vec4 u_disp;\n' + shader.vertexShader
          // Inietta il displacement dopo la posizione iniziale:
          // sposta i vertici lungo la normale approssimata (direzione radiale)
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n' +
            '  float _d = sin(position.y * u_disp.y + u_disp.w) * u_disp.x;\n' +
            '  _d += sin(position.x * u_disp.y * 0.7 + u_disp.w * 1.3) * u_disp.x * 0.6;\n' +
            '  _d += cos(position.z * u_disp.y * 0.5 + u_disp.w * 0.8) * u_disp.x * 0.5;\n' +
            '  transformed += normal * _d;\n'
          )
        }
        mat.needsUpdate = true
      }
    }
  })
}

// ============================================================================
// GLOSSY — materiale lucido con riflessi d'ambiente (toggle)
// ============================================================================
// Costruisce una environment map procedurale (RoomEnvironment) e la applica
// alla scena: serve perché senza envMap i materiali "glossy" non hanno nulla
// da riflettere e sembrano solo plastica piatta.
Model3d.prototype._ensureEnv = function () {
  if (this._envTexture) return this._envTexture
  const THREE = this.THREE
  const prev = this.renderer.getRenderTarget ? this.renderer.getRenderTarget() : null
  try {
    this._pmrem = new THREE.PMREMGenerator(this.renderer)
    this._pmrem.compileEquirectangularShader()
    let scene = null
    try {
      // three r160: RoomEnvironment() senza argomenti
      scene = new this._RoomEnvironment()
    } catch (e) {
      scene = new this._RoomEnvironment(this.renderer)
    }
    this._envTexture = this._pmrem.fromScene(scene, 0.04).texture
    this.scene.environment = this._envTexture
    this.scene.environmentIntensity = 1.1
  } catch (e) {
    console.warn('[Model3d] environment map non creata:', e && e.message)
    // Fallback: nessuna env, il glossy si limita a specular + roughness bassa
    this._envTexture = null
  } finally {
    try { this.renderer.setRenderTarget(prev) } catch (e) {}
  }
  return this._envTexture
}

// Applica il materiale lucido a una voce della scena
Model3d.prototype._applyGlossyTo = function (entry) {
  if (!entry || !entry.baseMats) return
  const THREE = this.THREE
  this._ensureEnv()
  for (const rec of entry.baseMats) {
    if (!rec || !rec.mesh) continue
    if (!rec.mesh.userData._orkavGlossyMat) {
      const src = rec.mat
      const color = (src && src.color) ? src.color.clone() : new THREE.Color(0xdfe6ef)
      const map = src && src.map ? src.map : null
      const gm = new THREE.MeshPhysicalMaterial({
        color: color,
        map: map,
        metalness: 0.55,
        roughness: 0.08,          // molto lucido
        clearcoat: 1.0,           // strato trasparente sopra → "shiny"
        clearcoatRoughness: 0.03,
        reflectivity: 1.0,
        envMapIntensity: 1.6,
        iridescence: 0.35,        // riflesso iridescente, coerente con Orkav
        iridescenceIOR: 1.4,
        sheen: 0.4,
        sheenColor: new THREE.Color(0xbfe9ff),
        side: THREE.DoubleSide
      })
      rec.mesh.userData._orkavGlossyMat = gm
    }
    rec.mesh.material = rec.mesh.userData._orkavGlossyMat
    // Il materiale glossy è NUOVO: non ha ancora il displacement iniettato.
    // _setupDeformation salta i materiali già marcati `_orkavDeformed`, quindi
    // richiamarlo qui è sicuro: re-inietta solo il materiale appena creato.
    this._setupDeformation(rec.mesh, entry.uniform)
  }
}

// Ripristina i materiali originali
Model3d.prototype._clearGlossyFrom = function (entry) {
  if (!entry || !entry.baseMats) return
  for (const rec of entry.baseMats) {
    if (rec && rec.mesh && rec.mat) rec.mesh.material = rec.mat
  }
}

Model3d.prototype.setGlossy = function (on) {
  this.glossy = (on === undefined) ? !this.glossy : !!on
  if (this.glossy) {
    for (const e of this.models) this._applyGlossyTo(e)
  } else {
    for (const e of this.models) this._clearGlossyFrom(e)
  }
  console.log('[Model3d] glossy', this.glossy ? 'ON' : 'OFF')
  return this.glossy
}

Model3d.prototype.toggleGlossy = function () { return this.setGlossy() }

// Renderizza un frame nel canvas (chiamato da client.update)
Model3d.prototype.render = function (dt, now) {
  if (!this.active || !this.ready || !this.renderer || !this.scene) return false
  // --- 3D: throttle a ~30fps -------------------------------------------------
  // I modelli si muovono in slow-motion: 30fps sono indistinguibili da 60 e
  // liberano metà del budget di rendering. Il canvas ha preserveDrawingBuffer,
  // quindi il frame precedente resta disponibile per la drawImage nel feed.
  const t3d = performance.now()
  if (this._lastRender3d && (t3d - this._lastRender3d) < 32) return true
  this._lastRender3d = t3d
  try {
    const a = this.client.audioReactor
    // REATTIVITÀ AUDIO RIDOTTA + LISCIATA.
    // Le bande grezze sono spigolose (picchi sui transienti): passarle dirette
    // alla scala/displacement faceva "pompare" il modello. Una EMA le rende
    // fluide, e i fattori sotto sono ~3× più bassi di prima.
    if (!this._sm) this._sm = { bass: 0, mid: 0, high: 0, vol: 0 }
    const K = 0.07   // smoothing: più basso = più liscio/lento a seguire
    const KMAX = 0.35 // attacco più rapido quando il segnale sale, rilascio lento
    const tgt = {
      bass: a ? (a.bass || 0) : 0,
      mid: a ? (a.mid || 0) : 0,
      high: a ? (a.high || 0) : 0
    }
    for (const k of ['bass', 'mid', 'high']) {
      const kv = (tgt[k] > this._sm[k]) ? KMAX : K
      this._sm[k] += (tgt[k] - this._sm[k]) * kv
    }
    const bass = this._sm.bass
    const mid = this._sm.mid
    const high = this._sm.high
    const drive = a ? (a.drive || 0) : 0   // drive dell'audio capture (0..1)
    const fm = (this.client.faceTracker && this.client.faceTracker.metrics) || null
    const P = this.params
    // ATTENZIONE: `dt` arriva da client.update() in MILLISECONDI
    // (now - lastFrame). Va convertito in secondi: il vecchio `* dt * 60`
    // trattava i millisecondi come frame e faceva girare tutto ~16× troppo
    // veloce (un giro in 0.9 s con i bassi al massimo).
    const dts = dt / 1000

    // Aggiorna i parametri esposti
    P.rotationY += (0.090 + bass * 0.06) * dts
    P.roll = fm ? (fm.roll || 0) : 0
    P.pitch = fm ? (fm.pitch || 0) : 0
    P.yaw = fm ? (fm.yaw || 0) : 0
    const mouthScale = fm ? (fm.mouthOpen || 0) * 0.35 : 0
    // Reattività ridotta: la scala pulsava di ±30% col mid, ora ~±9%.
    P.scale = 1 + mouthScale + (mid > 0.12 && !fm ? mid * 0.09 : 0)
    P.dispAmount = Math.max(mid * 0.12, high * 0.10) + mouthScale * 0.18
    P.dispFreq = 3 + high * 6
    P.dispTime = now * 0.0015

    // --- VAGABONDAGGIO nello schermo -------------------------------------
    // Due oscillatori con frequenze NON multiple (0.7/0.23 e 0.53/0.31): il
    // modello non ripassa quasi mai per il centro, ma resta DENTRO il frame.
    //
    // Limiti della camera (z=3, fov 45°, aspect 16:9):
    //   semi-altezza visibile a z=0 = 3*tan(22.5°) ≈ 1.24
    //   semi-larghezza visibile      = 1.24 * 1.78  ≈ 2.21
    // L'ampiezza dei due termini si SOMMA (1 + 0.30 = 1.30×), quindi va tenuta
    // sotto il limite meno la metà del modello — altrimenti esce e "sparisce".
    //   X: 1.30 * 0.95 ≈ 1.24  (su 2.21 → resta ampiamente in campo)
    //   Y: 1.30 * 0.42 ≈ 0.55  (su 1.24 → resta in campo anche il modello)
    // ATTENZIONE: `dt` è in MILLISECONDI. `P.drift += dt` faceva avanzare la
    // fase di ~17 unità per frame: con speed≈0.16 il seno girava a ~18 Hz, cioè
    // il modello VIBRAVA sul posto invece di vagare (era il "flickering").
    // In secondi: 0.16*0.70 = 0.112 rad/s → un ciclo in ~56 s.
    P.drift += dts
    // Velocità MOLTO più bassa e poco influenzata dall'audio: ~30 s per un
    // ciclo a riposo, ~16 s con i bassi al massimo (prima scendeva a ~6 s).
    // L'influenza audio è stata ULTERIORMENTE ridotta (~3×) perché il modello
    // scattava a ogni colpo di basso.
    const speed = 0.16 + bass * 0.10 + high * 0.03
    // Ampiezze ridotte: il modello parte già dal SUO slot in periferia, quindi
    // il vagabondaggio è un'oscillazione attorno a quello slot (~±0.55 X,
    // ±0.16 Y) e non deve riportarlo al centro né spingerlo fuori dal frame.
    // Con più modelli in scena si stringe ancora, per non farli sovrapporre.
    const many = Math.max(1, this.models.length)
    const shrink = many === 1 ? 1 : Math.max(0.5, 1 / Math.sqrt(many))
    const ax = (0.55 + high * 0.05 + drive * 0.03) * shrink
    const ay = (0.16 + mid * 0.02 + drive * 0.02) * shrink
    P.posX = Math.sin(P.drift * speed * 0.70) * ax
          + Math.sin(P.drift * speed * 0.23 + 1.7) * ax * 0.28
    P.posY = Math.cos(P.drift * speed * 0.53) * ay
          + Math.cos(P.drift * speed * 0.31 + 0.6) * ay * 0.30

    // Capriole/rollio (parametri legacy, usati solo se `models` è vuoto):
    // stesse velocità slow-motion delle voci, quindi × dts e non × dt.
    P.spinX += (0.055 + mid * 0.05) * dts * (P.drift % 6.0 < 3.0 ? 1 : -1)
    P.spinZ += (0.040 + high * 0.04) * dts

    // Ogni modello ha il PROPRIO sfasamento (entry.phase): vagano per conto
    // loro invece di muoversi tutti insieme come un blocco unico.
    const list = this.models.length ? this.models : (this.model ? [{ obj: this.model, basePos: this.model.userData.basePos, baseScale: this.model.userData.baseScale, uniform: this._dispUniform, mixer: this.mixer, phase: 0, spinX: P.spinX, spinZ: P.spinZ, rotY: P.rotationY }] : [])
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (!e || !e.obj) continue
      const ph = e.phase || 0
      const sp = speed * (0.75 + (i * 0.17))
      // posizione: stessi oscillatori non multipli, ma sfasati per modello
      const px = Math.sin(P.drift * sp * 0.70 + ph) * ax
               + Math.sin(P.drift * sp * 0.23 + 1.7 + ph * 1.7) * ax * 0.28
      const py = Math.cos(P.drift * sp * 0.53 + ph * 0.7) * ay
               + Math.cos(P.drift * sp * 0.31 + 0.6 + ph * 1.3) * ay * 0.30
      // rotazioni proprie
      // --- ROTAZIONI IN SLOW-MOTION ---------------------------------------
      // Valori in RADIANTI AL SECONDO (× dts), non più per-frame.
      //   rotY  : un giro completo in ~70 s a riposo, ~25 s coi bassi al massimo
      //   spinX : capriola, un giro in ~115 s a riposo, ~36 s al massimo
      //   spinZ : rollio,  un giro in ~155 s a riposo, ~45 s al massimo
      // L'audio è un ACCENTO (+0.16 / +0.12 / +0.10), non un moltiplicatore:
      // prima `mid * 1.4` portava la capriola a 2.7 rad/s (un giro in 2.4 s).
      e.rotY = (e.rotY || 0) + (0.090 + bass * 0.06) * dts * (0.85 + (i % 3) * 0.15)
      e.spinX += (0.055 + mid * 0.05) * dts * (P.drift % 6.0 < 3.0 ? 1 : -1)
      e.spinZ += (0.040 + high * 0.04) * dts

      // Applicate 1:1: le velocità qui sopra SONO già quelle finali
      // (prima c'erano attenuazioni 0.35/0.5 che servivano a compensare
      //  l'errore di unità — ora non più necessarie).
      e.obj.rotation.y = e.rotY
      e.obj.rotation.z = P.roll + e.spinZ
      e.obj.rotation.x = P.pitch * 2 + e.spinX
      e.obj.scale.setScalar((e.baseScale || 1) * P.scale)
      const base = e.basePos
      if (base) {
        e.obj.position.x = base.x + px
        e.obj.position.y = base.y + py
      }
      // Deformazione strutturale propria
      if (e.uniform) {
        e.uniform.value.set(P.dispAmount, P.dispFreq, 0, P.dispTime + ph)
      }
      // AnimationMixer vuole i SECONDI: con dt in ms le animazioni GLB
      // giravano 1000× troppo veloci.
      if (e.mixer) e.mixer.update(dts)
    }
    // Compatibilità col parametro singolo
    P.spinX = list.length ? list[0].spinX : P.spinX
    P.spinZ = list.length ? list[0].spinZ : P.spinZ

    // La camera resta quasi ferma e guarda il centro: così il VAGABONDAGGIO dei
    // modelli si vede davvero sullo schermo (se la camera inseguisse, sembrerebbero
    // immobili al centro).
    this.camera.position.x = Math.sin(now * 0.0003) * 0.25
    this.camera.position.y = 1 + Math.sin(now * 0.0002) * 0.12
    this.camera.position.z = 3 + Math.cos(now * 0.00023) * 0.25
    this.camera.lookAt(0, 0, 0)
    this.renderer.render(this.scene, this.camera)
    return true
  } catch (e) { return false }
}

// Monta in scena un oggetto già caricato (comune a GLTF/STL/OBJ):
// normalizza scala, salva baseScale/basePos e prepara la deformazione.
Model3d.prototype._attach = function (object3d, animations) {
  const THREE = this.THREE
  // La scena può non esistere ancora (i loader glTF/STL/OBJ arrivano qui
  // direttamente, senza passare da _buildScene): senza questo la .add() finale
  // solleverebbe un TypeError inghiottito dal try/catch → modello mai mostrato.
  if (!this.scene) this._buildScene()
  // Limite: oltre maxModels si rimuove il più vecchio
  while (this.models.length >= this.maxModels) this._removeEntry(this.models[0])

  const box = new THREE.Box3().setFromObject(object3d)
  const size = box.getSize(new THREE.Vector3()).length()
  const center = box.getCenter(new THREE.Vector3())
  // Scala ridotta (2.0 invece di 2.5): il modello deve poter VAGARE per lo
  // schermo senza uscire dal tutto dal frame. Con più modelli si rimpicciolisce
  // ancora, così non si accavallano tutti addosso.
  // La scala normalizza la DIAGONALE del bounding box: 1.7 (non più 2.0) perché
  // un oggetto alto arriva a ~1.0 di semi-altezza sui 1.24 visibili in verticale,
  // lasciando troppo poco spazio per il vagabondaggio (usciva dal frame).
  const crowd = this.models.length > 0 ? (0.72 - Math.min(0.25, this.models.length * 0.08)) : 1
  const scale = (1.7 / (size || 1)) * crowd
  object3d.scale.setScalar(scale)
  object3d.position.sub(center.multiplyScalar(scale))
  // ZONA DELLO SCHERMO: il modello non nasce più al centro (dove sta la patch
  // Orca e dove finivano TUTTI). Lo slot normalizzato dell'allocatore viene
  // convertito in coordinate mondo per la camera a z=0:
  //   semi-larghezza visibile 2.21, semi-altezza 1.24
  // I fattori 0.42 / 0.45 tengono il modello ben dentro il frame.
  const slot = (this.client && this.client.nextSlot) ? this.client.nextSlot() : { x: 0.5, y: 0.5 }
  const slotX = (slot.x - 0.5) * 2 * 2.21 * 0.42
  const slotY = (0.5 - slot.y) * 2 * 1.24 * 0.45
  object3d.position.x += slotX
  object3d.position.y += slotY
  this.scene.add(object3d)

  // Uniform di deformazione PROPRIA di questo modello (fase indipendente)
  const uniform = { value: new THREE.Vector4(0, 4, 0, 0) }
  this._setupDeformation(object3d, uniform)

  const entry = {
    obj: object3d,
    tag: this._lastTerm || null,
    mixer: null,
    uniform: uniform,
    baseScale: scale,
    basePos: object3d.position.clone(),
    phase: Math.random() * 100,       // sfasamento: ognuno vaga per conto suo
    spinX: 0,
    spinZ: 0,
    rotY: Math.random() * 6.28,
    baseMats: null                    // materiali originali (per glossy on/off)
  }
  // Memorizza i materiali originali per poterli ripristinare
  entry.baseMats = []
  object3d.traverse((o) => {
    if (o.isMesh && o.material) entry.baseMats.push({ mesh: o, mat: o.material })
  })
  // MATERIALI: i glTF di Poly Haven sono PBR fotogrammetrici e senza ritocchi
  // escono quasi neri (metalness 1 senza metalnessMap = specchio scuro, e
  // roughness 1 spegne ogni riflesso). Li normalizziamo verso qualcosa che si
  // veda bene sopra il feed.
  this._tuneMaterials(object3d)
  if (animations && animations.length) {
    entry.mixer = new THREE.AnimationMixer(object3d)
    for (const clip of animations) { entry.mixer.clipAction(clip).play() }
  }
  this.models.push(entry)

  // Compatibilità: `this.model` resta l'ultimo aggiunto
  this.model = object3d
  this.mixer = entry.mixer
  this._dispUniform = uniform
  if (this.glossy) this._applyGlossyTo(entry)
  console.log('[Model3d] modelli in scena:', this.models.length)
  return true
}

// Normalizza i materiali di un modello appena caricato.
// Perché serve: i glTF realistici (Poly Haven, fotogrammetria) usano spesso
// metalness = 1 SENZA metalnessMap — con un envmap diventano specchi scuri, e
// con roughness = 1 non riflettono nulla. Il risultato era "modelli sempre
// scuri". Qui li riportiamo in una fascia visibile sopra il feed.
Model3d.prototype._tuneMaterials = function (root) {
  const THREE = this.THREE
  if (!root || !THREE) return
  let n = 0
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m || m._orkavTuned) continue
      m._orkavTuned = true
      n++
      try {
        // envmap: la luce ambientale del RoomEnvironment
        if ('envMapIntensity' in m) m.envMapIntensity = 1.35
        // metallo pieno senza mappa del metallo → specchio nero: limitato
        if ('metalness' in m && !m.metalnessMap && m.metalness > 0.35) m.metalness = 0.18
        // superfici totalmente diffusive: un filo di riflesso le stacca dal fondo
        if ('roughness' in m && !m.roughnessMap && m.roughness > 0.92) m.roughness = 0.85
        // materiali "fisici" opachi che però hanno alpha < 1 dall'importer
        if (m.transparent && m.opacity >= 0.99) m.transparent = false
        // niente facce nere: le geometrie con normali sbagliate restano visibili
        if (m.side === THREE.FrontSide && m.metalness > 0.5) m.side = THREE.DoubleSide
        // il colore base troppo scuro è la causa più comune del "tutto nero"
        if (m.color && !m.map) {
          const l = m.color.r * 0.299 + m.color.g * 0.587 + m.color.b * 0.114
          if (l > 0 && l < 0.06) m.color.multiplyScalar(0.06 / l)
        }
        m.needsUpdate = true
      } catch (e) {}
    }
  })
  if (n) { console.log('[Model3d] materiali normalizzati:', n) }
}

// Rimuove una voce dalla scena (e libera le risorse)
Model3d.prototype._removeEntry = function (entry) {
  if (!entry) return
  try { this.scene.remove(entry.obj) } catch (e) {}
  try {
    entry.obj.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) { if (m && m.dispose) m.dispose() }
      }
    })
  } catch (e) {}
  const i = this.models.indexOf(entry)
  if (i >= 0) this.models.splice(i, 1)
  if (this.model === entry.obj) {
    const last = this.models[this.models.length - 1]
    this.model = last ? last.obj : null
    this.mixer = last ? last.mixer : null
    this._dispUniform = last ? last.uniform : null
  }
}

// Svuota TUTTI i modelli
Model3d.prototype.clearModels = function () {
  while (this.models.length) this._removeEntry(this.models[0])
  this.model = null; this.mixer = null; this._dispUniform = null
  console.log('[Model3d] scena svuotata')
}

// Salva baseScale del modello dopo il caricamento.
// Supporta GLB/GLTF (Thingiverse + Khronos), STL e OBJ (formati tipici Thingiverse).
Model3d.prototype.loadModel = function (url, fileName) {
  if (!this.ready) return Promise.resolve(false)
  if (!this.scene) this._buildScene()
  const THREE = this.THREE
  const name = (fileName || url || '').toLowerCase().split('?')[0]

  // --- STL (il formato più comune su Thingiverse) ---
  if (name.endsWith('.stl')) {
    return new Promise((resolve) => {
      new this.STLLoader().load(url, (geo) => {
        try {
          geo.computeVertexNormals()
          const mat = new THREE.MeshStandardMaterial({
            color: 0xdfe6ef, metalness: 0.35, roughness: 0.45,
            flatShading: false, side: THREE.DoubleSide
          })
          resolve(this._attach(new THREE.Mesh(geo, mat), null))
        } catch (e) { resolve(false) }
      }, undefined, (err) => {
        console.warn('[Model3d] STL fallito:', url, err && err.message)
        resolve(false)
      })
    })
  }

  // --- OBJ ---
  if (name.endsWith('.obj')) {
    return new Promise((resolve) => {
      new this.OBJLoader().load(url, (obj) => {
        try {
          // OBJ spesso senza materiali: assegna uno standard leggibile
          obj.traverse((o) => {
            if (o.isMesh && (!o.material || (Array.isArray(o.material) && !o.material.length))) {
              o.material = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide })
            }
          })
          resolve(this._attach(obj, null))
        } catch (e) { resolve(false) }
      }, undefined, (err) => {
        console.warn('[Model3d] OBJ fallito:', url, err && err.message)
        resolve(false)
      })
    })
  }

  // --- GLB / GLTF (default) ---
  return this._loadGLTF(url)
}

// Carica un glTF/GLB con un eventuale riscrittore di URL.
// Serve per i glTF MULTI-FILE (Poly Haven): il .gltf referenzia .bin e texture
// con path relativi, che vanno rimappati sugli URL assoluti del CDN.
Model3d.prototype._loadGLTF = function (url, urlModifier) {
  if (!this.GLTFLoader) return Promise.resolve(false)
  const THREE = this.THREE
  // ATTENZIONE: deve restare `undefined` (non `null`) quando non serve un
  // modifier — `new GLTFLoader(null)` azzera this.manager e crasha su itemStart().
  let manager
  if (urlModifier) {
    manager = new THREE.LoadingManager()
    manager.setURLModifier(urlModifier)
  }
  return new Promise((resolve) => {
    new this.GLTFLoader(manager).load(url, (gltf) => {
      try { resolve(this._attach(gltf.scene, gltf.animations)) } catch (e) {
        console.warn('[Model3d] attach fallito:', e && e.message)
        resolve(false)
      }
    }, undefined, (err) => {
      // Diagnostica completa: il messaggio da solo spesso non basta
      // (CORS, 404, estensioni glTF mancanti, texture non decodificabili).
      console.warn('[Model3d] GLTF fallito:', url)
      console.warn('[Model3d]   errore:', (err && (err.message || err.type)) || err)
      if (err && err.target) console.warn('[Model3d]   target:', err.target.src || err.target.responseURL || err.target)
      resolve(false)
    })
  })
}

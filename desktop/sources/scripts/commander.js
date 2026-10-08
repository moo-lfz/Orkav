'use strict'
function Commander (client) {
  this.isActive = false; this.query = ''; this.history = []; this.historyIndex = 0
  this.passives = {
    find: (p) => { client.cursor.find(p.str) },
    select: (p) => { client.cursor.select(p.x, p.y, p.w || 0, p.h || 0) },
    inject: (p) => {
      client.cursor.select(p._x, p._y)
      if (client.source.cache[p._str + '.orca']) { const rect = client.orca.toRect(client.source.cache[p._str + '.orca']); client.cursor.scaleTo(rect.x, rect.y) }
    }
  }
  this.actives = {
    osc: (p) => { client.io.osc.select(p.int) },
    udp: (p) => { client.io.udp.selectOutput(p.x); if (p.y !== null) { client.io.udp.selectInput(p.y) } },
    midi: (p) => { client.io.midi.selectOutput(p.x); if (p.y !== null) { client.io.midi.selectInput(p.y) } },
    mididevices: (p) => {
      const outs = client.io.midi.outputs || []
      const ins = client.io.midi.inputs || []
      console.log('Commander', '=== MIDI OUTPUT ===')
      outs.forEach((d, i) => console.log('Commander', `  [${i}] ${d.name}` + (client.io.midi.outputIndexes.includes(i) ? ' (SELEZIONATO)' : '')))
      console.log('Commander', '=== MIDI INPUT ===')
      ins.forEach((d, i) => console.log('Commander', `  [${i}] ${d.name}` + (client.io.midi.inputIndex === i ? ' (SELEZIONATO)' : '')))
      console.log('Commander', 'Seleziona output: midi:<indice>  (es. midi:1)')
      client._modsNotice = { names: outs.map((d, i) => `[${i}] ${d.name}`), until: performance.now() + 5000 }
    },
    ip: (p) => { client.io.setIp(p.str) },
    cc: (p) => { client.io.cc.setOffset(p.int) },
    pg: (p) => { client.io.cc.stack.push({ channel: clamp(p.ints[0], 0, 15), bank: p.ints[1], sub: p.ints[2], pgm: clamp(p.ints[3], 0, 127), type: 'pg' }); client.io.cc.run() },
    copy: (p) => { client.cursor.copy() },
    paste: (p) => { client.cursor.paste(true) },
    erase: (p) => { client.cursor.erase() },
    play: (p) => { client.clock.play() },
    stop: (p) => { client.clock.stop() },
    run: (p) => { client.run() },
    apm: (p) => { client.clock.setSpeed(null, p.int) },
    bpm: (p) => { client.clock.setSpeed(p.int, p.int, true) },
    frame: (p) => { client.clock.setFrame(p.int) },
    rewind: (p) => { client.clock.setFrame(client.orca.f - p.int) },
    skip: (p) => { client.clock.setFrame(client.orca.f + p.int) },
    time: (p, origin) => {
      const formatted = new Date(250 * (client.orca.f * (60 / client.clock.speed.value))).toISOString().substr(14, 5).replace(/:/g, '')
      client.orca.writeBlock(origin ? origin.x : client.cursor.x, origin ? origin.y : client.cursor.y, `${formatted}`)
    },
    color: (p) => {
      if (p.parts[0]) { client.theme.set('b_low', p.parts[0]) }
      if (p.parts[1]) { client.theme.set('b_med', p.parts[1]) }
      if (p.parts[2]) { client.theme.set('b_high', p.parts[2]) }
    },
    find: (p) => { client.cursor.find(p.str) },
    select: (p) => { client.cursor.select(p.x, p.y, p.w || 0, p.h || 0) },
    inject: (p, origin) => {
      const name = (p._str || '').trim()
      let block = null
      // 1) match esatto con estensione
      if (client.source.cache[name + '.orca']) { block = client.source.cache[name + '.orca'] }
      // 2) match case-insensitive sul nome (senza estensione)
      if (!block) {
        const lower = name.toLowerCase()
        const key = Object.keys(client.source.cache).find(k => k.toLowerCase() === lower + '.orca')
        if (key) { block = client.source.cache[key] }
      }
      // 3) match parziale (l'utente può digitare parte del nome)
      if (!block) {
        const lower = name.toLowerCase()
        const key = Object.keys(client.source.cache).find(k => k.toLowerCase().includes(lower))
        if (key) { block = client.source.cache[key] }
      }
      if (!block) {
        console.warn('Commander', 'Modulo non trovato: ' + name + '. Caricati: ' + Object.keys(client.source.cache).join(', '))
        return
      }
      client.orca.writeBlock(origin ? origin.x : client.cursor.x, origin ? origin.y : client.cursor.y, block)
      client.cursor.scaleTo(0, 0)
      console.log('Commander', 'Modulo iniettato:', name)
    },
    mods: (p) => {
      const keys = Object.keys(client.source.cache)
      console.log('Commander', 'Moduli caricati (' + keys.length + '):', keys.join(', '))
      client.telemetry = client.telemetry || {}
      // mostra i nomi nell'overlay per ~4s
      client._modsNotice = { names: keys, until: performance.now() + 4000 }
      if (keys.length === 0) { console.warn('Commander', 'Nessun modulo caricato (usa Cmd+L per importarli)') }
    },
    write: (p) => { client.orca.writeBlock(p._x || client.cursor.x, p._y || client.cursor.y, p._str) },
    fx: (p) => {
      if (!p.str || p.str.trim().length === 0) {
        client.fxManager.setChain([])
        return
      }
      const chain = []
      const parts = p.str.split('+')
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i].trim().split('.')
        const name = (seg[0] || '').toLowerCase()
        if (!name) continue

        // Formato Orkav: fx:nome.random.drive
        // 1° valore (default 400): randomizza 3 parametri dello shader + i 7 filtri spettrali
        // 2° valore (default 400): drive dell'audio capture (0-999)
        const randRaw = seg.length >= 2 ? parseInt(seg[1]) : 400
        const driveRaw = seg.length >= 3 ? parseInt(seg[2]) : 400
        const rand = isNaN(randRaw) ? 400 : Math.max(0, Math.min(999, randRaw))
        const drive = isNaN(driveRaw) ? 400 : Math.max(0, Math.min(999, driveRaw))

        // Il seed randomizza anche i 7 filtri bandpass dell'audio capture
        if (client.audioReactor && client.audioReactor.randomizeFilters) {
          client.audioReactor.randomizeFilters(rand)
          client.audioReactor.drive = drive / 1000
        }

        chain.push({ name: name, seed: rand / 1000, drive: drive })
      }
      client.fxManager.setChain(chain)
    },
    loadpatch: (p) => {
      const patchName = p.str.trim()
      if (!patchName) { console.warn('[Commander] Specifica un nome di patch (es. loadpatch:MtaAII)'); return }
      if (window.api && window.api.app && window.api.app.loadpatch) {
        window.api.app.loadpatch(patchName).then((success) => {
          if (success) { console.log('[Commander] Patch caricata:', patchName) }
          else { console.warn('[Commander] Patch non trovata:', patchName) }
        }).catch(err => { console.error('[Commander] Errore:', err) })
      } else {
        console.warn('[Commander] API loadpatch non disponibile')
      }
    },
    // === CHIAVI / PERCORSI OPZIONALI ===
    // giphykey:<KEY> → chiave API Giphy (gratuita su developers.giphy.com).
    // NON è nel repo: senza chiave il GIF swarm passa a Commons → frame procedurali.
    giphykey: (p) => {
      if (!client.background) { return }
      const k = (p.str || '').trim()
      if (!k) { console.warn('Commander', 'Uso: giphykey:<KEY>  (gratuita su developers.giphy.com)'); return }
      client.background.setGiphyKey(k)
      client._modsNotice = { names: ['Giphy key OK'], until: performance.now() + 4000 }
    },
    // bgdir:<percorso> → cartella locale opzionale con immagini/GIF di background
    bgdir: (p) => {
      if (!client.background) { return }
      const d = (p.str || '').trim()
      client.background.setLocalDir(d)
      client._modsNotice = { names: [d ? 'bg dir: ' + d : 'bg dir rimossa'], until: performance.now() + 4000 }
    },
    // === MODELLI 3D ===
    // ph:<query> → Poly Haven (CC0, nessun token). Senza query usa il tag corrente.
    ph: (p) => {
      if (!client.model3d) { console.warn('Commander', 'Model3d non disponibile'); return }
      const q = (p.str || '').trim() || client.currentTag || 'props'
      console.log('Commander', 'Poly Haven ricerca:', q)
      client.model3d.active = true
      client.model3d.loadFromPolyHaven(q).then((ok) => {
        console.log('Commander', 'Poly Haven:', ok ? 'modello caricato' : 'nessun modello')
        client.update()
      })
    },
    // phclear → svuota tutti i modelli 3D dalla scena
    phclear: (p) => {
      if (!client.model3d) { return }
      client.model3d.clearModels()
      client._modsNotice = { names: ['modelli 3D svuotati'], until: performance.now() + 3000 }
    },
    // glossy[:on|off] → effetto lucido con riflessi sui modelli 3D
    glossy: (p) => {
      if (!client.model3d) { return }
      const v = (p.str || '').trim().toLowerCase()
      const on = v === 'on' ? true : (v === 'off' ? false : undefined)
      const state = client.model3d.setGlossy(on)
      client._modsNotice = { names: ['glossy ' + (state ? 'ON' : 'OFF')], until: performance.now() + 3000 }
    },
    // phadd:<query> → AGGIUNGE un modello (multi-oggetto) invece di sostituire
    phadd: (p) => {
      if (!client.model3d) { return }
      const q = (p.str || '').trim() || client.currentTag || 'props'
      client.model3d.active = true
      client.model3d.loadRandom(q, { add: true }).then(() => client.update())
    },
    // phlist:<query> → elenca i modelli Poly Haven che matchano
    phlist: (p) => {
      if (!client.model3d) { return }
      const q = (p.str || '').trim() || client.currentTag || ''
      client.model3d._phAssets().then((assets) => {
        const pick = client.model3d.pickPolyHaven(assets, q)
        const ids = Object.keys(assets)
        const terms = (Model3d.PH_ALIAS[String(q).toLowerCase()] || []).concat(String(q).toLowerCase().split(/\s+/))
        const hits = ids.filter(id => {
          const a = assets[id] || {}
          const hay = (id + ' ' + (a.name || '') + ' ' + (a.categories || []).join(' ') + ' ' + (a.tags || []).join(' ')).toLowerCase()
          return terms.some(t => t && t.length > 2 && hay.indexOf(t) >= 0)
        }).slice(0, 12)
        console.log('Commander', '=== POLY HAVEN:', q, '===')
        hits.forEach((id, i) => console.log('Commander', ` [${i}] ${assets[id].name} (${id})`))
        if (!hits.length) console.log('Commander', ' nessun match — verrà usato un modello a caso:', pick && pick.id)
        client._modsNotice = { names: (hits.length ? hits : [pick && pick.id]).filter(Boolean).slice(0, 5), until: performance.now() + 5000 }
      }).catch(e => console.warn('Commander', 'Poly Haven errore:', e.message))
    },
    // === RETE / CACHE ===
    // netstats → contatori rete + stato cache su disco
    netstats: (p) => {
      if (!window.Net) { console.log('Commander', 'Net non disponibile'); return }
      const s = Net.stats
      console.log('Commander', `=== RETE === ok:${s.ok} timeout:${s.timeout} annullate:${s.abort} errori:${s.error} in corso:${Net.pending()}`)
      const KEY = 'ph_index_v1'
      Net.cacheLoad(KEY, 30 * 24 * 3600 * 1000).then((v) => {
        const age = Net.cacheAge(KEY)
        const n = v ? Object.keys(v).length : 0
        console.log('Commander', v
          ? ` cache Poly Haven: ${n} modelli, ${Math.round(age / 3600000)}h fa`
          : ' cache Poly Haven: vuota (verrà scaricata al primo Alt+P)')
        client._modsNotice = { names: ['net ok:' + s.ok + ' to:' + s.timeout, v ? 'cache ' + n : 'cache vuota'], until: performance.now() + 5000 }
        client.update()
      })
    },
    // netcache → svuota la cache su disco (indice Poly Haven ecc.)
    netcache: (p) => {
      if (!window.Net) { return }
      Net.cacheDrop('ph_index_v1').then(() => {
        console.log('Commander', 'cache di rete svuotata')
        client._modsNotice = { names: ['cache svuotata'], until: performance.now() + 3000 }
        client.update()
      })
    },
    // === THINGIVERSE (modelli 3D, richiede token approvato) ===
    // tvhelp → istruzioni per ottenere il token (stampate in console)
    tvhelp: (p) => {
      const help = (typeof Model3d !== 'undefined' && Model3d.TOKEN_HELP) || [
        'Thingiverse richiede un token personale:',
        '1) fai LOGIN su thingiverse.com',
        '2) https://www.thingiverse.com/apps/create',
        '3) "Create an App" e copia l\'Access Token',
        '4) tvtoken:<IL_TOKEN>'
      ]
      console.log('Commander', '=== THINGIVERSE — come ottenere il token ===')
      help.forEach(l => console.log('Commander', '  ' + l))
      client._modsNotice = { names: ['tvhelp: vedi console'], until: performance.now() + 5000 }
    },
    // tvtoken:<TOKEN> → salva il token API (si crea da loggati su /apps/create)
    tvtoken: (p) => {
      if (!client.model3d) { console.warn('Commander', 'Model3d non disponibile'); return }
      const tok = (p.str || '').trim()
      if (!tok) {
        console.warn('Commander', 'Uso: tvtoken:<TOKEN> — crea un app su https://www.thingiverse.com/apps/create (serve il login). Dettagli: tvhelp')
        return
      }
      client.model3d.setToken(tok)
      client._modsNotice = { names: ['Thingiverse token OK'], until: performance.now() + 4000 }
    },
    // tv:<query> → cerca su Thingiverse e carica un modello fra i risultati
    tv: (p) => {
      if (!client.model3d) { console.warn('Commander', 'Model3d non disponibile'); return }
      const q = (p.str || '').trim() || client.currentTag || 'low poly'
      if (!client.model3d.tvToken) {
        console.warn('Commander', 'Token Thingiverse mancante. Crealo su https://www.thingiverse.com/apps/create (da loggato), poi: tvtoken:<TOKEN>. Dettagli: tvhelp')
        client._modsNotice = { names: ['tvtoken:<TOKEN>'], until: performance.now() + 5000 }
        return
      }
      console.log('Commander', 'Thingiverse ricerca:', q)
      client.model3d.active = true
      client.model3d.loadFromThingiverse(q).then((ok) => {
        console.log('Commander', 'Thingiverse:', ok ? 'modello caricato' : 'nessun modello')
        client.update()
      })
    },
    // tvsearch:<query> → elenca i risultati per sceglierli a mano
    tvsearch: (p) => {
      if (!client.model3d) { return }
      if (!client.model3d.tvToken) { console.warn('Commander', 'Serve tvtoken:<TOKEN>'); return }
      const q = (p.str || '').trim() || client.currentTag || 'low poly'
      client.model3d.search(q).then((list) => {
        console.log('Commander', '=== THINGIVERSE:', q, '===')
        list.forEach((t, i) => console.log('Commander', ` [${i}] ${t.name} — thing:${t.id} (${t.creator})`))
        client._modsNotice = { names: list.slice(0, 6).map(t => t.name.slice(0, 18)), until: performance.now() + 6000 }
      })
    },
    tag: (p) => {
      const tag = p.str.trim().toLowerCase()
      if (!tag) { console.warn('[Commander] Specifica un tag (es. tag:pokemon)'); return }
      client.currentTag = tag
      client.background.loadBackgroundByTag(tag)
      client.background.loadSwarmByTag(tag)
      console.log('[Commander] Tag cambiato:', tag)
    },
    text: (p, origin) => {
      const text = p.str || p._str || ''
      if (!text) { console.warn('[Commander] Specifica un testo (es. text:HELLO)'); return }
      const colors = ['#ffb545', '#4ade80', '#b39dff', '#ff4fd8', '#ef8f7d']
      const color = colors[Math.floor(Math.random() * colors.length)]
      const font = client.background ? client.background.currentFont : 'Impact'
      client.bigTexts.push({
        text: text.toUpperCase().slice(0, 42),
        mode: Math.floor(Math.random() * 3),
        born: performance.now(),
        ttl: 4000 + Math.random() * 4000,
        seed: Math.random(),
        color: color,
        font: font
      })
      console.log('[Commander] Testo aggiunto:', text, '(font:', font + ')')
    },
    res: (p) => {
      const val = parseFloat(p.str)
      if (!isNaN(val) && val > 0.1 && val <= 1.0) {
        client.q = val
        console.log('[Commander] Risoluzione:', val)
      }
    },
    midichannels: (p) => {
      const bg = client.background
      if (!bg) { console.warn('[Commander] Background non disponibile'); return }
      console.log('[MIDI] Canali assegnati:')
      console.log('  GIF:', bg.midiChannelGif)
      console.log('  Background:', bg.midiChannelBg)
      console.log('  Font:', bg.midiChannelFont)
    },
    peers: (p) => {
      if (window.api && window.api.abletonlink && window.api.abletonlink.getPeers) {
        window.api.abletonlink.getPeers().then((num) => {
          console.log('[Link] Peers connessi:', num);
        }).catch(err => console.warn('[Link] Errore peers:', err))
      } else {
        console.warn('[Link] API peers non disponibile')
      }
    }
  }
  for (const id in this.actives) { this.actives[id.substr(0, 2)] = this.actives[id] }

  function Param (val) {
    this.str = `${val}`; this.length = this.str.length; this.chars = this.str.split('')
    this.int = !isNaN(val) ? parseInt(val) : null
    this.parts = val.split(';'); this.ints = this.parts.map((v) => { return parseInt(v) })
    this.x = parseInt(this.parts[0]); this.y = parseInt(this.parts[1]); this.w = parseInt(this.parts[2]); this.h = parseInt(this.parts[3])
    this._str = this.parts[0]; this._x = parseInt(this.parts[1]); this._y = parseInt(this.parts[2])
  }

  this.start = (q = '') => { this.isActive = true; this.query = q; client.cursor.ins = false; client.update() }
  this.stop = () => { this.isActive = false; this.query = ''; this.historyIndex = this.history.length; client.update() }
  this.erase = function () { this.query = this.query.slice(0, -1); this.preview() }
  this.write = (key) => {
    if (key === 'Backspace') { this.erase(); return }
    if (key === 'Enter') { this.run(); return }
    if (key === 'Escape') { this.stop(); return }
    if (key.length > 1) { return }
    this.query += key; this.preview()
  }
  this.run = function () { const tool = this.isActive === true ? 'commander' : 'cursor'; client[tool].trigger(); client.update() }
  this.trigger = function (msg = this.query, origin = null, stopping = true) {
    const cmd = `${msg}`.split(':')[0].trim().replace(/\W/g, '').toLowerCase()
    const val = `${msg}`.substr(cmd.length + 1)
    const fn = this.actives[cmd]
    if (!fn) { console.warn('Commander', `Unknown message: ${msg}`); this.stop(); return }
    fn(new Param(val), origin)
    this.history.push(msg); this.historyIndex = this.history.length
    if (stopping) { this.stop() }
  }
  this.preview = function (msg = this.query) {
    const cmd = `${msg}`.split(':')[0].toLowerCase()
    const val = `${msg}`.substr(cmd.length + 1)
    if (!this.passives[cmd]) { return }
    this.passives[cmd](new Param(val), false)
  }
  this.onKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) { return }
    client[this.isActive === true ? 'commander' : 'cursor'].write(e.key)
    e.stopPropagation()
  }
  this.onKeyUp = (e) => { client.update() }
  this.toString = function () { return `${this.query}` }

  function clamp (v, min, max) { return v < min ? min : v > max ? max : v }
}
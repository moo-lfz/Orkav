'use strict'
// Imposta il tag di UN canale ('bg' | 'gif' | 'model' | 'font') e ricarica solo
// quello. Usato dai comandi tagbg:/taggif:/tag3d:/tagfont:.
function commanderSetTag (client, kind, p) {
  const tag = (p && p.str ? p.str : '').trim().toLowerCase()
  if (!client.setTagFor(kind, tag || null)) { return }
  if (tag) {
    if (!client.background.commonsTags[tag]) { client.background.commonsTags[tag] = [tag] }
    if (client.tags.indexOf(tag) < 0) { client.tags.push(tag) }
  }
  if (kind === 'bg') { client.background.loadBackgroundByTag(client.tagFor('bg')) }
  else if (kind === 'gif') { client.background.loadSwarmByTag(client.tagFor('gif')) }
  else if (kind === 'model') { if (client.model3d && client.model3d.active) { client.model3d.loadRandom() } }
  console.log('Commander', 'tag ' + kind + ':', client.tagFor(kind), tag ? '' : '(torna al globale)')
  client._modsNotice = { names: ['tag ' + kind + ': ' + client.tagFor(kind)], until: performance.now() + 4000 }
  client.update()
}

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
    // midi:<n> toggle · midi:<n>! esclusiva · midi:0,2 esatta · midi:-1 azzera
    // Passiamo la STRINGA grezza: la forma con la virgola non passerebbe da p.x.
    midi: (p) => {
      const raw = (p.str || '').trim()
      client.io.midi.selectOutput(raw.length ? raw : p.x)
      if (p.y !== null && !isNaN(p.y)) { client.io.midi.selectInput(p.y) }
    },
    // midiclock:<n> — quali device ricevono CLOCK/transport (stessa sintassi di
    // midi:). Serve quando si manda a IAC + USB insieme: Ableton che riceve il
    // clock da due sorgenti lo somma e va in conflitto. midiclock:-1 = nessuno.
    midiclock: (p) => {
      const raw = (p.str || '').trim()
      if (!raw) { console.log('Commander', 'midiclock:<n> | <n>! | 0,2 | -1  (vuoto = tutti gli output selezionati)'); return }
      client.io.midi.selectClockOutputs(raw)
    },
    mididevices: (p) => {
      const outs = client.io.midi.outputs || []
      const ins = client.io.midi.inputs || []
      console.log('Commander', '=== MIDI OUTPUT ===')
      outs.forEach((d, i) => console.log('Commander', `  [${i}] ${d.name}` + (client.io.midi.outputIndexes.includes(i) ? ' (SELEZIONATO)' : '')))
      console.log('Commander', '=== MIDI INPUT ===')
      ins.forEach((d, i) => console.log('Commander', `  [${i}] ${d.name}` + (client.io.midi.inputIndex === i ? ' (SELEZIONATO)' : '')))
      console.log('Commander', 'Output attivi:', client.io.midi.outputIndexes.map(i => `[${i}] ${outs[i] ? outs[i].name : '?'}`).join(' + ') || 'None')
      console.log('Commander', 'midi:<n> aggiunge/toglie · midi:<n>! solo quello · midi:0,2 esatta · midi:-1 azzera')
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
    // === STORMI GIF E MODELLI 3D (multipli) ===
    // swarms → stato degli stormi attivi
    swarms: () => {
      const sw = client.background.swarms || []
      console.log('Commander', '=== STORMI GIF (' + sw.length + '/' + (client.background.maxSwarms || 4) + ') ===')
      sw.forEach((s, i) => {
        let span = ''
        if (s.boids && s.boids.length) {
          let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
          for (const b of s.boids) { if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x; if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y }
          span = ` estensione ${Math.round(maxX - minX)}x${Math.round(maxY - minY)}px`
        }
        console.log('Commander', `  [${i}] tag:${s.tag || '?'} ${s.ready ? 'pronto' : 'caricamento...'} boid:${s.boids ? s.boids.length : 0}${span}`)
      })
      const md = (client.model3d && client.model3d.models) || []
      console.log('Commander', '=== MODELLI 3D (' + md.length + '/' + (client.model3d ? client.model3d.maxModels : '?') + ') ===')
      md.forEach((e, i) => console.log('Commander', `  [${i}] ${(e.obj && e.obj.name) || 'model'}`))
      client._modsNotice = { names: ['swarm ' + sw.length, '3d ' + md.length], until: performance.now() + 4000 }
      client.update()
    },
    // swarmclear → azzera tutti gli stormi
    swarmclear: () => { client.background.clearSwarms(); client.update() },
    // swarmmax:<n> → quanti stormi tenere in scena (1-8)
    swarmmax: (p) => {
      const n = parseInt(p.str)
      if (isNaN(n)) { console.log('Commander', 'swarmmax:<n>  (attuale ' + (client.background.maxSwarms || 4) + ')'); return }
      client.background.maxSwarms = Math.max(1, Math.min(8, n))
      console.log('Commander', 'stormi massimi:', client.background.maxSwarms)
    },
    // swarmboids:<n> → boid per stormo (lo stormo si allarga)
    swarmboids: (p) => {
      const n = parseInt(p.str)
      if (isNaN(n)) { console.log('Commander', 'swarmboids:<n>  (attuale ' + (client.background.swarmBoids || 30) + ')'); return }
      client.background.swarmBoids = Math.max(6, Math.min(60, n))
      console.log('Commander', 'boid per stormo:', client.background.swarmBoids)
    },
    // models:<n> → quanti modelli 3D tenere in scena (1-16)
    models: (p) => {
      const n = parseInt(p.str)
      if (isNaN(n)) { console.log('Commander', 'models:<n>  (attuale ' + (client.model3d ? client.model3d.maxModels : '?') + ')'); return }
      if (!client.model3d) { return }
      client.model3d.maxModels = Math.max(1, Math.min(16, n))
      console.log('Commander', 'modelli massimi:', client.model3d.maxModels)
    },
    // tagrotate          → togli tutti i pin e riattiva la rotazione
    // tagrotate:<canale> → solo quel canale (bg | gif | model | font)
    tagrotate: (p) => {
      const k = (p && p.str ? p.str : '').trim().toLowerCase()
      const kinds = ['bg', 'gif', 'model', 'model3d', 'font']
      if (k && kinds.indexOf(k) >= 0) {
        const kind = k === 'model3d' ? 'model' : k
        client.setTagFor(kind, null)
        console.log('Commander', 'rotazione riattivata su ' + kind + ' →', client.tagFor(kind))
      } else {
        client.resetTagRotation()
        console.log('Commander', 'rotazione tag riattivata su tutti i canali →', client.tagSummary())
      }
      client._modsNotice = { names: ['tagrotate ' + (k || 'tutti')], until: performance.now() + 3000 }
      client.update()
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
        const done = (sz) => {
          if (sz) { console.log('Commander', ` cache modelli su disco: ${sz.files} file, ${(sz.bytes / 1048576).toFixed(1)} MB`) }
          client._modsNotice = { names: ['net ok:' + s.ok + ' to:' + s.timeout, v ? 'cache ' + n : 'cache vuota', sz ? (sz.bytes / 1048576).toFixed(1) + 'MB 3d' : ''], until: performance.now() + 5000 }
          client.update()
        }
        if (window.api && window.api.cache && window.api.cache.size) {
          window.api.cache.size().then(done).catch(() => done(null))
        } else { done(null) }
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
      client.background.loadBackgroundByTag(client.tagFor('bg'))
      client.background.loadSwarmByTag(client.tagFor('gif'))
      if (client.model3d && client.model3d.active) { client.model3d.loadRandom() }
      console.log('[Commander] Tag globale:', tag, '|', client.tagSummary())
    },
    // Tag PER CANALE: le GIF, il background, i modelli 3D e i font possono
    // pescare da tag diversi. Vuoto = torna a seguire il tag globale.
    tagbg: (p) => commanderSetTag(client, 'bg', p),
    taggif: (p) => commanderSetTag(client, 'gif', p),
    tag3d: (p) => commanderSetTag(client, 'model', p),
    tagfont: (p) => commanderSetTag(client, 'font', p),
    tags: () => {
      console.log('Commander', '=== TAG PER CANALE ===')
      console.log('Commander', ' globale:', client.currentTag)
      console.log('Commander', ' bg   :', client.tagFor('bg'), client.tagBy.bg ? '(override)' : '')
      console.log('Commander', ' gif  :', client.tagFor('gif'), client.tagBy.gif ? '(override)' : '')
      console.log('Commander', ' 3d   :', client.tagFor('model'), client.tagBy.model ? '(override)' : '')
      console.log('Commander', ' font :', client.tagFor('font'), client.tagBy.font ? '(override)' : '')
      client._modsNotice = { names: ['tag ' + client.tagSummary().slice(0, 24)], until: performance.now() + 5000 }
      client.update()
    },
    text: (p, origin) => {
      const text = p.str || p._str || ''
      if (!text) { console.warn('[Commander] Specifica un testo (es. text:HELLO)'); return }
      const colors = (client.bigTextPalette && client.bigTextPalette.length) ? client.bigTextPalette : ['#ff10f0', '#b39dff', '#39ff14', '#00ffd0']
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
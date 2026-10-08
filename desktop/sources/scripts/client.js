'use strict'
/* global library, Acels, Source, History, Orca, IO, Cursor, Commander, Clock, Theme, AudioReactor, GLEngine, Background, GifDecoder */

function Client () {
  this.version = 178
  this.library = library
  this.theme = new Theme(this)
  this.acels = new Acels(this)
  this.source = new Source(this)
  this.history = new History(this)
  this.orca = new Orca(this.library)
  this.io = new IO(this)
  this.cursor = new Cursor(this)
  this.commander = new Commander(this)
  this.clock = new Clock(this)

  this.audioReactor = new AudioReactor()
  this.fxManager = new GLEngine()
  this.background = new Background(this)
  this.faceTracker = new FaceTracker(this)
  this.model3d = new Model3d(this)
    this.bigText = new BigText(this)
    this.gifDecoder = new GifDecoder(this)

  this.scale = 1
  this.grid = { w: 8, h: 8 }
  this.tile = { w: +localStorage.getItem('tilew') || 10, h: +localStorage.getItem('tileh') || 15 }
  this.guide = false

  this.el = document.createElement('canvas')
  this.context = this.el.getContext('2d')
  this.sceneEl = document.createElement('canvas')
  this.sceneCtx = this.sceneEl.getContext('2d')
  // Piano terminale separato: la patch Orca non viene MAI influenzata dagli shader
  this.progEl = document.createElement('canvas')
  this.progCtx = this.progEl.getContext('2d')
  this._progDirty = true
  this._lastProgF = -1
  // Piano UI CACHEATO: barra di stato + monitor audio (spettro FFT) + overlay +
  // guida costavano ~5-6 ms/frame su ~7 ms totali (misurato col profiler).
  // Sono contenuti che cambiano lentamente: si ridisegnano a ~15 fps in questo
  // buffer e si blittano ogni frame (copia GPU, praticamente gratis).
  this.uiEl = document.createElement('canvas')
  this.uiCtx = this.uiEl.getContext('2d')
  this._lastUi = 0
  this._uiInterval = 66   // ms → ~15 fps

  this.fxTextMode = false; this.fxTextBuffer = ''
  this.bigTextMode = false; this.bigTextBuffer = ''; this.bigTexts = []
  // Font BIG TEXT (dafont distintivi — NON tocca input_mono_medium dell'interfaccia)
  this.bigTextFonts = ['Ghastly Panic', 'Melted Monster', 'VCR OSD Mono', 'Nulshock']

  this.params = { p0:0,p1:0,p2:0,p3:0,p4:0,p5:0,p6:0,p7:0 }
  this.midiNote = 0;
      this.midiCC = new Array(16);
      for (let i = 0; i < 16; i++) {
          this.midiCC[i] = new Array(128).fill(0);
      }
  this.fps = 60; this.lastFrame = 0; this.frameCount = 0
  this.gpuLoad = null
  this.freqArr = null; this.timeArr = null; this.specPeak = null
  this.si = null; this.telemetry = { cpu:0, gpu:0, temp:null, net:null }

  // --- TOTAL GLITCH + PANIC BUTTON ---
  this.totalGlitch = false
  this.panicMode = false
  this.panicStart = 0
  this.panicWord = 'PANIC'
  // Lingue per la scritta PANIC (compaiono a rotazione casuale)
  this.panicWords = ['PANIC', 'PANICO', 'PANIQUE', 'PÁNICO', 'PANIK', 'PÂNICO', 'ПАНИКА', '恐慌', 'パニック', 'PANIEK', 'PANIKA']
  // --- TAG MODE (Cmd+W: aggiungi tag e cerca subito) ---
  this.tagMode = false
  this.tagBuffer = ''
  // --- MODEL SEARCH (Alt+Shift+P: cerca un modello 3D per termine) ---
  this.modelSearchMode = false
  this.modelSearchBuffer = ''
  // --- SCORE MIDI → motore grafico (flash sincronizzato con le note generate) ---
  this.scoreFlash = 0

  // --- MOUSE POINTER (smile acid + fungo amanita psichedelico) ---
  // NOTA: this.cursor è il cursore Orca (istanza Cursor). Il puntatore custom
  // (mouse x/y reali + smussati) si chiama this.pointer per non sovrascriverlo.
  this.pointer = { x: -100, y: -100, sx: -100, sy: -100, fx: -100, fy: -100, lastClick: 0 }

  // --- TAG per background e GIF ---
  this.tags = ['pokemon', 'merda', '1312', 'michale jackson', 'twin peaks', 'gatti', 'simpson', 'rick and morty', 'the office', 'friends', 'south park',
    'liminal space', 'horror vacui', 'cyberfeminism', 'cyberdeck', 'hacktivism', 'hacker', 'matrix', 'red pill', 'blue pill', 'sex workers', 'demons',
    'lucifer', 'satan', 'esoterism', 'ai', 'ki', 'solar opposites', 'brickleberry', 'futurama']
  this.currentTag = this.tags[Math.floor(Math.random() * this.tags.length)]

  // --- TAG PER CANALE -------------------------------------------------------
  // Ogni canale ha il PROPRIO tag: le GIF possono pescare da un tag diverso
  // dalle immagini di background, dai modelli 3D e dai font dei big text.
  // null = segue il tag globale (this.currentTag). Si impostano dal commander:
  //   tagbg:<t>  taggif:<t>  tag3d:<t>  tagfont:<t>   (e tag:<t> per il globale)
  this.tagBy = { bg: null, gif: null, model: null, font: null }

  // --- SLOT DELLO SCHERMO ---------------------------------------------------
  // Tutti gli elementi "a comparsa" (layer immagine, stormo GIF, modelli 3D)
  // pescano una zona da questa lista PERIFERICA, a rotazione: prima finivano
  // tutti al centro, dove sta la patch Orca, e si accavallavano.
  // Coordinate normalizzate (0..1, y verso il basso).
  this.slotList = [
    { x: 0.16, y: 0.14 }, { x: 0.84, y: 0.14 },
    { x: 0.11, y: 0.50 }, { x: 0.89, y: 0.50 },
    { x: 0.20, y: 0.84 }, { x: 0.80, y: 0.84 },
    { x: 0.50, y: 0.10 }, { x: 0.50, y: 0.88 },
    { x: 0.33, y: 0.26 }, { x: 0.67, y: 0.74 },
    { x: 0.67, y: 0.26 }, { x: 0.33, y: 0.74 }
  ]
  this._slotNext = Math.floor(Math.random() * this.slotList.length)
  // Prossima zona libera, a rotazione (12 slot: con max 6 modelli + layer +
  // stormo non si ripete quasi mai lo stesso posto due volte di fila).
  this.nextSlot = () => {
    const s = this.slotList[this._slotNext % this.slotList.length]
    this._slotNext++
    return s
  }
  this.resetSlots = () => { this._slotNext = Math.floor(Math.random() * this.slotList.length) }

  // Tag effettivo di un canale: l'override se c'è, altrimenti il globale.
  this.tagFor = (kind) => {
    const t = this.tagBy ? this.tagBy[kind] : null
    return t || this.currentTag
  }
  // kind: 'bg' | 'gif' | 'model' | 'font'. tag vuoto/null = torna al globale.
  this.setTagFor = (kind, tag) => {
    if (!this.tagBy || !(kind in this.tagBy)) { return false }
    const v = (tag == null) ? null : String(tag).trim().toLowerCase()
    this.tagBy[kind] = v || null
    return true
  }
  // Riepilogo leggibile dei quattro canali (per il commander e il terminale).
  this.tagSummary = () => {
    const k = ['bg', 'gif', 'model', 'font']
    return k.map(n => n + ':' + this.tagFor(n)).join(' ')
  }
  // Font di partenza per il canale 'font': tag diversi partono da font diversi,
  // poi si ruota a ogni scritta. Così `tagfont:<nome>` cambia davvero il font.
  this.fontBaseForTag = () => {
    const n = this.bigTextFonts.length || 1
    const t = String(this.tagFor('font') || '')
    const i = this.tags.indexOf(t)
    if (i >= 0) { return i % n }
    let h = 0
    for (let k = 0; k < t.length; k++) { h = (h * 31 + t.charCodeAt(k)) >>> 0 }
    return h % n
  }

  this.install = (host) => {
    console.log('[Client] install() inizio')
    host.appendChild(this.el)
    document.body.style.margin = '0'; document.body.style.overflow = 'hidden'
    this.el.style.position = 'fixed'; this.el.style.top = '0'; this.el.style.left = '0'
    this.el.style.zIndex = '10'
    // CURSOR CUSTOM: canvas sopra tutto (z-index max), non influenzato dagli FX
    this.cursorEl = document.createElement('canvas')
    this.cursorCtx = this.cursorEl.getContext('2d')
    this.cursorEl.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;pointer-events:none;'
    this.cursorEl.width = window.innerWidth; this.cursorEl.height = window.innerHeight
    host.appendChild(this.cursorEl)
    document.body.style.cursor = 'none' // nascondi il cursore di sistema
    console.log("[DIAGNOSIS] cursorEl created:", this.cursorEl, "dimensions:", this.cursorEl.width, "x", this.cursorEl.height);
    window.addEventListener('mousemove', (e) => {
      this.pointer.x = e.clientX; this.pointer.y = e.clientY
    })
    window.addEventListener('mousedown', () => { this.pointer.lastClick = performance.now() })
    this.theme.install(host)
    this.theme.default = { background:'#000000', f_high:'#ffffff', f_med:'#777777', f_low:'#444444', f_inv:'#000000', b_high:'#eeeeee', b_med:'#72dec2', b_low:'#444444', b_inv:'#ffb545' }
    console.log('[Client] theme installato, audioReactor.start()...')
    this.audioReactor.start()
    console.log('[Client] audioReactor avviato')


    // --- API per telemetria ---
    if (window.api && window.api.systeminformation) {
      window.api.systeminformation.onUpdate((data) => {
        this.si = true // abilita la visualizzazione CPU/GPU/temp nel display
        this.telemetry.cpu = data.cpu
        this.telemetry.temp = data.temp
        this.telemetry.net = data.net
        this.telemetry.gpu = data.gpu
      })
    }

    // --- SHORTCUTS ---
    this.acels.set('File','New','CmdOrCtrl+N',()=>{this.reset()})
    this.acels.set('File','Open','CmdOrCtrl+O',()=>{this.source.open('orca',this.whenOpen,true)})
    this.acels.set('File','Import Modules','CmdOrCtrl+L',()=>{this.source.load('orca')})
    this.acels.set('File','Export','CmdOrCtrl+S',()=>{this.source.write('orca','orca',`${this.orca}`,'text/plain')})
    this.acels.set('File','Export Selection','CmdOrCtrl+Shift+S',()=>{this.source.write('orca','orca',`${this.cursor.selection()}`,'text/plain')})
    this.acels.set('Edit','Undo','CmdOrCtrl+Z',()=>{this.history.undo()})
    this.acels.set('Edit','Redo','CmdOrCtrl+Shift+Z',()=>{this.history.redo()})
    this.acels.add('Edit','cut'); this.acels.add('Edit','copy'); this.acels.add('Edit','paste')
    this.acels.set('Edit','Select All','CmdOrCtrl+A',()=>{this.cursor.selectAll()})
    this.acels.set('Edit','Erase Selection','Backspace',()=>{if(this.cursor.ins){this.cursor.erase();this.cursor.move(-1,0)}else{this[this.commander.isActive?'commander':'cursor'].erase()}})
    this.acels.set('Edit','Uppercase','CmdOrCtrl+Shift+U',()=>{this.cursor.toUpperCase()})
    this.acels.set('Edit','Lowercase','CmdOrCtrl+Shift+L',()=>{this.cursor.toLowerCase()})
    this.acels.set('Edit','Drag North','Alt+ArrowUp',()=>{this.cursor.drag(0,1)})
    this.acels.set('Edit','Drag East','Alt+ArrowRight',()=>{this.cursor.drag(1,0)})
    this.acels.set('Edit','Drag South','Alt+ArrowDown',()=>{this.cursor.drag(0,-1)})
    this.acels.set('Edit','Drag West','Alt+ArrowLeft',()=>{this.cursor.drag(-1,0)})
    this.acels.set('Edit','Drag North(Leap)','CmdOrCtrl+Alt+ArrowUp',()=>{this.cursor.drag(0,this.grid.h)})
    this.acels.set('Edit','Drag East(Leap)','CmdOrCtrl+Alt+ArrowRight',()=>{this.cursor.drag(this.grid.w,0)})
    this.acels.set('Edit','Drag South(Leap)','CmdOrCtrl+Alt+ArrowDown',()=>{this.cursor.drag(0,-this.grid.h)})
    this.acels.set('Edit','Drag West(Leap)','CmdOrCtrl+Alt+ArrowLeft',()=>{this.cursor.drag(-this.grid.w,0)})
    this.acels.set('Project','Find','CmdOrCtrl+J',()=>{this.commander.start('find:')})
    this.acels.set('Project','Inject','CmdOrCtrl+B',()=>{this.commander.start('inject:')})
    this.acels.set('Project','Toggle Commander','CmdOrCtrl+K',()=>{this.commander.start()})
    this.acels.set('Project','Run Commander','Enter',()=>{this.runEnter()})
    this.acels.set('Cursor','Toggle Insert Mode','CmdOrCtrl+I',()=>{this.cursor.ins=!this.cursor.ins})
    this.acels.set('Cursor','Toggle Block Comment','CmdOrCtrl+/',()=>{this.cursor.comment()})
    this.acels.set('Cursor','Trigger Operator','CmdOrCtrl+P',()=>{this.cursor.trigger()})
    this.acels.set('Cursor','Reset','Escape',()=>{ this.resetAll() })
    this.acels.set('Move','Move North','ArrowUp',()=>{this.cursor.move(0,1)})
    this.acels.set('Move','Move East','ArrowRight',()=>{this.cursor.move(1,0)})
    this.acels.set('Move','Move South','ArrowDown',()=>{this.cursor.move(0,-1)})
    this.acels.set('Move','Move West','ArrowLeft',()=>{this.cursor.move(-1,0)})
    this.acels.set('Move','Move North(Leap)','CmdOrCtrl+ArrowUp',()=>{this.cursor.move(0,this.grid.h)})
    this.acels.set('Move','Move East(Leap)','CmdOrCtrl+ArrowRight',()=>{this.cursor.move(this.grid.w,0)})
    this.acels.set('Move','Move South(Leap)','CmdOrCtrl+ArrowDown',()=>{this.cursor.move(0,-this.grid.h)})
    this.acels.set('Move','Move West(Leap)','CmdOrCtrl+ArrowLeft',()=>{this.cursor.move(-this.grid.w,0)})
    this.acels.set('Move','Scale North','Shift+ArrowUp',()=>{this.cursor.scale(0,1)})
    this.acels.set('Move','Scale East','Shift+ArrowRight',()=>{this.cursor.scale(1,0)})
    this.acels.set('Move','Scale South','Shift+ArrowDown',()=>{this.cursor.scale(0,-1)})
    this.acels.set('Move','Scale West','Shift+ArrowLeft',()=>{this.cursor.scale(-1,0)})
    this.acels.set('Move','Scale North(Leap)','CmdOrCtrl+Shift+ArrowUp',()=>{this.cursor.scale(0,this.grid.h)})
    this.acels.set('Move','Scale East(Leap)','CmdOrCtrl+Shift+ArrowRight',()=>{this.cursor.scale(this.grid.w,0)})
    this.acels.set('Move','Scale South(Leap)','CmdOrCtrl+Shift+ArrowDown',()=>{this.cursor.scale(0,-this.grid.h)})
    this.acels.set('Move','Scale West(Leap)','CmdOrCtrl+Shift+ArrowLeft',()=>{this.cursor.scale(-this.grid.w,0)})
    this.acels.set('Clock','Play/Pause','Space',()=>{if(this.cursor.ins){this.cursor.move(1,0)}else{this.clock.togglePlay(false)}})
    this.acels.set('Clock','Frame By Frame','CmdOrCtrl+F',()=>{this.clock.touch()})
    this.acels.set('Clock','Reset Frame','CmdOrCtrl+Shift+R',()=>{this.clock.setFrame(0)})
    this.acels.set('Clock','Incr. Speed','>',()=>{this.clock.modSpeed(1)})
    this.acels.set('Clock','Decr. Speed','<',()=>{this.clock.modSpeed(-1)})
    this.acels.set('Clock','Incr. Speed(10x)','CmdOrCtrl+>',()=>{this.clock.modSpeed(10,true)})
    this.acels.set('Clock','Decr. Speed(10x)','CmdOrCtrl+<',()=>{this.clock.modSpeed(-10,true)})
    this.acels.set('View','Toggle Retina','Tab',()=>{this.toggleRetina()})
    this.acels.set('View','Toggle Guide','CmdOrCtrl+G',()=>{this.toggleGuide()})
    this.acels.set('View','Incr. Col',']',()=>{this.modGrid(1,0)})
    this.acels.set('View','Decr. Col','[',()=>{this.modGrid(-1,0)})
    this.acels.set('View','Incr. Row','}',()=>{this.modGrid(0,1)})
    this.acels.set('View','Decr. Row','{',()=>{this.modGrid(0,-1)})
    this.acels.set('View','Zoom In','CmdOrCtrl+=',()=>{this.modZoom(0.0625)})
    this.acels.set('View','Zoom Out','CmdOrCtrl+-',()=>{this.modZoom(-0.0625)})
    this.acels.set('View','Zoom Reset','CmdOrCtrl+0',()=>{this.modZoom(1,true)})
    this.acels.set('View','Fullscreen','CmdOrCtrl+Enter',()=>{if(window.api&&window.api.app){window.api.app.toggleFullscreen()}})
    this.acels.set('View','Activate FX Situation','Alt+V',()=>{this.fxTextMode=false;this.bigTextMode=false;this.commander.isActive=false;this.commander.query='fx:';this.cursor.ins=false;this.update()})
    // === SHADER SHORTCUTS (default 400.400: rand=400, drive=400) ===
    this.acels.set('View','Broken TV','Alt+T',()=>{this.activateFx('brokentv')})
    this.acels.set('View','Datamosh','Alt+D',()=>{this.activateFx('datamosh')})
    this.acels.set('View','Glitch','Alt+J',()=>{this.activateFx('glitch')})
    this.acels.set('View','Ameba','Alt+K',()=>{this.activateFx('ameba')})
    this.acels.set('View','Fractal','Alt+R',()=>{this.activateFx('fractal')})
    this.acels.set('View','Displace','Alt+S',()=>{this.activateFx('displace')})
    this.acels.set('View','Chromawarp','Alt+N',()=>{this.activateFx('chromawarp')})
    this.acels.set('View','Glow','Alt+L',()=>{this.activateFx('glow')})
    this.acels.set('View','Fracture','Alt+Q',()=>{this.activateFx('fracture')})
    this.acels.set('View','Freeze Loop','Alt+F',()=>{this.activateFx('freezeloop')})
    this.acels.set('View','Bubble Glow','Alt+E',()=>{this.activateFx('bubble')})
    this.acels.set('View','Webcam','Alt+Z',()=>{this.toggleWebcam()})
    // === TOTAL GLITCH / PANIC ===
    this.acels.set('View','Total Glitch','Alt+Shift+X',()=>{this.toggleTotalGlitch()})
    this.acels.set('View','Load GIF Swarm','Alt+G',()=>{this.background.loadSwarm();this.update()})
    this.acels.set('View','Load Background Once','Alt+B',()=>{this.background.loadBackground();this.update()})
    this.acels.set('View','Background Auto Cycle','Alt+Shift+B',()=>{this.background.startAuto();this.update()})
    this.acels.set('View','Big Text Overlay','Alt+W',()=>{this.commander.isActive=false;this.fxTextMode=false;this.bigTextMode=true;this.bigTextBuffer='';this.cursor.ins=false;this.update()})
    // === MODELLI 3D (Poly Haven / Thingiverse) ===
    this.acels.set('View','3D Model on/off','Alt+P',()=>{if(this.model3d){this.model3d.toggle()}})
    this.acels.set('View','3D Add Model','Alt+M',()=>{if(this.model3d){this.model3d.addModel()}})
    this.acels.set('View','3D Search Model','Alt+Shift+P',()=>{
      this.commander.isActive=false; this.fxTextMode=false; this.bigTextMode=false; this.tagMode=false
      this.modelSearchMode=true; this.modelSearchBuffer=''; this.cursor.ins=false; this.update()
    })
    this.acels.set('View','3D Glossy (Chrome)','Alt+C',()=>{if(this.model3d){this.model3d.toggleGlossy();this.update()}})
    this.acels.set('View','3D Clear Models','Alt+Shift+C',()=>{if(this.model3d){this.model3d.clearModels();this.update()}})
    this.acels.set('View','Next Tag','CmdOrCtrl+Shift+T', () => {
      const idx = (this.tags.indexOf(this.currentTag) + 1) % this.tags.length
      this.currentTag = this.tags[idx]
      this.background.loadBackgroundByTag(this.tagFor('bg'))
      this.background.loadSwarmByTag(this.tagFor('gif'))
      // Anche il modello 3D segue il tag (se ha un override suo, resta il suo).
      if (this.model3d && this.model3d.active) { this.model3d.loadRandom() }
      console.log('[Orca] Tag globale:', this.currentTag, '| bg:', this.tagFor('bg'), 'gif:', this.tagFor('gif'), '3d:', this.tagFor('model'), 'font:', this.tagFor('font'))
    })
    // Cambia SOLO il tag del modello 3D, senza toccare bg/gif/font.
    this.acels.set('View','Next Tag (3D)','Alt+Shift+T', () => {
      const idx = (this.tags.indexOf(this.tagFor('model')) + 1) % this.tags.length
      this.setTagFor('model', this.tags[idx])
      if (this.model3d && this.model3d.active) { this.model3d.loadRandom() }
      console.log('[Orca] Tag 3D:', this.tagFor('model'))
      this.update()
    })
    this.acels.set('Midi','Play/Pause Midi','CmdOrCtrl+Space',()=>{this.clock.togglePlay(true)})
    this.acels.set('Midi','Next Input Device','CmdOrCtrl+,',()=>{this.clock.setFrame(0);this.io.midi.selectNextInput()})
    this.acels.set('Midi','Next Output Device','CmdOrCtrl+.',()=>{this.clock.setFrame(0);this.io.midi.selectNextOutput()})
    this.acels.set('Midi','Refresh Devices','CmdOrCtrl+Shift+M',()=>{this.io.midi.refresh()})
    this.acels.set('Communication','Choose OSC Port','alt+O',()=>{this.commander.start('osc:')})
    this.acels.set('Communication','Choose UDP Port','alt+U',()=>{this.commander.start('udp:')})
    this.acels.install(window)
    this.acels.pipe(this.commander)

    // --- KEYDOWN ---
    window.addEventListener('keydown',(e)=>{
      // Cmd+W → aggiungi tag e cerca subito (non chiudere la finestra)
      if(e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'KeyW') {
        this.commander.isActive=false; this.fxTextMode=false; this.bigTextMode=false; this.tagMode=true; this.tagBuffer=''; this.cursor.ins=false; this.update(); e.preventDefault(); e.stopPropagation(); return
      }
      if(e.altKey&&!e.ctrlKey&&!e.metaKey){
        const c=e.code
        if(c==='KeyV'){this.fxTextMode=false;this.bigTextMode=false;this.commander.isActive=false;this.commander.query='fx:';this.cursor.ins=false;this.update();e.preventDefault();e.stopPropagation();return}
        if(c==='KeyT'){this.activateFx('brokentv');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyD'){this.activateFx('datamosh');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyJ'){this.activateFx('glitch');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyK'){this.activateFx('ameba');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyR'){this.activateFx('fractal');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyS'){this.activateFx('displace');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyN'){this.activateFx('chromawarp');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyL'){this.activateFx('glow');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyQ'){this.activateFx('fracture');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyF'){this.activateFx('freezeloop');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyE'){this.activateFx('bubble');e.preventDefault();e.stopPropagation();return}
        if(c==='KeyZ'){this.toggleWebcam();e.preventDefault();e.stopPropagation();return}
        if(c==='KeyX' && e.shiftKey){this.toggleTotalGlitch();e.preventDefault();e.stopPropagation();return}
        if(c==='KeyG'){this.background.loadSwarm();this.update();e.preventDefault();e.stopPropagation();return}
        if(c==='KeyB'){if(e.shiftKey){this.background.startAuto()}else{this.background.loadBackground()}this.update();e.preventDefault();e.stopPropagation();return}
        if(c==='KeyW'){this.commander.isActive=false;this.fxTextMode=false;this.bigTextMode=true;this.bigTextBuffer='';this.cursor.ins=false;this.update();e.preventDefault();e.stopPropagation();return}
        if(c==='KeyH'){if(this.faceTracker){this.faceTracker.toggleMask()}e.preventDefault();e.stopPropagation();return}
        if(c==='KeyP'){
          if(e.shiftKey){this.commander.isActive=false;this.fxTextMode=false;this.bigTextMode=false;this.tagMode=false;this.modelSearchMode=true;this.modelSearchBuffer='';this.cursor.ins=false;this.update()}
          else if(this.model3d){this.model3d.toggle()}
          e.preventDefault();e.stopPropagation();return
        }
        if(c==='KeyM' && !e.shiftKey){if(this.model3d){this.model3d.addModel()}e.preventDefault();e.stopPropagation();return}
        // Alt+C = GLOSSY · Alt+Shift+C = svuota i modelli.
        // Lo Shift va controllato PRIMA dentro lo stesso blocco: un
        // `if(c==='KeyC')` secco intercetterebbe anche Shift+C e renderebbe
        // irraggiungibile il resto (era il bug di Alt+Shift+G vs Alt+G).
        if(c==='KeyC'){
          if(e.shiftKey){ if(this.model3d){this.model3d.clearModels()} }
          else { if(this.model3d){this.model3d.toggleGlossy()} }
          this.update();e.preventDefault();e.stopPropagation();return
        }
      }
      if(this.bigTextMode){
        if(e.key==='Enter'){this.runEnter();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){this.bigTextMode=false;this.bigTextBuffer='';this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.bigTextBuffer=this.bigTextBuffer.slice(0,-1);this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(this.bigTextBuffer.length<42){this.bigTextBuffer+=e.key}this.update();e.preventDefault();e.stopPropagation();return}
        return
      }
      if(this.fxTextMode){
        if(e.key==='Enter'){this.runEnter();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){this.fxTextMode=false;this.fxTextBuffer='';this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.fxTextBuffer=this.fxTextBuffer.slice(0,-1);this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){this.fxTextBuffer+=e.key;this.update();e.preventDefault();e.stopPropagation();return}
        return
      }
      if(this.modelSearchMode){
        // Alt+Shift+P: digita un termine e premi Enter → cerca e carica il modello
        if(e.key==='Enter'){this.runEnter();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){this.modelSearchMode=false;this.modelSearchBuffer='';this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.modelSearchBuffer=this.modelSearchBuffer.slice(0,-1);this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(this.modelSearchBuffer.length<40){this.modelSearchBuffer+=e.key}this.update();e.preventDefault();e.stopPropagation();return}
        return
      }
      if(this.tagMode){
        if(e.key==='Enter'){this.runEnter();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){this.tagMode=false;this.tagBuffer='';this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.tagBuffer=this.tagBuffer.slice(0,-1);this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(this.tagBuffer.length<32){this.tagBuffer+=e.key}this.update();e.preventDefault();e.stopPropagation();return}
        return
      }
      if(this.commander.isActive && !this.commander.query.startsWith('fx:')){
        // Commander generico (Cmd+K → bpm:, play, stop, ecc.)
        if(e.key==='Enter'){this.commander.run();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){this.commander.stop();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.commander.erase();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){this.commander.write(e.key);this.update();e.preventDefault();e.stopPropagation();return}
        return
      }
      if(this.commander.query.startsWith('fx:')){
        if(e.key==='Enter'){this.runEnter();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){if(this.fxManager){this.fxManager.setChain([])}this.commander.query='';this.commander.isActive=false;this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.commander.query=this.commander.query.slice(0,-1);if(this.commander.query==='fx'){this.commander.query='fx:'}this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){this.commander.query+=e.key;this.update();e.preventDefault();e.stopPropagation();return}
      }
    },true)
  }

  // ============ FX ACTIVATION (shader GLEngine, default 400.400) ============
  // (le patch CABLES sono state rimosse: qui restano solo gli shader .frag)
  this.activateFx = (name, rand = 400, drive = 400) => {
    const lname = name.toLowerCase()
    this.audioReactor.randomizeFilters(rand)
    this.audioReactor.drive = drive / 1000
    this.fxManager.setChain([{ name: lname, seed: rand / 1000, drive: drive }])
    this.totalGlitch = false
    console.log('[FX] shader:', lname, `${rand}.${drive}`)
    this.update()
  }

  // Toggle webcam livefeed (Alt+Z) — all'attivazione parte automaticamente
  // anche il face tracking + la maschera (senza bisogno di Alt+A).
  this.toggleWebcam = () => {
    if (!this.background) return
    if (this.background.mode === 'webcam') {
      this.background.stopWebcam()
      if (this.faceTracker) { this.faceTracker.setVideo(null); this.faceTracker.stop() }
      console.log('[Webcam] disattivata')
    } else {
      this.background.startWebcam()
      // avvia il face tracking appena il video webcam è pronto
      this.startFaceTracking()
    }
    this.update()
  }

  // Avvia il face tracking + la maschera in automatico (chiamato da toggleWebcam).
  this.startFaceTracking = () => {
    if (!this.faceTracker) return
    const tryBind = () => {
      const v = this.background && this.background.webcam
      if (v && v.videoWidth) {
        this.faceTracker.setVideo(v)
        this.faceTracker.init().then(() => {
          this.faceTracker.start()
          // attiva anche la maschera in automatico (solo se non già attiva)
          if (!this.faceTracker.maskOn) { this.faceTracker.toggleMask() }
        })
        console.log('[FaceTracker] attivato')
      } else {
        // webcam non ancora pronta: riprova al prossimo tick
        setTimeout(tryBind, 300)
      }
    }
    tryBind()
    this.update()
  }

  // Pulizia TOTALE: spegne ogni FX (shader, 3D, webcam, face tracking,
  // maschere, background, GIF, big text, glitch/panic). Resta SOLO la patch Orca.
  this.resetAll = () => {
    this.toggleGuide(false)
    this.commander.stop()
    this.clear()
    this.clock.isPaused = false
    this.cursor.reset()
    // Shader chain
    if (this.fxManager) { this.fxManager.setChain([]) }
    // Background / GIF / layers / webcam
    if (this.background) { this.background.off() }
    // Modello 3D
    if (this.model3d) { this.model3d.stop() }
    // Face tracking + maschere
    if (this.faceTracker) {
      this.faceTracker.stop()
      if (this.faceTracker.maskOn) { this.faceTracker.maskOn = false; this.faceTracker._stopMaskSwapTimer() }
    }
    // Glitch / panic + ripristino BPM
    this.totalGlitch = false
    this.panicMode = false
    this.clock.glitching = false
    if (this._savedGlitchBpm) {
      this.clock.setSpeed(this._savedGlitchBpm, this._savedGlitchBpm, true)
      this._savedGlitchBpm = null
    }
    // Mode testo
    this.fxTextMode = false; this.fxTextBuffer = ''
    this.bigTextMode = false; this.bigTextBuffer = ''; this.bigTexts = []
    this.tagMode = false; this.tagBuffer = ''
    this.modelSearchMode = false; this.modelSearchBuffer = ''
    this._progDirty = true
    this.update()
  }

  this.start = () => {
    console.log('[Client] start() inizio')
    console.log('[DIAGNOSIS] start: before theme.start()')
    this.theme.start(); this.io.start()
    console.log('[DIAGNOSIS] start: after theme.start(), before history.bind')
    this.history.bind(this.orca,'s'); this.history.record(this.orca.s)
    console.log('[DIAGNOSIS] start: after history, before clock.start')
    this.clock.start(); this.cursor.start()
    console.log('[DIAGNOSIS] start: after clock.start, before reset')
    this.reset(); this.modZoom()
    console.log('[DIAGNOSIS] start: after reset/modZoom, before className')
    this.el.className='ready'; this.toggleGuide()
    console.log('[Client] start() fine — canvas:', this.el.width, 'x', this.el.height)
    console.log('[DIAGNOSIS] start: before startRenderLoop')
    // Render loop rAF indipendente dal BPM
    this.startRenderLoop()
    console.log('[DIAGNOSIS] start: after startRenderLoop')
    // Carica shader FX async (contextIsolation compatibile)
    if (this.fxManager && !this.fxManager._shadersLoaded) {
      this.fxManager._shadersLoaded = true
      this.fxManager.loadCustomShaders()
    }
    console.log('[DIAGNOSIS] start: finished')
    // Menu action listener (da main process via preload)
    if (window.api && window.api.menu) {
      window.api.menu.onAction((action) => {
        if (action === 'zoomIn') this.modZoom(0.0625)
        else if (action === 'zoomOut') this.modZoom(-0.0625)
        else if (action === 'zoomReset') this.modZoom(1, true)
        else if (action === 'toggleGuide') this.toggleGuide()
        else if (action === 'addTag') { this.commander.isActive=false; this.fxTextMode=false; this.bigTextMode=false; this.tagMode=true; this.tagBuffer=''; this.cursor.ins=false; this.update() }
        else if (action === 'toggleWebcam') this.toggleWebcam()
        else if (action === 'fileNew') this.reset()
        else if (action === 'fileOpen') this.source.open('orca', this.whenOpen, true)
        else if (action === 'fileExport') this.source.write('orca', 'orca', `${this.orca}`, 'text/plain')
        else if (action === 'fxBrokentv') this.activateFx('brokentv')
        else if (action === 'fxDatamosh') this.activateFx('datamosh')
        else if (action === 'fxFractal') this.activateFx('fractal')
        else if (action === 'fxTotalGlitch') this.toggleTotalGlitch()
        else if (action === ':copy') this.cursor.copy()
        else if (action === ':cut') { this.cursor.copy(); this.cursor.erase() }
        else if (action === ':paste') this.cursor.paste(true)
        else {
          // FALLBACK GENERICO: action è un accelerator string (es. 'CmdOrCtrl+B', 'Space')
          // → cerca l'acels corrispondente e chiama il suo handler. Un solo punto di verità.
          const acel = this.acels.get(action)
          if (acel && acel.downfn) { acel.downfn(); this._progDirty = true }
          else { console.warn('[Menu] Nessuna azione per:', action) }
        }
      })
    }
    if(navigator.requestMIDIAccess){
      navigator.requestMIDIAccess({sysex:false}).then((acc)=>{
        const hook=(inp)=>{inp.onmidimessage=(m)=>this.onMidi(m)}
        acc.inputs.forEach(hook)
        acc.onstatechange=(e)=>{if(e.port.type==='input'&&e.port.state==='connected'){hook(e.port)}}
      }).catch(()=>{})
    }
  }

  this.onMidi = (m) => {
  const st = m.data[0] & 0xf0
  const channel = st & 0x0f
  const note = m.data[1] || 0
  const velocity = m.data[2] || 0

  if (st === 0x90 && velocity > 0) {
    this.midiNote = { note: note / 127, channel: channel };
    if (this.background) {
      this.background.onMidiNote(channel, note, velocity);
    }
    if (this.gifDecoder) {
      this.gifDecoder.onMidiNote(channel, note, velocity);
    }
    if (this.bigText) {
      this.bigText.onMidiNote(channel, note, velocity);
    }
  }

  // CC disabilitati — solo NOTE attivi per MIDI mapping
}

  this.reset = () => { this.orca.reset(); this.resize(); this.source.new(); this.history.reset(); this.cursor.reset(); this.clock.play() }
  this.run = () => { this.io.clear(); this.clock.run(); this.orca.run(); this.io.run(); this._progDirty = true; this.update() }

  this.runEnter = () => {
    if(this.modelSearchMode){
      // Cerca e carica un modello 3D per il termine digitato
      const q = this.modelSearchBuffer.trim().toLowerCase()
      if(q.length>0 && this.model3d){
        this.model3d.active = true
        console.log('[Orca] Ricerca modello 3D:', q)
        this.model3d.loadRandom(q)
      }
      this.modelSearchMode=false; this.modelSearchBuffer=''; this.update(); return
    }
    if(this.tagMode){
      // Aggiungi tag e cerca subito immagini + gif
      const tag = this.tagBuffer.trim().toLowerCase()
      if(tag.length>0){
        if(this.tags.indexOf(tag) < 0){ this.tags.push(tag) }
        if(this.background.tagKeys.indexOf(tag) < 0){ this.background.tagKeys.push(tag) }
        if(!this.background.commonsTags[tag]){ this.background.commonsTags[tag] = [tag] }
        this.currentTag = tag
        this.background.loadBackgroundByTag(tag)
        this.background.loadSwarmByTag(tag)
        console.log('[Orca] Tag aggiunto e cercato:', tag)
      }
      this.tagMode=false; this.tagBuffer=''; this.update(); return
    }
    if(this.bigTextMode){
      if(this.bigTextBuffer.length>0){this._bigTextFontIdx=(this._bigTextFontIdx||0)+1;const bigColors=['#ff10f0','#b39dff','#39ff14','#00ffd0'];while(this.bigTexts.length>=4){this.bigTexts.shift()}const btText=this.bigTextBuffer.toUpperCase().slice(0,42);const btMotion=this.pickBigTextMotion();this.bigTexts.push(Object.assign({text:btText,mode:Math.floor(Math.random()*3),born:performance.now(),ttl:this.bigTextDuration(btText),seed:Math.random(),fontIdx:this._bigTextFontIdx,sizePct:0.5+Math.random()*0.3,color:bigColors[Math.floor(Math.random()*4)]},btMotion))}
      this.bigTextMode=false;this.bigTextBuffer='';this.update();return
    }
    if(this.fxTextMode){
      if(this.fxTextBuffer.length>0){const t=this.fxTextBuffer.toUpperCase();this.orca.writeBlock(this.cursor.x,this.cursor.y,t);this.cursor.move(t.length,0)}
      this.fxTextMode=false;this.fxTextBuffer='';this.history.record(this.orca.s);this.update();return
    }
    if(this.commander.query.startsWith('fx:')){
      const val=this.commander.query.substr(3).trim()
      if(val.length>0){this.commander.trigger('fx:'+val)}else{this.fxManager.setChain([])}
      this.commander.query='';this.commander.isActive=false;this.update();return
    }
    this.commander.run()
  }

  this.getBeatTime = function(){const bpm=this.clock.speed.value||120;return (this.orca.f||0)*(60/bpm)/4}

  // ============ RENDER LOOP (rAF, INDIPENDENTE dal BPM) ============
  // Il sequencer gira sul suo clock worker; il rendering gira su requestAnimationFrame.
  // Gli eventi MIDI dello score influenzano il motore grafico via scoreFlash/scorePulse,
  // non rallentando o accelerando il framerate.
  // Helper sicuro: drawImage con validazione dimensioni canvas
  this._safeDrawImage = (ctx, src, ...args) => {
    if (!src || !src.width || !src.height) return
    ctx.drawImage(src, ...args)
  }

  this.update = () => {
    // === DRAWCURSOR gira SEMPRE, anche se il resto di update() crasha ===
    // (così il cursore resta visibile anche con errori FX)
    try { this.drawCursor() } catch (_) {}
    try {
    const now = performance.now()
    // Total glitch: BPM randomico 0-999 con rate molto veloce (ogni ~40ms)
    if (this.totalGlitch) {
      if (now - (this._glitchBpmLast || 0) > 40) {
        this._glitchBpmLast = now
        const rndBpm = Math.floor(Math.random() * 1000) // 0..999
        this.clock.setSpeed(rndBpm, rndBpm, true)
      }
    }
    const bpm = this.clock.speed.value || 120
    const regime = bpm > 600 ? 2 : (bpm > 200 ? 1 : 0)
    const fxOn = this.fxManager && this.fxManager.ok && this.fxManager.chain && this.fxManager.chain.length > 0
    const dt = now - (this.lastFrame || now); this.lastFrame = now
    this.fps = this.fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1
    this.frameCount++
    const beat = this.getBeatTime()
    const a = this.audioReactor

    // Score flash decay (le note MIDI generate da Orca pulsano il motore grafico)
    this.scoreFlash = Math.max(0, this.scoreFlash - dt * 0.004)

    // Mic negato → bande simulate dal beat (altrimenti gli shader restano morti su feed nero)
    if (!this.audioReactor.isActive && this.audioReactor.getSimulated) {
      this.audioReactor.getSimulated(beat)
    }

    const audioBands = this.audioReactor.getBands ? this.audioReactor.getBands() : [0,0,0,0,0,0,0]
    // p7 = drive dell'audio capture (0..1), lo stesso valore passato agli shader
    const drive = this.audioReactor.drive || 0
    this.params = {
      p0: audioBands[0] || 0,
      p1: audioBands[1] || 0,
      p2: audioBands[2] || 0,
      p3: audioBands[3] || 0,
      p4: audioBands[4] || 0,
      p5: audioBands[5] || 0,
      p6: audioBands[6] || 0,
      p7: drive
    }

    const t0 = performance.now()
    // Nascondi i canvas estranei SOLO ogni ~2s (era un querySelectorAll su OGNI
    // frame = allocazione di una NodeList + scansione del DOM 60 volte al
    // secondo). L'operazione è idempotente: rallentarla non cambia il risultato.
    // (Serviva per le patch CABLES, ora rimosse: resta come rete di sicurezza.)
    if ((this.frameCount % 120) === 0) {
      const allCanvases = document.querySelectorAll('canvas')
      for (const c of allCanvases) {
        if (c !== this.el && c !== this.sceneEl && c !== this.progEl && c !== this.cursorEl && c.style.display !== 'none') {
          c.style.display = 'none'
        }
      }
    }
    this.clear()

    // === PIANO 0: TERMINALE ORCA nel buffer dedicato (ridisegno solo se dirty) ===
    if (this._progDirty || this.orca.f !== this._lastProgF) {
      this.progCtx.clearRect(0, 0, this.progEl.width, this.progEl.height)
      const savedCtx0 = this.context; this.context = this.progCtx
      this.ports = this.findPorts()
      this.drawProgram()
      this.context = savedCtx0
      this._progDirty = false
      this._lastProgF = this.orca.f
    }

    // === PIANO 1: FEED (background, swarm, bigTexts) ===
    this.sceneCtx.clearRect(0, 0, this.sceneEl.width, this.sceneEl.height)
    const savedCtx = this.context; this.context = this.sceneCtx
    // Video feed (webcam/layers) come BASE
    this.background.draw(this.context, this.sceneEl.width, this.sceneEl.height)
    this.background.drawSwarm(this.context, this.sceneEl.width, this.sceneEl.height)
    this.drawBigTexts(this.context, this.sceneEl.width, this.sceneEl.height)
    // Maschera facciale trasparente agganciata al volto (sotto il terminale, dentro il feed)
    if (this.faceTracker) {
      this.faceTracker.drawMask(this.context, this.sceneEl.width, this.sceneEl.height)
    }
    // Modello 3D (web) come feed trasparente sopra il background
    if (this.model3d && this.model3d.active) {
      if (this.model3d.render(dt, now) && this.model3d.canvas) {
        try { this._safeDrawImage(this.context, this.model3d.canvas, 0, 0, this.sceneEl.width, this.sceneEl.height) } catch (e) {}
      }
    }
    // TOTAL GLITCH: anche il terminale entra nel feed → gli shader distruggono TUTTO
    if (this.totalGlitch) {
      this._safeDrawImage(this.context, this.progEl, 0, 0)
    }
    this.context = savedCtx

    // === PIANO 2: FX SHADER sul feed ===
    let feedOut = this.sceneEl
    if (fxOn) {
      // Metriche face tracking (0 se assente) → mappatura default proposta:
      // bocca aperta → vol, inclinazione testa → roll, posizione viso → displacement, ammiccamento → flash
      const fm = (this.faceTracker && this.faceTracker.metrics) || null
      const faceVol = fm ? fm.mouthOpen : 0
      const faceFlash = fm ? fm.blinkEdge : 0
      const info = { beat: beat, regime: regime, bass: a.bass, mid: a.mid, high: a.high, vol: Math.max(a.envelope, faceVol), scoreFlash: this.scoreFlash, wave: a.wave, p0: this.params.p0, p1: this.params.p1, p2: this.params.p2, p3: this.params.p3, p4: this.params.p4, p5: this.params.p5, p6: this.params.p6, p7: this.params.p7, faceFlash: faceFlash, fMouth: faceVol, fEye: fm ? fm.eyeOpen : 0, fBlink: fm ? fm.blink : 0, fBlinkEdge: faceFlash, fX: fm ? fm.faceX : 0, fY: fm ? fm.faceY : 0, fRoll: fm ? fm.roll : 0, fScale: fm ? fm.faceScale : 0 }
      if (this.fxManager.render(this.sceneEl, info)) {
        try { this._safeDrawImage(this.context, this.fxManager.canvas, 0, 0, this.el.width, this.el.height) } catch (_) {}
        feedOut = null
      }
      // --- QUALITÀ ADATTIVA -------------------------------------------------
      // Gli shader sono la voce più pesante (fino a 4 pass a piena risoluzione).
      // Se gli fps scendono si riduce la risoluzione INTERNA della catena
      // (min 0.5×, cioè 1/4 dei pixel); se risalgono si ripristina.
      // L'upscale avviene nella drawImage qui sopra → gratis (GPU).
      const qNow = this.fxManager.quality != null ? this.fxManager.quality : 1
      if (now - (this._lastQAdj || 0) > 700) {
        this._lastQAdj = now
        let q = qNow
        if (this.fps < 42 && q > 0.5) q = Math.max(0.5, q - 0.1)
        else if (this.fps > 56 && q < 1) q = Math.min(1, q + 0.05)
        if (q !== qNow) {
          this.fxManager.quality = q
          console.log('[FX] qualità', Math.round(q * 100) + '%', '(' + Math.round(this.fps) + ' fps)')
        }
      }
    } else if (this.fxManager.quality !== 1 && this.fxManager.quality != null) {
      // Catena spenta: torna a piena qualità per il prossimo effetto
      this.fxManager.quality = 1
    }
    if (feedOut) { this._safeDrawImage(this.context, this.sceneEl, 0, 0) }

    // === PIANO 3: TERMINALE ORCA sopra il feed — MAI influenzato dagli shader ===
    // (saltato solo in Total Glitch, dove è già dentro il feed distrutto)
    if (!this.totalGlitch) {
      this._safeDrawImage(this.context, this.progEl, 0, 0)
    }

    // === PANIC — scritta multilingua sopra il glitch (resta finché totalGlitch è attivo) ===
    if (this.panicMode) {
      // Ruota la lingua ogni ~600ms (dalla lista panicWords: PANIC/PANICO/PANIQUE/...)
      const elapsed = now - this.panicStart
      const wordIdx = Math.floor(elapsed / 600) % this.panicWords.length
      this.panicWord = this.panicWords[wordIdx]
      // Flicker on/off rapido per un effetto strobo, con glitch interno costante
      const flickOn = (Math.floor(elapsed / 60) % 2 === 0)
      if (flickOn) { this.drawPanicText(1.0) }
    }

    // === PIANO 4: TESTO CHROMA (sopra tutto tranne panic) ===
    if (!this.panicMode) {
      this.drawChromaText(this.context, this.el.width, this.el.height)
    }

    const renderMs = performance.now() - t0
    if (this.fxManager.gpuMs) { this.gpuLoad = Math.min(1, this.fxManager.gpuMs / (1000 / Math.max(1, this.fps))) }
    else { this.gpuLoad = Math.min(1, renderMs / 16) }
    // === PIANO 5: UI (cache a ~15 fps + blit ogni frame) ===
    // Ridisegnare barra di stato + spettro FFT + overlay a 60 fps costava
    // ~5-6 ms/frame su ~7 ms totali. Il contenuto cambia lentamente, quindi:
    //  - ridisegno completo solo ogni _uiInterval ms;
    //  - ogni frame una drawImage dal buffer cacheato (copia GPU, ~0.1 ms).
    // Nelle modalità con input di testo la UI si ridisegna OGNI frame, così
    // digitare resta immediato (il costo è solo quello del testo, non dello
    // spettro FFT che è la parte pesante).
    // Solo il loader esplicito (3D/webcam) forza il ridisegno a ogni frame:
    // usare Net.busy() qui riporterebbe la UI al percorso lento durante un
    // qualunque download. Le richieste "quiet" (prefetch) non contano mai.
    const loading = !!(this._loaderMsg && (now - (this._loaderAt || 0) < 10000))
    const uiFast = !!(this.tagMode || this.bigTextMode || this.fxTextMode || this.modelSearchMode || this.commander.isActive || loading)
    if (uiFast || now - this._lastUi > this._uiInterval) {
      this._lastUi = now
      this.uiCtx.clearRect(0, 0, this.uiEl.width, this.uiEl.height)
      const savedUiCtx = this.context
      this.context = this.uiCtx
      try {
        this.drawInterface(); this.drawMonitor(); this.drawStatus(); this.drawOverlay(); this.drawGuide()
      } catch (e) { console.warn('[Client] UI draw:', e) } finally { this.context = savedUiCtx }
    }
    this._safeDrawImage(this.context, this.uiEl, 0, 0)
    } catch (e) { console.error('[Client] update() crash:', e) }
  }

  // Avvia il render loop indipendente (chiamato una sola volta da start)
  this.startRenderLoop = () => {
    console.log("[DIAGNOSIS] startRenderLoop called, _renderLoopActive:", this._renderLoopActive);
    if (this._renderLoopActive) {
      console.log("[DIAGNOSIS] startRenderLoop returning early, _renderLoopActive is true");
      return;
    }
    this._renderLoopActive = true;
    const loop = () => {
      this.update();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    console.log('[Client] Render loop rAF avviato (fps indipendenti dal BPM)');
  };

  // === CURSOR CUSTOM ===
  // Smile acid verde fluo con occhi a croce capovolta + fungo Amanita muscaria
  // psichedelico che flotta e segue il puntatore. Disegnato sul canvas cursorEl
  // (z-index massimo), quindi MAI influenzato dagli shader/FX.
  this.drawCursor = () => {
    if (this.frameCount === 0) {
      console.log("[DIAGNOSIS] drawCursor first call, pointer:", this.pointer, "ctx/el:", !!this.cursorCtx, !!this.cursorEl);
    }
    if (!this.cursorCtx || !this.cursorEl) return
    const ctx = this.cursorCtx
    let W = this.cursorEl.width, H = this.cursorEl.height
    // Guard: se il canvas è 0x0 (es. all'avvio prima del resize), usa le dimensioni finestra
    if (W === 0 || H === 0) {
      W = window.innerWidth
      H = window.innerHeight
      this.cursorEl.width = W
      this.cursorEl.height = H
    }
    // FOTO DIAGNOSTICA una tantum: stato reale del canvas nel DOM
    if (!this._cursorDiagDone) {
      this._cursorDiagDone = true
      const cs = getComputedStyle(this.cursorEl)
      console.log("[DIAGNOSIS] cursorEl state:", {
        attrW: this.cursorEl.width, attrH: this.cursorEl.height,
        cssDisplay: cs.display, cssVisibility: cs.visibility, cssPosition: cs.position,
        cssZIndex: cs.zIndex, cssWidth: cs.width, cssHeight: cs.height,
        opacity: cs.opacity, pointerEvents: cs.pointerEvents,
        inDom: document.body.contains(this.cursorEl),
        parentNode: this.cursorEl.parentNode && this.cursorEl.parentNode.tagName,
        rect: this.cursorEl.getBoundingClientRect().toJSON ? this.cursorEl.getBoundingClientRect() : null
      })
      console.log("[DIAGNOSIS] all canvases:", Array.from(document.querySelectorAll('canvas')).map(c => ({tag: c.tagName, z: getComputedStyle(c).zIndex, display: getComputedStyle(c).display, w: c.width, h: c.height})))
    }
    ctx.clearRect(0, 0, W, H)

    const c = this.pointer
    if (c.x < -10 || c.y < -10) return // nessun mouse ancora rilevato
    // Smooth follow: smiley reattivo, fungo più fluttuante/inerte
    c.sx += (c.x - c.sx) * 0.35
    c.sy += (c.y - c.sy) * 0.35
    c.fx += (c.x - c.fx) * 0.10
    c.fy += (c.y - c.fy) * 0.10

    const now = performance.now()
    const a = this.audioReactor
    const bass = a ? (a.bass || 0) : 0

    // Glitch periodico: ogni ~0.7-1.6s, per ~130ms, il cursore sfarfalla/trasla
    const glitchCycle = 700 + hash2(Math.floor(now / 900), 3) * 900
    const glitchOn = (now % glitchCycle) < 130
    const gAmt = glitchOn ? (6 + bass * 20) : 0
    const gx = glitchOn ? (hash2(Math.floor(now / 40), 11) - 0.5) * gAmt * 2 : 0
    const gy = glitchOn ? (hash2(Math.floor(now / 40), 13) - 0.5) * gAmt * 2 : 0

    const sx = c.sx + gx
    const sy = c.sy + gy
    const R = 17 + bass * 4

    // Click → squish rapido dello smile
    const clickAge = c.lastClick ? now - c.lastClick : 9999
    const squish = clickAge < 140 ? 1 - clickAge / 140 : 0

    // --- FUNGO AMANITA MUSCARIA (fluttua accanto, colori psichedelici) ---
    const hue = (now * 0.28) % 360
    const bob = Math.sin(now * 0.004) * 4
    const orbit = Math.sin(now * 0.002) * 6
    const mx = c.fx + 30 + orbit
    const my = c.fy - 26 + bob

    ctx.save()
    // Glitch: a volte sdoppia la sagoma in canale RGB spostato
    if (glitchOn) {
      ctx.globalAlpha = 0.45
      ctx.save()
      ctx.translate(mx + 2, my - 1)
      this._drawMushroom(ctx, (hue + 90) % 360, now, bass)
      ctx.restore()
      ctx.globalAlpha = 1
    }
    ctx.translate(mx, my)
    this._drawMushroom(ctx, hue, now, bass)
    ctx.translate(-mx, -my)

    // --- SMILE ACID (verde fluo) ---
    ctx.save()
    ctx.translate(sx, sy)
    if (squish > 0) { ctx.scale(1 + squish * 0.25, 1 - squish * 0.3) }
    // Alone verde fluo
    ctx.shadowColor = '#39ff14'
    ctx.shadowBlur = 18 + bass * 24
    ctx.fillStyle = '#39ff14'
    ctx.strokeStyle = '#0c7a05'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.stroke()

    // Occhi a croce capovolta (croce di San Pietro)
    const eyeY = -R * 0.25
    const eyeDx = R * 0.45
    const es = 4.5 + bass * 1.5
    ctx.strokeStyle = '#062a03'
    ctx.lineWidth = 1.8
    this._drawInvertedCross(ctx, -eyeDx, eyeY, es)
    this._drawInvertedCross(ctx, eyeDx, eyeY, es)

    // Bocca (sorriso)
    ctx.strokeStyle = '#0c7a05'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.arc(0, R * 0.15, R * 0.45, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
    ctx.restore()
    ctx.restore()
  }

  // Fungo Amanita muscaria: cappello rosso (hue psichedelico) a puntini bianchi,
  // gambo bianco con anello. `hue` cicla i colori nel tempo.
  this._drawMushroom = (ctx, hue, now, bass) => {
    const s = 1 + bass * 0.4 + Math.sin(now * 0.003) * 0.05
    ctx.save()
    ctx.scale(s, s)
    // Gambo
    ctx.fillStyle = `hsl(${(hue + 40) % 360}, 70%, 85%)`
    ctx.strokeStyle = `hsl(${(hue + 40) % 360}, 60%, 70%)`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-3.5, 2)
    ctx.quadraticCurveTo(-4.5, 14, -3, 20)
    ctx.lineTo(3, 20)
    ctx.quadraticCurveTo(4.5, 14, 3.5, 2)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // Anello (annulus)
    ctx.fillStyle = `hsl(${(hue + 40) % 360}, 60%, 92%)`
    ctx.fillRect(-4.5, 8, 9, 2.2)
    // Cappello a cupola
    ctx.fillStyle = `hsl(${hue}, 95%, 55%)`
    ctx.strokeStyle = `hsl(${hue}, 90%, 40%)`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, 1, 10, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // Gonna del cappello
    ctx.fillStyle = `hsl(${hue}, 90%, 75%)`
    ctx.fillRect(-10, -1, 20, 3)
    // Puntini bianchi
    ctx.fillStyle = '#ffffff'
    const spots = [[-5, -4, 1.6], [3, -6, 1.3], [0, -8, 1.9], [-2, -2, 0.9], [6, -3, 1.1], [-7, -6, 1.0]]
    for (const p of spots) {
      ctx.beginPath(); ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  // Croce capovolta (verticale più lunga sotto l'incrocio)
  this._drawInvertedCross = (ctx, x, y, s) => {
    ctx.beginPath()
    ctx.moveTo(x, y - s * 0.8)
    ctx.lineTo(x, y + s * 1.6)
    ctx.moveTo(x - s, y)
    ctx.lineTo(x + s, y)
    ctx.stroke()
  }

  // Testo "PANIC" — viola, glitch pesante, caratteri che cambiano font random
  // (font pescati dai tag già usati per immagini/gif), pixel drifting audio-reattivo.
  this.drawPanicText = (alpha) => {
    const W = this.el.width, H = this.el.height
    const ctx = this.context
    const now = performance.now()
    const a = this.audioReactor
    const bass = a ? (a.bass || 0) : 0
    const high = a ? (a.high || 0) : 0
    const glitchAmt = (1 - alpha) * 60
    ctx.save()
    ctx.globalAlpha = Math.min(1, alpha * 1.5)
    // Sfondo viola scuro tenue con flicker
    ctx.fillStyle = (Math.floor(now / 50) % 2 === 0) ? 'rgba(120,60,200,0.18)' : 'rgba(0,0,0,0.4)'
    ctx.fillRect(0, 0, W, H)

    // === TESTO PER-CARATTERE con glitch pesante ===
    const word = this.panicWord || 'PANIC'
    const size = Math.floor(H * 0.42)
    const pulse = 0.7 + 0.3 * Math.sin(now * 0.02)
    // Font pool derivato dai tag (ogni tag → font diverso)
    const fontPool = ['Impact', 'Comic Sans MS', 'Courier New', 'Georgia', 'Arial Black', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Palatino', 'Garamond', 'Brush Script MT']
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(150,80,255,0.8)'
    ctx.shadowBlur = 25 * pulse

    // Misura la larghezza totale per centrare il testo per-carattere
    let totalW = 0
    for (let i = 0; i < word.length; i++) {
      const font = fontPool[Math.floor(hash2(i, this.panicStart || now) * fontPool.length)]
      ctx.font = `300 ${size}px "${font}", sans-serif`
      totalW += ctx.measureText(word[i]).width
    }
    let cx = W / 2 - totalW / 2
    for (let i = 0; i < word.length; i++) {
      // Ogni ~300ms un carattere cambia font improvvisamente (pescando dai tag)
      const switchTick = Math.floor((now - (this.panicStart || now)) / 300)
      const charChanges = hash2(i, switchTick) > 0.7
      const font = fontPool[Math.floor(hash2(i, switchTick) * fontPool.length)]
      ctx.font = `300 ${size}px "${font}", sans-serif`
      const cw = ctx.measureText(word[i]).width
      const ch = word[i]
      // Glitch per carattere: offset casuale + jitter col basso
      const gx = (hash2(i, now) - 0.5) * (10 + bass * 40 + glitchAmt)
      const gy = (hash2(i, now * 1.3) - 0.5) * (6 + high * 25)
      ctx.fillStyle = `rgba(${Math.floor(150 * pulse)},${Math.floor(60 * pulse)},${Math.floor(255 * pulse)},${0.4 + charChanges * 0.6})`
      ctx.fillText(ch, cx + cw / 2 + gx, H / 2 + gy)
      cx += cw
    }
    ctx.shadowBlur = 0

    // === Scomposizione in pixel drifting (righe audio-reattive) ===
    const rows = 16
    for (let r = 0; r < rows; r++) {
      const rh = (H / rows) * (0.4 + hash2(r, now * 0.7) * 1.4)
      const sy = (r / rows) * H
      const dir = hash2(r, 1.7) > 0.5 ? 1 : -1
      const drift = dir * (0.5 + bass * 10 + high * 4) * Math.sin(now * 0.004 + r * 0.9) * 24
      const off = Math.round(drift * (1 + glitchAmt * 0.3))
      if (Math.abs(off) > 0.5) {
        ctx.drawImage(this.el, 0, sy, W, rh, off, sy, W, rh)
      }
    }

    // Slice glitch pesante (sempre attivo, più intenso durante la scomparsa)
    const slices = 16
    for (let i = 0; i < slices; i++) {
      const sy = (H / slices) * i
      const sh = H / slices
      const off2 = (Math.random() - 0.5) * (12 + glitchAmt * 3 + bass * 30)
      if (Math.abs(off2) > 1) {
        ctx.drawImage(this.el, 0, sy, W, sh, off2, sy, W, sh)
      }
    }
    ctx.restore()
  }

  // Adatta la dimensione del font perché TUTTO il testo entri nella larghezza
  // disponibile (senza tagliare le lettere ai bordi). Ritorna la size in px.
  this.fitBigTextSize = (ctx, text, maxW, wantedSize, font, weight = 'bold') => {
    let size = Math.max(10, Math.floor(wantedSize))
    ctx.font = `${weight} ${size}px "${font}"`
    const w = ctx.measureText(text).width
    if (w > maxW && w > 0) {
      size = Math.max(10, Math.floor(size * (maxW / w)))
      ctx.font = `${weight} ${size}px "${font}"`
    }
    return size
  }

  // Durata leggibile del big text: almeno 3s di lettura (≈300ms/carattere),
  // con un minimo generoso così il testo resta a schermo abbastanza a lungo.
  this.bigTextDuration = (text, factor = 1) => {
    const len = (text || '').length
    const reading = Math.max(3000, len * 300) // 3s minimo, ~300ms per carattere
    return Math.round(clamp(reading * factor, 6000, 30000))
  }

  // Moto del big text (scelto a caso per ogni scritta):
  //  - 'oneshot'  : compare TUTTO INTERO e resta fermo (si legge subito)
  //  - 'run-x'    : corre attraverso lo schermo in orizzontale (destra o sinistra)
  //  - 'run-y'    : entra da SOPRA o da SOTTO e attraversa in verticale
  //  - 'run-diag' : attraversa in diagonale (combinazione x+y casuale)
  //  - 'hybrid'   : prima tutto intero e fermo, poi corre via → effetto ibrido
  this.pickBigTextMotion = () => {
    const r = Math.random()
    let motion
    if (r < 0.30) motion = 'oneshot'
    else if (r < 0.56) motion = 'run-x'
    else if (r < 0.74) motion = 'run-y'
    else if (r < 0.88) motion = 'run-diag'
    else motion = 'hybrid'
    return {
      motion: motion,
      dir: Math.random() < 0.5 ? 1 : -1,       // verso orizzontale
      dirY: Math.random() < 0.5 ? 1 : -1,      // verso verticale (sopra/sotto)
      staticFrac: 0.34 + Math.random() * 0.26, // 'hybrid': quota di vita da fermo
      bandPct: 0.22 + Math.random() * 0.56     // fascia verticale per il moto orizzontale
    }
  }

  // In questo istante la scritta è "intera e ferma"? (la disegna drawChromaText)
  this.bigTextIsStatic = (t, age) => {
    if (t.motion === 'oneshot') return true
    if (t.motion === 'hybrid') return age < (t.ttl || 8000) * (t.staticFrac || 0.4)
    return false
  }

  this.drawChromaText = (ctx, W, H) => {
    if (!this.bigTexts.length && !this.bigTextMode) return
    const now = performance.now()
    // Font dei BIG TEXT: dafont distintivi (NON tocca il font dell'interfaccia input_mono_medium)
    const fonts = this.bigTextFonts
    for (let i = this.bigTexts.length - 1; i >= 0; i--) {
      const t = this.bigTexts[i]
      const age = now - t.born
      if (age > (t.ttl || 8000)) { this.bigTexts.splice(i, 1); continue }
      // Qui SOLO le scritte intere e ferme ('oneshot' e la fase statica di 'hybrid'):
      // le scritte che corrono le disegna drawBigTexts dentro il feed (sotto gli shader).
      if (!this.bigTextIsStatic(t, age)) continue
      // Velocity → dimensione (sizePct), con leggera oscillazione
      const wanted = Math.floor(H * (t.sizePct || 0.5) + Math.sin(age * 0.002 + i) * 14)
      // Font per-scritta (rotante ad ogni nuova nota MIDI)
      const font = fonts[(this.fontBaseForTag() + (t.fontIdx !== undefined ? t.fontIdx : Math.floor(t.seed * fonts.length))) % fonts.length]
      ctx.save()
      // AUTO-FIT: la scritta deve entrare TUTTA nella larghezza (margine 4%)
      // così è leggibile per intero invece di essere tagliata ai bordi.
      const maxW = W * 0.92
      const size = this.fitBigTextSize(ctx, t.text, maxW, wanted, font)
      ctx.font = `bold ${size}px "${font}"`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // Wobble ridotto in proporzione: un testo largo non deve uscire dallo schermo
      const slack = Math.max(0, (W - ctx.measureText(t.text).width) / 2)
      const wobble = Math.min(50, slack * 0.5)
      const x = W / 2 + Math.sin(age * 0.001 + i * 2) * wobble
      const y = H / 2 + Math.cos(age * 0.0015 + i * 1.5) * 30
      const alpha = 0.5 + 0.4 * (1 - age / (t.ttl || 8000))
      ctx.globalAlpha = alpha
      ctx.strokeStyle = t.color || '#ff10f0'
      ctx.lineWidth = 6
      ctx.shadowColor = t.color || 'rgba(255,16,240,0.6)'
      ctx.shadowBlur = 24
      ctx.strokeText(t.text, x, y)
      ctx.globalAlpha = alpha * 0.2
      ctx.fillStyle = '#ffffff'
      ctx.shadowBlur = 0
      ctx.fillText(t.text, x, y)
      ctx.restore()
    }
    if (this.bigTextMode) {
      const size = Math.floor(H * 0.06)
      ctx.save()
      ctx.font = `bold ${size}px Impact`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.globalAlpha = 0.8
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 10
      ctx.fillStyle = '#4ade80'
      ctx.fillText(`> ${this.bigTextBuffer}${now % 500 < 250 ? '_' : ''}`, 20, H - 20)
      ctx.restore()
    }
  }

  // --- TUTTI GLI ALTRI METODI (drawBigTexts, drawInterface, drawMonitor, drawStatus, drawOverlay, drawGuide, drawSprite, write, resize, crop, docs, ecc.) SONO IDENTICI ALL'ORIGINALE ---
  // Per brevità non li riscrivo ma sono esattamente come nel tuo client.js originale.
  // Assicurati di copiarli dal tuo file originale.

  this.drawBigTexts = (ctx,W,gridH) => {
    if(!this.bigTexts.length&&!this.bigTextMode){return}
    const now=performance.now()
    const cols=['#f5efe6','#ef8f7d','#2e9cc3','#c81e4e','#ff4fd8']
    for(let i=this.bigTexts.length-1;i>=0;i--){
      const t=this.bigTexts[i]; const age=now-t.born
      // TTL dal bigText (impostato da MIDI) o default
      const ttl = t.ttl || 8000
      if(age>ttl){this.bigTexts.splice(i,1);continue}
      // Le scritte INTERE e ferme le disegna drawChromaText (sopra gli shader).
      // Qui passano solo quelle che CORRONO attraverso lo schermo.
      if(this.bigTextIsStatic(t, age)) continue

      // Flickering: velocity controlla intensità (0=fisso, 1=max)
      const flick = t.flicker || 0
      const flickOn = flick <= 0 || Math.sin(age * (0.01 + flick * 0.09)) > (1 - flick) ? true : false

      // Font BIG TEXT (dafont distintivi, rotante per scritta) — il prompt sotto resta input_mono_medium
      const btFonts = this.bigTextFonts
      const btFont = btFonts[(this.fontBaseForTag() + (t.fontIdx !== undefined ? t.fontIdx : Math.floor(t.seed * btFonts.length))) % btFonts.length]
      // AUTO-FIT: una copia intera del testo entra nella larghezza, così mentre
      // attraversa lo schermo si legge tutto.
      const size = this.fitBigTextSize(ctx, t.text, W * 0.92, Math.floor(gridH * 0.45), btFont)
      ctx.save()
      ctx.font=`bold ${size}px "${btFont}"`; ctx.textBaseline='middle'; ctx.textAlign='left'
      const tw=Math.max(10,ctx.measureText(t.text).width)

      // Progresso della corsa (0 = fuori schermo in ingresso, 1 = fuori schermo in uscita).
      // Per 'hybrid' la corsa parte dopo la fase ferma iniziale.
      const runStart = (t.motion === 'hybrid') ? ttl * (t.staticFrac || 0.4) : 0
      const runDur = Math.max(1200, ttl - runStart)
      const prog = clamp((age - runStart) / runDur, 0, 1)
      const dir = t.dir || 1
      const m = t.motion || 'run-x'

      let x, y
      if (m === 'run-y') {
        // Entra da SOPRA o da SOTTO e attraversa in verticale (colonna centrata)
        x = W / 2 - tw / 2
        const y0 = dir > 0 ? -size : gridH + size
        const y1 = dir > 0 ? gridH + size : -size
        y = y0 + (y1 - y0) * prog
      } else if (m === 'run-diag') {
        // Diagonale: x e y indipendenti (4 direzioni possibili)
        const x0 = dir > 0 ? -tw : W
        const x1 = dir > 0 ? W : -tw
        x = x0 + (x1 - x0) * prog
        const dy = t.dirY || 1
        const y0 = dy > 0 ? -size : gridH + size
        const y1 = dy > 0 ? gridH + size : -size
        y = y0 + (y1 - y0) * prog
      } else {
        // 'run-x' (default): attraversa in orizzontale, destra→sinistra o viceversa
        const x0 = dir > 0 ? -tw : W
        const x1 = dir > 0 ? W : -tw
        x = x0 + (x1 - x0) * prog
        y = gridH * clamp(t.bandPct || 0.5, 0.12, 0.88)
      }

      const phase=Math.floor(age/160)%4
      ctx.globalCompositeOperation='screen'
      if(!flickOn){
        ctx.globalAlpha=0
      } else if(phase===2){ctx.globalAlpha=0.12}else if(phase===3){ctx.globalAlpha=0.4}else{ctx.globalAlpha=0.65}

      const colorIndex = (Math.floor(t.seed*10)+phase)%cols.length
      ctx.fillStyle=t.color || cols[colorIndex]

      if(flickOn){ctx.fillText(t.text,x,y)}
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'
      ctx.restore()
    }
    if(this.bigTextMode){
      const size=Math.floor(gridH*0.08)
      ctx.font=`bold ${size}px input_mono_medium`; ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillStyle='#f5efe6'
      ctx.fillText(`> ${this.bigTextBuffer}${now%500<250?'_':''}`,20,gridH-size)
    }
    ctx.font=`${this.tile.hs*0.75}px input_mono_medium`; ctx.textBaseline='bottom'; ctx.textAlign='center'
  }

  this.whenOpen = (file,text) => {
    const lines=text.trim().split(/\r?\n/); const w=lines[0].length; const h=lines.length; const s=lines.join('\n').trim()
    this.orca.load(w,h,s); this.history.reset(); this.history.record(this.orca.s); this.resize()
  }
  this.setGrid = (w,h) => { this.grid.w=w; this.grid.h=h; this.update() }
  this.toggleRetina = () => { this.scale=this.scale===1?window.devicePixelRatio:1; this.resize(true) }
  this.toggleGuide = (force=null) => { const d=force!==null?force:this.guide!==true; if(d===this.guide){return} this.guide=d; this.update() }
  // Alt+X: primo = TOTAL GLITCH (distrugge tutto il feed compresa patch e terminale)
  // secondo = PANIC BUTTON (scritta 4s, poi glitcha e ripristina tutto)
  this.toggleTotalGlitch = (force=null) => {
    // Anti-doppio-trigger: l'accelerator del menu Electron (fxTotalGlitch) e il
    // keydown del renderer possono scattare ENTRAMBI su Alt+Shift+X → il glitch
    // entrerebbe e uscirebbe subito. Ignoriamo le chiamate entro 250ms.
    const now = performance.now()
    if (now - (this._lastGlitchToggle || 0) < 250) { return }
    this._lastGlitchToggle = now
    if (!this.totalGlitch) {
      // ENTRA nel total glitch: tutto (feed + terminale + testo) viene distrutto dagli shader
      this.totalGlitch = true
      // PANIC: scritta multilingua a rotazione sopra il glitch (fino a Esc/Alt+Shift+X)
      this.panicMode = true
      this.panicStart = now
      this.panicWord = this.panicWords[Math.floor(Math.random() * this.panicWords.length)]
      this.fxManager.setChain([
        {name:'brokentv', seed:Math.random(), drive:999},
        {name:'glitch', seed:Math.random(), drive:999},
        {name:'datamosh', seed:Math.random(), drive:999},
        {name:'fracture', seed:Math.random(), drive:999}
      ])
      this.guide = false
      // Salva il BPM corrente e avvia il randomizzatore veloce 0-999.
      // glitching=true: il BPM random NON viene propagato ad Ableton Link
      // (altrimenti feedback loop e clock fuori controllo all'uscita).
      if (!this._savedGlitchBpm) { this._savedGlitchBpm = this.clock.speed.value || 120 }
      this.clock.glitching = true
      console.log('[FX] TOTAL GLITCH attivo (Alt+Shift+X o Esc per uscire)')
    } else {
      // ESCE dal glitch: Alt+Shift+X di nuovo
      this._exitGlitch()
    }
  }

  // Esce dal glitch: ripristina BPM e spegne la chain shader.
  this._exitGlitch = () => {
    this.totalGlitch = false
    this.panicMode = false
    this.fxManager.setChain([])
    this.clock.glitching = false
    if (this._savedGlitchBpm) {
      // Ora risincronizza anche Link col BPM ripristinato
      this.clock.setSpeed(this._savedGlitchBpm, this._savedGlitchBpm, true)
      this._savedGlitchBpm = null
    }
    this._progDirty = true
    console.log('[FX] TOTAL GLITCH disattivato')
  }
  this.modGrid = (x=0,y=0) => { this.setGrid(clamp(this.grid.w+x,4,16),clamp(this.grid.h+y,4,16)) }
  this.modZoom = (mod=0,reset=false) => {
    this.tile={w:reset?10:this.tile.w*(mod+1),h:reset?15:this.tile.h*(mod+1),ws:Math.floor(this.tile.w*this.scale),hs:Math.floor(this.tile.h*this.scale)}
    localStorage.setItem('tilew',this.tile.w); localStorage.setItem('tileh',this.tile.h); this.resize(true)
  }
  this.isCursor = (x,y) => x===this.cursor.x&&y===this.cursor.y
  this.isMarker = (x,y) => x%this.grid.w===0&&y%this.grid.h===0
  this.isNear = (x,y) => x>(parseInt(this.cursor.x/this.grid.w)*this.grid.w)-1&&x<=((1+parseInt(this.cursor.x/this.grid.w))*this.grid.w)&&y>(parseInt(this.cursor.y/this.grid.h)*this.grid.h)-1&&y<=((1+parseInt(this.cursor.y/this.grid.h))*this.grid.h)
  this.isLocals = (x,y) => this.isNear(x,y)===true&&(x%(this.grid.w/4)===0&&y%(this.grid.h/4)===0)===true
  this.isInvisible = (x,y) => this.orca.glyphAt(x,y)==='.'&&!this.isMarker(x,y)&&!this.cursor.selected(x,y)&&!this.isLocals(x,y)&&!this.ports[this.orca.indexAt(x,y)]&&!this.orca.lockAt(x,y)
  this.findPorts = () => {
    const a=new Array((this.orca.w*this.orca.h)-1)
    for(const op of this.orca.runtime){ if(this.orca.lockAt(op.x,op.y)){continue} const ports=op.getPorts(); for(const p of ports){a[this.orca.indexAt(p[0],p[1])]=p} }
    return a
  }
  this.makeTheme = (type) => {
    if(type===0){return{bg:this.theme.active.b_med,fg:this.theme.active.f_low}}
    if(type===1){return{fg:this.theme.active.b_med}}
    if(type===2){return{fg:this.theme.active.b_high}}
    if(type===3){return{bg:this.theme.active.b_high,fg:this.theme.active.f_low}}
    if(type===4){return{bg:this.theme.active.b_inv,fg:this.theme.active.f_inv}}
    if(type===5){return{fg:this.theme.active.f_med}}
    if(type===6){return{fg:this.theme.active.b_inv}}
    if(type===7){return{}}
    if(type===8){return{bg:this.theme.active.b_low,fg:this.theme.active.f_high}}
    if(type===9){return{bg:this.theme.active.b_inv,fg:this.theme.active.background}}
    if(type===10){return{bg:this.theme.active.background,fg:this.theme.active.f_high}}
    if(type===11){return{fg:this.theme.active.b_inv}}
    return{fg:this.theme.active.f_low}
  }
  this.clear = () => { this.context.clearRect(0,0,this.el.width,this.el.height) }
  this.drawProgram = () => {
    const selection=this.cursor.read()
    for(let y=0;y<this.orca.h;y++){for(let x=0;x<this.orca.w;x++){
      if(this.isInvisible(x,y)){continue}
      const g=this.orca.glyphAt(x,y)
      const glyph=g!=='.'?g:this.isCursor(x,y)?(this.clock.isPaused?'~':'@'):this.isMarker(x,y)?'+':g
      this.drawSprite(x,y,glyph,this.makeStyle(x,y,glyph,selection))
    }}
  }
  this.makeStyle = (x,y,glyph,selection) => {
    if(this.cursor.selected(x,y)){return 4}
    const isLocked=this.orca.lockAt(x,y)
    if(selection===glyph&&isLocked===false&&selection!=='.'){return 6}
    if(glyph==='*'&&isLocked===false){return 2}
    const port=this.ports[this.orca.indexAt(x,y)]
    if(port){return port[2]}
    if(isLocked===true){return 5}
    return 20
  }
  this.makeTerminalTheme = (type) => {
  if (type === 1) { return { fg: '#b39dff' } }
  if (type === 2) { return { fg: '#4ade80' } }
  if (type === 3) { return { fg: '#ffb545' } }
  if (type === 4) { return { bg: '#b39dff', fg: '#000000' } }
  if (type === 5) { return { fg: '#4ade80' } }
  if (type === 6) { return { fg: '#ffb545' } }
  if (type === 7) { return {} }
  if (type === 8) { return { fg: '#b39dff' } }
  if (type === 9) { return { bg: '#ffb545', fg: '#000000' } }
  if (type === 10) { return { bg: '#000000', fg: '#4ade80' } }
  if (type === 11) { return { fg: '#ffb545' } }
  if (type === 20) { return { fg: '#4ade80' } }
  // --- NUOVO COLORE ROSSO per PLAY ---
  if (type === 30) { return { fg: '#ff4d4d' } }
  return { fg: '#b39dff' }
}
  this.drawTermSprite = (x,y,g,type) => {
    const theme=this.makeTerminalTheme(type)
    if(theme.bg){this.context.fillStyle=theme.bg;this.context.fillRect(x*this.tile.ws,y*this.tile.hs,this.tile.ws,this.tile.hs)}
    if(theme.fg){this.context.fillStyle=theme.fg;this.context.fillText(g,(x+0.5)*this.tile.ws,(y+1)*this.tile.hs)}
  }
  this.writeTerm = (text,offsetX,offsetY,limit=50,type=2) => {
    for(let x=0;x<text.length&&x<limit;x++){this.drawTermSprite(offsetX+x,offsetY,text.substr(x,1),type)}
  }
  this.teleString = () => {
    let cpu=0,gpu=0,temp=null
    if(this.si){cpu=this.telemetry.cpu;temp=this.telemetry.temp}
    if(this.si&&this.telemetry.gpu>0){gpu=this.telemetry.gpu}
    else if(this.gpuLoad!=null){gpu=this.gpuLoad}
    if(temp==null||temp<=0){temp=40+cpu*45}
    return `C:${Math.round(cpu*100)} G:${Math.round(gpu*100)} ${Math.round(this.fps)}f ${Math.round(temp)}°`
  }
  // Segnala un caricamento in corso (rete, 3D, media). Mostrato a schermo per 10 s.
  this.setLoader = (msg) => { this._loaderMsg = msg || null; this._loaderAt = Date.now() }
  this.loadString = () => {
    const spin = ['|','/','-','\\'][Math.floor(this.orca.f / 3) % 4]
    if (this._loaderMsg && (Date.now() - (this._loaderAt || 0)) < 10000) { return spin + ' ' + this._loaderMsg }
    if (window.Net && Net.busy()) { return spin + ' net ' + Net.pending() }
    return null
  }
 this.drawInterface = () => {
  const ctx = this.context
  const tile = this.tile
  const termHeightPx = tile.hs * 2
  const termY = this.el.height - termHeightPx
  const termRow = Math.floor(termY / tile.hs)
  const termRow2 = termRow + 1

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, termY, this.el.width, termHeightPx)
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.font = `${tile.hs * 0.75}px input_mono_medium`

  this.writeTerm(`${this.cursor.inspect()}`, this.grid.w * 0, termRow, this.grid.w - 1, 2)
  this.writeTerm(`${this.cursor.x},${this.cursor.y}${this.cursor.ins ? '+' : ''}`, this.grid.w * 1, termRow, this.grid.w, this.cursor.ins ? 1 : 2)
  this.writeTerm(`${this.cursor.w}:${this.cursor.h}`, this.grid.w * 2, termRow, this.grid.w, 2)
  // Frame count sulla riga sopra
  this.writeTerm(`${this.orca.f}f${this.clock.isPaused ? '~' : ''}`, this.grid.w * 3, termRow, this.grid.w, 1)

  this.writeTerm(`${this.io.inspect(this.grid.w)}`, this.grid.w * 4, termRow, this.grid.w - 1, 2)
  this.writeTerm(this.orca.f < 250 ? `< ${this.io.midi.toInputString()}` : '', this.grid.w * 5, termRow, this.grid.w * 4, 2)

  const tele = this.teleString()
  const tX = this.orca.w - tele.length - 1
  if (tX > this.grid.w * 5) { this.writeTerm(tele, tX, termRow, tele.length + 1, 1) }

  // Stato caricamenti (rete / 3D) a sinistra della telemetria, solo quando attivo.
  const lmsg = this.loadString()
  if (lmsg) {
    const lX = Math.max(this.grid.w * 5, tX - lmsg.length - 2)
    if (lX > this.grid.w * 5) { this.writeTerm(lmsg, lX, termRow, lmsg.length + 1, 3) }
  }

  // Seconda riga (termRow2) — mode-specific content first
  if (this.modelSearchMode) {
    this.writeTerm(`[3D SEARCH] ${this.modelSearchBuffer}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 6, 6)
  } else if (this.tagMode) {
    this.writeTerm(`[ADD TAG] ${this.tagBuffer}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 6, 6)
  } else if (this.bigTextMode) {
    this.writeTerm(`[BIG TEXT] ${this.bigTextBuffer}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 6, 6)
  } else if (this.fxTextMode) {
    this.writeTerm(`[FX TEXT] ${this.fxTextBuffer}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 6, 6)
  } else if (this.commander.query.startsWith('fx:')) {
    this.writeTerm(`${this.commander.query}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 6, 6)
  } else if (this.commander.isActive === true) {
    this.writeTerm(`${this.commander.query}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 4, 6)
  } else {
    this.writeTerm(this.orca.f < 25 ? `ver${this.version}` : `${Object.keys(this.source.cache).length} mods`, this.grid.w * 0, termRow2, this.grid.w, 1)
    this.writeTerm(`${this.orca.w}x${this.orca.h}`, this.grid.w * 1, termRow2, this.grid.w, 1)
    this.writeTerm(`${this.grid.w}/${this.grid.h}${this.tile.w !== 10 ? ' ' + (this.tile.w / 10).toFixed(1) : ''}`, this.grid.w * 2, termRow2, this.grid.w, 1)
    this.writeTerm(`${display(Object.keys(this.orca.variables).join(''), this.orca.f, this.grid.w - 1)}`, this.grid.w * 4, termRow2, this.grid.w - 1, 1)
    this.writeTerm(this.orca.f < 250 ? `> ${this.io.midi.toOutputString()}` : '', this.grid.w * 5, termRow2, this.grid.w * 4, 1)
  }

  // BPM + Peers DOPO il block mode-specific (posizione fissa, non sovrascritto)
  // Indicatore play esplicito: '>' rosso lampeggiante col beat in play, '~' dim in pausa
  const playing = !this.clock.isPaused
  const playChar = playing ? (this.orca.f % 4 < 2 ? '>' : '+') : '~'
  const clockColor2 = playing ? 30 : 1
  const clockStr2 = playChar + this.clock.toString().main
  // BPM ROSSO FISSO in play (stiamo mandando il sync), mai sovrascritto da puppet/midi clock
  this.writeTerm(clockStr2, this.grid.w * 3, termRow2, this.grid.w, clockColor2)
  // Peers a posizione FISSA
  const peersStr = this.clock.peers > 0 ? ` P${this.clock.peers}` : '  '
  this.writeTerm(peersStr, this.grid.w * 4 - 3, termRow2, 3, 10)

  // Nome FX/PATCH attivo in basso a destra, ARANCIONE (type 6 = #ffb545)
  let fxLabel = null
  if (this.fxManager.chain && this.fxManager.chain.length) {
    fxLabel = 'fx:' + this.fxManager.chain.map(f => f.name).join('+')
  }
  if (fxLabel) {
    const mods = Object.keys(this.source.cache)
    if (mods.length) { fxLabel += ' m:' + mods.length }
    const startX = this.orca.w - fxLabel.length - 1
    if (startX > this.grid.w * 5) { this.writeTerm(fxLabel, startX, termRow2, fxLabel.length + 1, 6) }
  }
}
  this.drawMonitor = () => {
    const ctx=this.context; const a=this.audioReactor
    if(!a||!a.analyser){return}
    const termH=this.tile.hs*2; const termY=this.el.height-termH
    const MW=189,MH=132; const mx=0; const my=termY-MH-10
    if(my<0){return}
    const bins=a.analyser.frequencyBinCount
    if(!this.freqArr||this.freqArr.length!==bins){this.freqArr=new Uint8Array(bins);this.timeArr=new Uint8Array(bins);this.specPeak=new Float32Array(bins)}
    a.analyser.getByteFrequencyData(this.freqArr); a.analyser.getByteTimeDomainData(this.timeArr)
    let sum=0; for(let i=0;i<this.timeArr.length;i++){const v=(this.timeArr[i]-128)/128;sum+=v*v}
    const rms=Math.sqrt(sum/this.timeArr.length)
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(mx,my,MW,MH)
    ctx.fillStyle='#4ade80'; ctx.fillRect(mx,my,MW,1); ctx.fillStyle='#b39dff'; ctx.fillRect(mx,my+1,MW,1)
    const N=64; const top=my+8; const bh=MH-8-30
    ctx.strokeStyle='#4ade80'; ctx.lineWidth=1; ctx.beginPath()
    for(let i=0;i<N;i++){
      const idx=Math.floor(Math.pow(i/N,1.6)*(bins*0.7)); const val=this.freqArr[idx]/255
      this.specPeak[i]=Math.max(val,this.specPeak[i]-0.02)
      const x=mx+4+(i/N)*(MW-8); const y=top+bh-val*bh
      if(i===0){ctx.moveTo(x,y)}else{ctx.lineTo(x,y)}
    }
    ctx.stroke()
    ctx.strokeStyle='rgba(185,103,255,0.6)'; ctx.beginPath()
    for(let i=0;i<N;i++){const x=mx+4+(i/N)*(MW-8); const y=top+bh-this.specPeak[i]*bh; if(i===0){ctx.moveTo(x,y)}else{ctx.lineTo(x,y)}}
    ctx.stroke()
    const ry=my+MH-16
    ctx.font=`${this.tile.hs*0.75}px input_mono_medium`; ctx.textAlign='left'; ctx.textBaseline='bottom'
    ctx.fillStyle='#4ade80'; ctx.fillText('RMS',mx+6,ry+12)
    ctx.fillStyle='#222'; ctx.fillRect(mx+36,ry,MW-36-44,10)
    ctx.fillStyle='#ffb545'; ctx.fillRect(mx+36,ry,Math.min(1,rms*2.5)*(MW-36-44),10)
    ctx.textAlign='right'; ctx.fillText(rms.toFixed(2),mx+MW-6,ry+12)
    const P=this.params; const pk=[P.p0,P.p1,P.p2,P.p3]
    for(let i=0;i<4;i++){
      const bx=mx+6+i*24
      ctx.strokeStyle=i%2?'#b39dff':'#4ade80'; ctx.strokeRect(bx+0.5,my+4.5,18,4)
      ctx.fillStyle=i%2?'#b39dff':'#4ade80'; ctx.fillRect(bx+1,my+5,16*pk[i],3)
    }
    ctx.textAlign='center'
  }
  this.drawStatus = () => {
    const ctx=this.context
    let cpu=0,temp=null,net=null
    if(this.si){cpu=this.telemetry.cpu;temp=this.telemetry.temp;net=this.telemetry.net}
    let gpu=0, gpuKnown=false
    if(this.si&&this.telemetry.gpu>0){gpu=this.telemetry.gpu;gpuKnown=true}
    else if(this.gpuLoad!=null){gpu=this.gpuLoad;gpuKnown=true}
    if(temp==null||temp<=0){temp=40+cpu*45}
    const a=this.audioReactor; const rms=a?a.vol:0; const db=20*Math.log10(rms+1e-6)
    if(net==null){try{if(navigator.connection&&navigator.connection.downlink){net=navigator.connection.downlink}}catch(e){}}
    const termH=this.tile.hs*2; const termY=this.el.height-termH
    const MH=132; const monY=termY-MH-10
    const MW=189
    const rows=[
      ['CPU',cpu,'#ffb545',Math.round(cpu*100)+'%'],
      ['GPU',gpuKnown?gpu:0,'#b39dff',gpuKnown?Math.round(gpu*100)+'%':'--'],
      ['FPS',Math.min(1,this.fps/60),'#4ade80',String(Math.round(this.fps))],
      ['dB',Math.min(1,(db+60)/60),'#ffb545',String(Math.round(db))],
      ['NET',net?Math.min(1,net/100):0,'#4ade80',net?net.toFixed(0)+'M':'--'],
      ['T',Math.min(1,temp/100),'#b39dff',Math.round(temp)+'°']
    ]
    const rh=11; const SH=rows.length*rh+6; const sy=monY-SH-6
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,sy,MW,SH)
    ctx.font=`${this.tile.hs*0.6}px input_mono_medium`; ctx.textAlign='left'; ctx.textBaseline='middle'
    for(let i=0;i<rows.length;i++){
      const r=rows[i]; const y=sy+4+i*rh
      ctx.fillStyle=r[2]; ctx.fillText(r[0],4,y)
      ctx.fillStyle='#222'; ctx.fillRect(30,y-2,100,4)
      ctx.fillStyle=r[2]; ctx.fillRect(30,y-2,100*Math.max(0,Math.min(1,r[1])),4)
      ctx.textAlign='right'; ctx.fillText(r[3],MW-4,y); ctx.textAlign='left'
    }
  }
  this.drawOverlay = () => {
    const ctx=this.context; const W=this.el.width; const H=this.el.height
    const P=this.params; const bpm=Math.round(this.clock.speed.value||120)
    const B=this.background
    const targets=[]
    if(B){
      for(let i=0;i<B.layers.length&&targets.length<2;i++){const L=B.layers[i];targets.push({x:L.x,y:L.y,w:L.w,h:L.h,t:`id:${i} lay`})}
      if(B.swarm){for(let i=0;i<B.swarm.boids.length&&targets.length<4;i+=6){const b=B.swarm.boids[i];targets.push({x:b.x-40,y:b.y-30,w:80,h:60,t:`id:${targets.length} gif`})}}
    }
    if(targets.length<4){targets.push({x:W*0.5+P.p4*80-50,y:H*0.4+P.p0*60-40,w:100,h:80,t:`id:x bpm:${bpm}`})}
    ctx.lineWidth=1
    for(let i=0;i<targets.length;i++){
      const an=targets[i]
      const col=i%3===0?'#ffb545':(i%3===1?'#4ade80':'#b39dff')
      ctx.strokeStyle=col
      ctx.strokeRect(an.x+0.5,an.y+0.5,an.w,an.h)
      const c=8
      ctx.beginPath()
      ctx.moveTo(an.x,an.y+c);ctx.lineTo(an.x,an.y);ctx.lineTo(an.x+c,an.y)
      ctx.moveTo(an.x+an.w-c,an.y);ctx.lineTo(an.x+an.w,an.y);ctx.lineTo(an.x+an.w,an.y+c)
      ctx.moveTo(an.x+an.w,an.y+an.h-c);ctx.lineTo(an.x+an.w,an.y+an.h);ctx.lineTo(an.x+an.w-c,an.y+an.h)
      ctx.moveTo(an.x+c,an.y+an.h);ctx.lineTo(an.x,an.y+an.h);ctx.lineTo(an.x,an.y+an.h-c)
      ctx.stroke()
      ctx.font=`${this.tile.hs*0.7}px input_mono_medium`; ctx.textAlign='left'; ctx.textBaseline='bottom'
      ctx.fillStyle=col; ctx.fillText(an.t,an.x+2,an.y-2)
    }
  }
  this.drawGuide = () => {
    if(this.guide!==true){return}
    const operators=Object.keys(this.library).filter(v=>isNaN(v))
    for(const id in operators){
      const key=operators[id]; const oper=new this.library[key](); const text=oper.info
      const frame=this.orca.h-4
      const x=(Math.floor(parseInt(id)/frame)*32)+2; const y=(parseInt(id)%frame)+2
      this.write(key,x,y,99,3); this.write(text,x+2,y,99,10)
    }
    const cmds=[
      ['ALT+V','fx: nome.rand.drive'],
      ['','  es. fx:datamosh.400.400'],
      ['','  rand=3 param+7 filtri'],
      ['','  drive=audio capture'],
      ['ALT+T','brokentv.400.400'],
      ['ALT+D','datamosh.400.400'],
      ['ALT+J','glitch.400.400'],
      ['ALT+K','ameba.400.400'],
      ['ALT+R','fractal.400.400'],
      ['ALT+S','displace.400.400'],
      ['ALT+N','chromawarp.400.400'],
      ['ALT+Q','fracture.400.400'],
      ['ALT+L','glow.400.400'],
      ['ALT+F','freezeloop.400.400'],
      ['ALT+E','bubble.400.400'],
      ['ALT+Z','webcam'],
      ['ALT+H','maschera viso emoji'],
      ['ALT+P','modello 3d on/off'],
      ['ALT+M','aggiungi un altro modello'],
      ['ALT+SH+P','cerca modello (termine)'],
      ['ALT+C','glossy / chrome (riflessi)'],
      ['ALT+SH+C','svuota i modelli'],
      ['ALT+SH+X','TOTAL GLITCH + PANICO'],
      ['','  (uscita: ESC o ALT+SH+X)'],
      ['ALT+G','stormo gif boids'],
      ['ALT+B','background random'],
      ['ALT+W','big text overlay'],
      ['CMD+W','aggiungi tag e cerca'],
      ['CMD+SH+T','next tag'],
      ['MIDI IN','ch0-1 bg ch2-3 gif ch4-5 txt'],
      ['LINK','bpm rosso=play P<n> peers'],
      ['ESC','reset tutto']
    ]
    const bx=this.orca.w-46
    for(let i=0;i<cmds.length;i++){const y=2+i; if(y>this.orca.h-3){break} this.write(cmds[i][0],bx,y,10,3); this.write(cmds[i][1],bx+9,y,36,10)}
  }
  this.drawSprite = (x,y,g,type) => {
    const theme=this.makeTheme(type)
    if(theme.bg){this.context.fillStyle=theme.bg;this.context.fillRect(x*this.tile.ws,y*this.tile.hs,this.tile.ws,this.tile.hs)}
    if(theme.fg){this.context.fillStyle=theme.fg;this.context.fillText(g,(x+0.5)*this.tile.ws,(y+1)*this.tile.hs)}
  }
  this.write = (text,offsetX,offsetY,limit=50,type=2) => {
    for(let x=0;x<text.length&&x<limit;x++){this.drawSprite(offsetX+x,offsetY,text.substr(x,1),type)}
  }
  this.resize = () => {
    const W=window.innerWidth; const H=window.innerHeight
    const tiles={w:Math.ceil(W/this.tile.w),h:Math.ceil(H/this.tile.h)}
    const bounds=this.orca.bounds()
    if(tiles.w<bounds.w+1){tiles.w=bounds.w+1}
    if(tiles.h<bounds.h+1){tiles.h=bounds.h+1}
    const maxW=400,maxH=200
    if(tiles.w>maxW){tiles.w=maxW}
    if(tiles.h>maxH){tiles.h=maxH}
    this.crop(tiles.w,tiles.h)
    if(this.cursor.x>=tiles.w){this.cursor.moveTo(tiles.w-1,this.cursor.y)}
    if(this.cursor.y>=tiles.h){this.cursor.moveTo(this.cursor.x,tiles.h-1)}
    if(W===this.el.width&&H===this.el.height&&W===this.sceneEl.width&&W===this.progEl.width&&W===this.uiEl.width&&(!this.cursorEl||W===this.cursorEl.width)){return}
    this.el.width=W; this.el.height=H
    this.el.style.width=`${W}px`; this.el.style.height=`${H}px`
    this.sceneEl.width=W; this.sceneEl.height=H
    this.progEl.width=W; this.progEl.height=H
    this.uiEl.width=W; this.uiEl.height=H
    if(this.cursorEl){this.cursorEl.width=W; this.cursorEl.height=H}
    this._progDirty = true
    this._lastUi = 0   // forza un ridisegno UI alla nuova dimensione
    this.context.textBaseline='bottom'; this.context.textAlign='center'; this.context.font=`${this.tile.hs*0.75}px input_mono_medium`; this.context.imageSmoothingEnabled=false
    this.sceneCtx.textBaseline='bottom'; this.sceneCtx.textAlign='center'; this.sceneCtx.font=`${this.tile.hs*0.75}px input_mono_medium`; this.sceneCtx.imageSmoothingEnabled=false
    this.progCtx.textBaseline='bottom'; this.progCtx.textAlign='center'; this.progCtx.font=`${this.tile.hs*0.75}px input_mono_medium`; this.progCtx.imageSmoothingEnabled=false
    this.uiCtx.textBaseline='bottom'; this.uiCtx.textAlign='center'; this.uiCtx.font=`${this.tile.hs*0.75}px input_mono_medium`; this.uiCtx.imageSmoothingEnabled=false
    this.update()
  }
  this.crop = (w,h) => {
    let block=`${this.orca}`
    if(h>this.orca.h){block=`${block}${`\n${'.'.repeat(this.orca.w)}`.repeat((h-this.orca.h))}`}
    else if(h<this.orca.h){block=`${block}`.split(/\r?\n/).slice(0,(h-this.orca.h)).join('\n').trim()}
    if(w>this.orca.w){block=`${block}`.split(/\r?\n/).map(v=>v+('.').repeat((w-this.orca.w))).join('\n').trim()}
    else if(w<this.orca.w){block=`${block}`.split(/\r?\n/).map(v=>v.substr(0,v.length+(w-this.orca.w))).join('\n').trim()}
    this.history.reset(); this.orca.load(w,h,block,this.orca.f)
  }
  this.docs = () => {
    let html=''
    const operators=Object.keys(library).filter(v=>isNaN(v))
    for(const id in operators){
      const oper=new this.library[operators[id]]()
      const ports=oper.ports.input?Object.keys(oper.ports.input).reduce((a,k)=>a+' '+k,''):''
      html+=`- \`${oper.glyph.toUpperCase()}\` ${oper.name}${ports!==''?'('+ports.trim()+')':''}: ${oper.info}.\n`
    }
    return html
  }
  window.addEventListener('dragover',(e)=>{e.stopPropagation();e.preventDefault();e.dataTransfer.dropEffect='copy'})
  window.addEventListener('drop',(e)=>{
    e.preventDefault(); e.stopPropagation()
    for(const file of e.dataTransfer.files){
      if(file.name.indexOf('.orca')<0){continue}
      this.toggleGuide(false); this.source.read(file,null,true)
      this.commander.start('inject:'+file.name.replace('.orca',''))
    }
  })
  window.onresize = (e) => { this.resize() }
  function display (str,f,max){return str.length<max?str:str.slice(f%str.length)+str.substr(0,f%str.length)}
  function clamp (v,min,max){return v<min?min:v>max?max:v}
}
// --- BIG TEXT CLASS ---
function BigText (client) {
  this.client = client
  this.midiNote = { note: 0, channel: 0 }
  this.midiCC = new Array(16)
  for (let i = 0; i < 16; i++) {
    this.midiCC[i] = new Array(128).fill(0)
  }
  
  // 4 colori fluo scelti randomicamente per ogni scritta
  this.colors = ['#ff10f0', '#b39dff', '#39ff14', '#00ffd0'] // rosa shock, purple, green fluo, turquoise fluo

  this.onMidiNote = function (channel, note, velocity) {
    // Ogni scritta è legata a un canale MIDI random. Una nota sul canale X
    // aggiorna la scritta con quel canale: cambia testo e dimensione.
    var tag = this.client.tags[(note + channel * 3) % this.client.tags.length];
    var words = tag.toUpperCase().split(' ');
    var txt = words[velocity % words.length] || tag.toUpperCase();
    var sizeFactor = velocity / 127;
    var sizePct = 0.3 + sizeFactor * 0.8;

    // Cerca una scritta esistente con questo canale
    let found = null
    for (let i = 0; i < this.client.bigTexts.length; i++) {
      if (this.client.bigTexts[i].midiChannel === channel) { found = i; break }
    }
    if (found !== null) {
      // Aggiorna la scritta esistente: nuovo testo + dimensione da velocity
      const t = this.client.bigTexts[found]
      t.text = txt.slice(0, 42)
      t.sizePct = sizePct
      t.born = performance.now()
      // Durata leggibile: velocity allunga ancora (fino a +50%)
      t.ttl = this.client.bigTextDuration(t.text, 1 + sizeFactor * 0.5)
      t.color = this.colors[Math.floor(Math.random() * this.colors.length)]
      // Nuovo moto a ogni aggiornamento: la scritta può cambiare direzione
      Object.assign(t, this.client.pickBigTextMotion())
      console.log('TEXT MIDI update ch' + channel + ':', { note: note, vel: velocity, txt: txt });
      return
    }
    // Nuova scritta su canale random diverso (o questo canale)
    this.client._bigTextFontIdx = ((this.client._bigTextFontIdx || 0) + 1)
    const color = this.colors[Math.floor(Math.random() * this.colors.length)];
    const newChannel = Math.floor(Math.random() * 16)
    while (this.client.bigTexts.length >= 4) { this.client.bigTexts.shift() }
    this.client.bigTexts.push(Object.assign({
      text: txt.slice(0, 42),
      mode: note % 3,
      born: performance.now(),
      // Durata leggibile: velocity allunga ancora (fino a +50%)
      ttl: this.client.bigTextDuration(txt.slice(0, 42), 1 + sizeFactor * 0.5),
      seed: Math.random(),
      sizePct: sizePct,
      fontIdx: this.client._bigTextFontIdx,
      color: color,
      midiChannel: newChannel
    }, this.client.pickBigTextMotion()));
    console.log('TEXT MIDI new ch' + newChannel + ':', { note: note, vel: velocity, txt: txt });
  }
  
  this.onMidiCC = function (channel, cc, value) {
    // CC disabilitati — solo note attivi
  }
}

// Hash deterministico semplice (per righe pixel del panic e altri effetti)
function hash2 (n, salt) {
  let x = (n | 0) + ((salt | 0) * 374761393)
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  x = x ^ (x >>> 16)
  return (x >>> 0) / 4294967296
}

// Global error listener for debugging
window.addEventListener('error', (e) => {
  console.error('[GLOBAL ERROR] Uncaught exception:', e.error);
  console.error('[GLOBAL ERROR] At:', e.filename, ':', e.lineno, ':', e.colno);
});


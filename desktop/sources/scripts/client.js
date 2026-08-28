'use strict'
/* global library, Acels, Source, History, Orca, IO, Cursor, Commander, Clock, Theme, AudioReactor, FxSituations, Background */

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
  this.fxManager = new FxSituations(this, this.audioReactor)
  this.background = new Background(this)

  this.scale = 1
  this.grid = { w: 8, h: 8 }
  this.tile = {
    w: +localStorage.getItem('tilew') || 10,
    h: +localStorage.getItem('tileh') || 15
  }
  this.guide = false

  this.el = document.createElement('canvas')
  this.context = this.el.getContext('2d')

  this.fxTextMode = false
  this.fxTextBuffer = ''
  this.bigTextMode = false
  this.bigTextBuffer = ''
  this.bigTexts = []

  this.install = (host) => {
    host.appendChild(this.el)
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
    this.el.style.position = 'fixed'
    this.el.style.top = '0'
    this.el.style.left = '0'
    this.theme.install(host)
    this.theme.default = { background: '#000000', f_high: '#ffffff', f_med: '#777777', f_low: '#444444', f_inv: '#000000', b_high: '#eeeeee', b_med: '#72dec2', b_low: '#444444', b_inv: '#ffb545' }

    this.audioReactor.start()

    this.acels.set('File', 'New', 'CmdOrCtrl+N', () => { this.reset() })
    this.acels.set('File', 'Open', 'CmdOrCtrl+O', () => { this.source.open('orca', this.whenOpen, true) })
    this.acels.set('File', 'Import Modules', 'CmdOrCtrl+L', () => { this.source.load('orca') })
    this.acels.set('File', 'Export', 'CmdOrCtrl+S', () => { this.source.write('orca', 'orca', `${this.orca}`, 'text/plain') })
    this.acels.set('File', 'Export Selection', 'CmdOrCtrl+Shift+S', () => { this.source.write('orca', 'orca', `${this.cursor.selection()}`, 'text/plain') })

    this.acels.set('Edit', 'Undo', 'CmdOrCtrl+Z', () => { this.history.undo() })
    this.acels.set('Edit', 'Redo', 'CmdOrCtrl+Shift+Z', () => { this.history.redo() })
    this.acels.add('Edit', 'cut')
    this.acels.add('Edit', 'copy')
    this.acels.add('Edit', 'paste')
    this.acels.set('Edit', 'Select All', 'CmdOrCtrl+A', () => { this.cursor.selectAll() })
    this.acels.set('Edit', 'Erase Selection', 'Backspace', () => { if (this.cursor.ins) { this.cursor.erase(); this.cursor.move(-1, 0) } else { this[this.commander.isActive ? 'commander' : 'cursor'].erase() } })
    this.acels.set('Edit', 'Uppercase', 'CmdOrCtrl+Shift+U', () => { this.cursor.toUpperCase() })
    this.acels.set('Edit', 'Lowercase', 'CmdOrCtrl+Shift+L', () => { this.cursor.toLowerCase() })
    this.acels.set('Edit', 'Drag North', 'Alt+ArrowUp', () => { this.cursor.drag(0, 1) })
    this.acels.set('Edit', 'Drag East', 'Alt+ArrowRight', () => { this.cursor.drag(1, 0) })
    this.acels.set('Edit', 'Drag South', 'Alt+ArrowDown', () => { this.cursor.drag(0, -1) })
    this.acels.set('Edit', 'Drag West', 'Alt+ArrowLeft', () => { this.cursor.drag(-1, 0) })
    this.acels.set('Edit', 'Drag North(Leap)', 'CmdOrCtrl+Alt+ArrowUp', () => { this.cursor.drag(0, this.grid.h) })
    this.acels.set('Edit', 'Drag East(Leap)', 'CmdOrCtrl+Alt+ArrowRight', () => { this.cursor.drag(this.grid.w, 0) })
    this.acels.set('Edit', 'Drag South(Leap)', 'CmdOrCtrl+Alt+ArrowDown', () => { this.cursor.drag(0, -this.grid.h) })
    this.acels.set('Edit', 'Drag West(Leap)', 'CmdOrCtrl+Alt+ArrowLeft', () => { this.cursor.drag(-this.grid.w, 0) })

    this.acels.set('Project', 'Find', 'CmdOrCtrl+J', () => { this.commander.start('find:') })
    this.acels.set('Project', 'Inject', 'CmdOrCtrl+B', () => { this.commander.start('inject:') })
    this.acels.set('Project', 'Toggle Commander', 'CmdOrCtrl+K', () => { this.commander.start() })
    this.acels.set('Project', 'Run Commander', 'Enter', () => { this.commander.run() })

    this.acels.set('Cursor', 'Toggle Insert Mode', 'CmdOrCtrl+I', () => { this.cursor.ins = !this.cursor.ins })
    this.acels.set('Cursor', 'Toggle Block Comment', 'CmdOrCtrl+/', () => { this.cursor.comment() })
    this.acels.set('Cursor', 'Trigger Operator', 'CmdOrCtrl+P', () => { this.cursor.trigger() })
    this.acels.set('Cursor', 'Reset', 'Escape', () => {
      this.toggleGuide(false)
      this.commander.stop()
      this.clear()
      this.clock.isPaused = false
      this.cursor.reset()
      if (this.fxManager) { this.fxManager.setChain([]) }
      if (this.background) { this.background.off() }
      this.fxTextMode = false
      this.fxTextBuffer = ''
      this.bigTextMode = false
      this.bigTextBuffer = ''
      this.bigTexts = []
    })

    this.acels.set('Move', 'Move North', 'ArrowUp', () => { this.cursor.move(0, 1) })
    this.acels.set('Move', 'Move East', 'ArrowRight', () => { this.cursor.move(1, 0) })
    this.acels.set('Move', 'Move South', 'ArrowDown', () => { this.cursor.move(0, -1) })
    this.acels.set('Move', 'Move West', 'ArrowLeft', () => { this.cursor.move(-1, 0) })
    this.acels.set('Move', 'Move North(Leap)', 'CmdOrCtrl+ArrowUp', () => { this.cursor.move(0, this.grid.h) })
    this.acels.set('Move', 'Move East(Leap)', 'CmdOrCtrl+ArrowRight', () => { this.cursor.move(this.grid.w, 0) })
    this.acels.set('Move', 'Move South(Leap)', 'CmdOrCtrl+ArrowDown', () => { this.cursor.move(0, -this.grid.h) })
    this.acels.set('Move', 'Move West(Leap)', 'CmdOrCtrl+ArrowLeft', () => { this.cursor.move(-this.grid.w, 0) })

    this.acels.set('Move', 'Scale North', 'Shift+ArrowUp', () => { this.cursor.scale(0, 1) })
    this.acels.set('Move', 'Scale East', 'Shift+ArrowRight', () => { this.cursor.scale(1, 0) })
    this.acels.set('Move', 'Scale South', 'Shift+ArrowDown', () => { this.cursor.scale(0, -1) })
    this.acels.set('Move', 'Scale West', 'Shift+ArrowLeft', () => { this.cursor.scale(-1, 0) })
    this.acels.set('Move', 'Scale North(Leap)', 'CmdOrCtrl+Shift+ArrowUp', () => { this.cursor.scale(0, this.grid.h) })
    this.acels.set('Move', 'Scale East(Leap)', 'CmdOrCtrl+Shift+ArrowRight', () => { this.cursor.scale(this.grid.w, 0) })
    this.acels.set('Move', 'Scale South(Leap)', 'CmdOrCtrl+Shift+ArrowDown', () => { this.cursor.scale(0, -this.grid.h) })
    this.acels.set('Move', 'Scale West(Leap)', 'CmdOrCtrl+Shift+ArrowLeft', () => { this.cursor.scale(-this.grid.w, 0) })

    this.acels.set('Clock', 'Play/Pause', 'Space', () => { if (this.cursor.ins) { this.cursor.move(1, 0) } else { this.clock.togglePlay(false) } })
    this.acels.set('Clock', 'Frame By Frame', 'CmdOrCtrl+F', () => { this.clock.touch() })
    this.acels.set('Clock', 'Reset Frame', 'CmdOrCtrl+Shift+R', () => { this.clock.setFrame(0) })
    this.acels.set('Clock', 'Incr. Speed', '>', () => { this.clock.modSpeed(1) })
    this.acels.set('Clock', 'Decr. Speed', '<', () => { this.clock.modSpeed(-1) })
    this.acels.set('Clock', 'Incr. Speed(10x)', 'CmdOrCtrl+>', () => { this.clock.modSpeed(10, true) })
    this.acels.set('Clock', 'Decr. Speed(10x)', 'CmdOrCtrl+<', () => { this.clock.modSpeed(-10, true) })

    this.acels.set('View', 'Toggle Retina', 'Tab', () => { this.toggleRetina() })
    this.acels.set('View', 'Toggle Guide', 'CmdOrCtrl+G', () => { this.toggleGuide() })
    this.acels.set('View', 'Incr. Col', ']', () => { this.modGrid(1, 0) })
    this.acels.set('View', 'Decr. Col', '[', () => { this.modGrid(-1, 0) })
    this.acels.set('View', 'Incr. Row', '}', () => { this.modGrid(0, 1) })
    this.acels.set('View', 'Decr. Row', '{', () => { this.modGrid(0, -1) })
    this.acels.set('View', 'Zoom In', 'CmdOrCtrl+=', () => { this.modZoom(0.0625) })
    this.acels.set('View', 'Zoom Out', 'CmdOrCtrl+-', () => { this.modZoom(-0.0625) })
    this.acels.set('View', 'Zoom Reset', 'CmdOrCtrl+0', () => { this.modZoom(1, true) })

    this.acels.set('View', 'Activate FX Situation', 'Alt+V', () => {
      this.fxTextMode = false
      this.bigTextMode = false
      this.commander.isActive = false
      this.commander.query = 'fx:'
      this.cursor.ins = false
      this.update()
    })
    this.acels.set('View', 'Broken TV Mode', 'Alt+T', () => {
      this.fxManager.setChain([{ name: 'brokentv', seed: 450, drive: 500 }])
      this.update()
    })
    this.acels.set('View', 'Load GIF Swarm', 'Alt+G', () => {
      this.background.loadSwarm()
      this.update()
    })
    this.acels.set('View', 'Load Background Once', 'Alt+B', () => {
      this.background.loadBackground()
      this.update()
    })
    this.acels.set('View', 'Background Auto Cycle', 'Alt+Shift+B', () => {
      this.background.startAuto()
      this.update()
    })
    this.acels.set('View', 'Big Text Overlay', 'Alt+W', () => {
      this.commander.isActive = false
      this.fxTextMode = false
      this.bigTextMode = true
      this.bigTextBuffer = ''
      this.cursor.ins = false
      this.update()
    })

    this.acels.set('Midi', 'Play/Pause Midi', 'CmdOrCtrl+Space', () => { this.clock.togglePlay(true) })
    this.acels.set('Midi', 'Next Input Device', 'CmdOrCtrl+,', () => { this.clock.setFrame(0); this.io.midi.selectNextInput() })
    this.acels.set('Midi', 'Next Output Device', 'CmdOrCtrl+.', () => { this.clock.setFrame(0); this.io.midi.selectNextOutput() })
    this.acels.set('Midi', 'Refresh Devices', 'CmdOrCtrl+Shift+M', () => { this.io.midi.refresh() })

    this.acels.set('Communication', 'Choose OSC Port', 'alt+O', () => { this.commander.start('osc:') })
    this.acels.set('Communication', 'Choose UDP Port', 'alt+U', () => { this.commander.start('udp:') })

    this.acels.install(window)
    this.acels.pipe(this.commander)

    window.addEventListener('keydown', (e) => {
      if (this.bigTextMode) {
        if (e.key === 'Enter') {
          if (this.bigTextBuffer.length > 0) {
            this.bigTexts.push({
              text: this.bigTextBuffer.toUpperCase().slice(0, 42),
              mode: Math.floor(Math.random() * 3),
              born: performance.now(),
              ttl: 8000 + Math.random() * 6000,
              seed: Math.random()
            })
          }
          this.bigTextMode = false
          this.bigTextBuffer = ''
          this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key === 'Escape') {
          this.bigTextMode = false; this.bigTextBuffer = ''; this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key === 'Backspace') {
          this.bigTextBuffer = this.bigTextBuffer.slice(0, -1); this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (this.bigTextBuffer.length < 42) { this.bigTextBuffer += e.key }
          this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        return
      }

      if (this.fxTextMode) {
        if (e.key === 'Enter') {
          if (this.fxTextBuffer.length > 0) {
            const upperText = this.fxTextBuffer.toUpperCase()
            this.orca.writeBlock(this.cursor.x, this.cursor.y, upperText)
            this.cursor.move(upperText.length, 0)
          }
          this.fxTextMode = false
          this.fxTextBuffer = ''
          this.history.record(this.orca.s)
          this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key === 'Escape') {
          this.fxTextMode = false; this.fxTextBuffer = ''; this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key === 'Backspace') {
          this.fxTextBuffer = this.fxTextBuffer.slice(0, -1); this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.fxTextBuffer += e.key; this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        return
      }

      if (this.commander.query.startsWith('fx:')) {
        if (e.key === 'Enter') {
          const val = this.commander.query.substr(3).trim()
          if (val.length > 0) {
            this.commander.trigger(`fx:${val}`)
          } else {
            if (this.fxManager) { this.fxManager.setChain([]) }
            this.commander.query = ''
          }
          this.commander.isActive = false
          this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key === 'Escape') {
          if (this.fxManager) { this.fxManager.setChain([]) }
          this.commander.query = ''
          this.commander.isActive = false
          this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key === 'Backspace') {
          this.commander.query = this.commander.query.slice(0, -1)
          if (this.commander.query === 'fx') { this.commander.query = 'fx:' }
          this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.commander.query += e.key
          this.update()
          e.preventDefault(); e.stopPropagation(); return
        }
      }
    }, true)
  }

  this.start = () => {
    console.info('Client', 'Starting..')
    console.info(`${this.acels}`)
    this.theme.start()
    this.io.start()
    this.history.bind(this.orca, 's')
    this.history.record(this.orca.s)
    this.clock.start()
    this.cursor.start()
    this.reset()
    this.modZoom()
    this.update()
    this.el.className = 'ready'
    this.toggleGuide()
  }

  this.reset = () => {
    this.orca.reset()
    this.resize()
    this.source.new()
    this.history.reset()
    this.cursor.reset()
    this.clock.play()
  }

  this.run = () => {
    this.io.clear()
    this.clock.run()
    this.orca.run()
    this.io.run()
    this.update()
  }

  this.update = () => {
    if (document.hidden === true) { return }
    const fxOn = this.fxManager && this.fxManager.chain && this.fxManager.chain.length > 0
    if (fxOn) {
      this.context.globalCompositeOperation = 'source-over'
      this.context.fillStyle = 'rgba(0,0,0,0.10)'
      this.context.fillRect(0, 0, this.el.width, this.el.height)
      this.ports = this.findPorts()
      this.background.draw(this.context, this.el.width, this.el.height)
      this.background.drawSwarm(this.context, this.el.width, this.el.height)
      this.drawProgram()
      this.drawBigTexts(this.context, this.el.width, this.el.height - (this.tile.hs * 2))
      this.fxManager.postProcess()
    } else {
      this.clear()
      this.ports = this.findPorts()
      this.background.draw(this.context, this.el.width, this.el.height)
      this.background.drawSwarm(this.context, this.el.width, this.el.height)
      this.drawProgram()
      this.drawBigTexts(this.context, this.el.width, this.el.height - (this.tile.hs * 2))
    }
    this.drawInterface()
    this.drawGuide()
  }

  // Scritte cubitali: 92% della verticale, trasparenti (screen), si scompongono negli FX
  this.drawBigTexts = (ctx, W, gridH) => {
    if (!this.bigTexts.length && !this.bigTextMode) { return }
    const now = performance.now()
    const cols = ['#f5efe6', '#ef8f7d', '#2e9cc3', '#c81e4e', '#ff4fd8']
    for (let i = this.bigTexts.length - 1; i >= 0; i--) {
      const t = this.bigTexts[i]
      const age = now - t.born
      if (age > t.ttl) { this.bigTexts.splice(i, 1); continue }
      const size = Math.floor(gridH * 0.92)
      ctx.font = `bold ${size}px input_mono_medium`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      const unitW = Math.max(10, ctx.measureText(t.text).width)
      const reps = Math.ceil(W / unitW) + 2
      let full = ''
      for (let r = 0; r < reps; r++) { full += t.text }
      const fullW = unitW * (reps - 1)
      const phase = Math.floor(age / 160) % 4
      ctx.globalCompositeOperation = 'screen'
      if (phase === 2) { ctx.globalAlpha = 0.08 }
      else if (phase === 3) { ctx.globalAlpha = 0.35 }
      else { ctx.globalAlpha = 0.6 }
      ctx.fillStyle = cols[(Math.floor(t.seed * 10) + phase) % cols.length]
      const y = gridH * 0.5
      let x = 0
      if (t.mode === 0) { x = ((age * 0.25) % unitW) - unitW }
      else if (t.mode === 1) { x = -((age * 0.25) % unitW) - unitW }
      else { x = -((Math.floor(age / 160) * 37) % unitW) }
      ctx.fillText(full, x, y)
      ctx.fillText(full, x + fullW, y)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    if (this.bigTextMode) {
      const size = Math.floor(gridH * 0.08)
      ctx.font = `bold ${size}px input_mono_medium`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#f5efe6'
      ctx.fillText(`> ${this.bigTextBuffer}${now % 500 < 250 ? '_' : ''}`, 20, gridH - size)
    }
    ctx.font = `${this.tile.hs * 0.75}px input_mono_medium`
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'center'
  }

  this.whenOpen = (file, text) => {
    const lines = text.trim().split(/\r?\n/)
    const w = lines[0].length
    const h = lines.length
    const s = lines.join('\n').trim()
    this.orca.load(w, h, s)
    this.history.reset()
    this.history.record(this.orca.s)
    this.resize()
  }

  this.setGrid = (w, h) => {
    this.grid.w = w
    this.grid.h = h
    this.update()
  }

  this.toggleRetina = () => {
    this.scale = this.scale === 1 ? window.devicePixelRatio : 1
    console.log('Client', `Pixel resolution: ${this.scale}`)
    this.resize(true)
  }

  this.toggleGuide = (force = null) => {
    const display = force !== null ? force : this.guide !== true
    if (display === this.guide) { return }
    console.log('Client', `Toggle Guide: ${display}`)
    this.guide = display
    this.update()
  }

  this.modGrid = (x = 0, y = 0) => {
    const w = clamp(this.grid.w + x, 4, 16)
    const h = clamp(this.grid.h + y, 4, 16)
    this.setGrid(w, h)
  }

  this.modZoom = (mod = 0, reset = false) => {
    this.tile = {
      w: reset ? 10 : this.tile.w * (mod + 1),
      h: reset ? 15 : this.tile.h * (mod + 1),
      ws: Math.floor(this.tile.w * this.scale),
      hs: Math.floor(this.tile.h * this.scale)
    }
    localStorage.setItem('tilew', this.tile.w)
    localStorage.setItem('tileh', this.tile.h)
    this.resize(true)
  }

  this.isCursor = (x, y) => { return x === this.cursor.x && y === this.cursor.y }
  this.isMarker = (x, y) => { return x % this.grid.w === 0 && y % this.grid.h === 0 }
  this.isNear = (x, y) => {
    return x > (parseInt(this.cursor.x / this.grid.w) * this.grid.w) - 1 && x <= ((1 + parseInt(this.cursor.x / this.grid.w)) * this.grid.w) && y > (parseInt(this.cursor.y / this.grid.h) * this.grid.h) - 1 && y <= ((1 + parseInt(this.cursor.y / this.grid.h)) * this.grid.h)
  }
  this.isLocals = (x, y) => {
    return this.isNear(x, y) === true && (x % (this.grid.w / 4) === 0 && y % (this.grid.h / 4) === 0) === true
  }
  this.isInvisible = (x, y) => {
    return this.orca.glyphAt(x, y) === '.' && !this.isMarker(x, y) && !this.cursor.selected(x, y) && !this.isLocals(x, y) && !this.ports[this.orca.indexAt(x, y)] && !this.orca.lockAt(x, y)
  }

  this.findPorts = () => {
    const a = new Array((this.orca.w * this.orca.h) - 1)
    for (const operator of this.orca.runtime) {
      if (this.orca.lockAt(operator.x, operator.y)) { continue }
      const ports = operator.getPorts()
      for (const port of ports) {
        const index = this.orca.indexAt(port[0], port[1])
        a[index] = port
      }
    }
    return a
  }

  this.makeTheme = (type) => {
    if (type === 0) { return { bg: this.theme.active.b_med, fg: this.theme.active.f_low } }
    if (type === 1) { return { fg: this.theme.active.b_med } }
    if (type === 2) { return { fg: this.theme.active.b_high } }
    if (type === 3) { return { bg: this.theme.active.b_high, fg: this.theme.active.f_low } }
    if (type === 4) { return { bg: this.theme.active.b_inv, fg: this.theme.active.f_inv } }
    if (type === 5) { return { fg: this.theme.active.f_med } }
    if (type === 6) { return { fg: this.theme.active.b_inv } }
    if (type === 7) { return {} }
    if (type === 8) { return { bg: this.theme.active.b_low, fg: this.theme.active.f_high } }
    if (type === 9) { return { bg: this.theme.active.b_inv, fg: this.theme.active.background } }
    if (type === 10) { return { bg: this.theme.active.background, fg: this.theme.active.f_high } }
    if (type === 11) { return { fg: this.theme.active.b_inv } }
    return { fg: this.theme.active.f_low }
  }

  this.clear = () => {
    this.context.clearRect(0, 0, this.el.width, this.el.height)
  }

  this.drawProgram = () => {
    const selection = this.cursor.read()
    for (let y = 0; y < this.orca.h; y++) {
      for (let x = 0; x < this.orca.w; x++) {
        if (this.isInvisible(x, y)) { continue }
        const g = this.orca.glyphAt(x, y)
        const glyph = g !== '.' ? g : this.isCursor(x, y) ? (this.clock.isPaused ? '~' : '@') : this.isMarker(x, y) ? '+' : g
        this.drawSprite(x, y, glyph, this.makeStyle(x, y, glyph, selection))
      }
    }
  }

  this.makeStyle = (x, y, glyph, selection) => {
    if (this.cursor.selected(x, y)) { return 4 }
    const isLocked = this.orca.lockAt(x, y)
    if (selection === glyph && isLocked === false && selection !== '.') { return 6 }
    if (glyph === '*' && isLocked === false) { return 2 }
    const port = this.ports[this.orca.indexAt(x, y)]
    if (port) { return port[2] }
    if (isLocked === true) { return 5 }
    return 20
  }

  this.drawInterface = () => {
    const ctx = this.context
    const tile = this.tile
    const termHeightPx = tile.hs * 2
    const termY = this.el.height - termHeightPx

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1.0
    ctx.fillStyle = this.theme.active.background || '#000000'
    ctx.fillRect(0, termY, this.el.width, termHeightPx)

    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'center'
    ctx.font = `${tile.hs * 0.75}px input_mono_medium`

    const termRow = Math.floor(termY / tile.hs)
    const termRow2 = termRow + 1

    this.write(`${this.cursor.inspect()}`, this.grid.w * 0, termRow, this.grid.w - 1)
    this.write(`${this.cursor.x},${this.cursor.y}${this.cursor.ins ? '+' : ''}`, this.grid.w * 1, termRow, this.grid.w, this.cursor.ins ? 1 : 2)
    this.write(`${this.cursor.w}:${this.cursor.h}`, this.grid.w * 2, termRow, this.grid.w)
    this.write(`${this.orca.f}f${this.clock.isPaused ? '~' : ''}`, this.grid.w * 3, termRow, this.grid.w)
    this.write(`${this.io.inspect(this.grid.w)}`, this.grid.w * 4, termRow, this.grid.w - 1)
    this.write(this.orca.f < 250 ? `< ${this.io.midi.toInputString()}` : '', this.grid.w * 5, termRow, this.grid.w * 4)

    if (this.bigTextMode) {
      this.write(`[BIG TEXT] ${this.bigTextBuffer}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 6, 1)
    } else if (this.fxTextMode) {
      this.write(`[FX TEXT] ${this.fxTextBuffer}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 6, 1)
    } else if (this.commander.query.startsWith('fx:')) {
      this.write(`${this.commander.query}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 6, 1)
    } else if (this.commander.isActive === true) {
      this.write(`${this.commander.query}${this.orca.f % 2 === 0 ? '_' : ''}`, this.grid.w * 0, termRow2, this.grid.w * 4)
    } else {
      this.write(this.orca.f < 25 ? `ver${this.version}` : `${Object.keys(this.source.cache).length} mods`, this.grid.w * 0, termRow2, this.grid.w)
      this.write(`${this.orca.w}x${this.orca.h}`, this.grid.w * 1, termRow2, this.grid.w)
      this.write(`${this.grid.w}/${this.grid.h}${this.tile.w !== 10 ? ' ' + (this.tile.w / 10).toFixed(1) : ''}`, this.grid.w * 2, termRow2, this.grid.w)
      this.write(`${this.clock}`, this.grid.w * 3, termRow2, this.grid.w, this.clock.isPuppet ? 3 : this.io.midi.isClock ? 11 : this.clock.isPaused ? 20 : 2)
      this.write(`${display(Object.keys(this.orca.variables).join(''), this.orca.f, this.grid.w - 1)}`, this.grid.w * 4, termRow2, this.grid.w - 1)
      this.write(this.orca.f < 250 ? `> ${this.io.midi.toOutputString()}` : '', this.grid.w * 5, termRow2, this.grid.w * 4)
    }

    if (this.fxManager.chain.length) {
      const mods = Object.keys(this.source.cache)
      let info = this.fxManager.chain.map(f => f.name).join('+')
      if (mods.length) { info += ` mods:${mods.length}` }
      const startX = this.orca.w - info.length - 1
      if (startX > this.grid.w * 5) {
        this.write(info, startX, termRow2, info.length + 1, 6)
      }
    }
  }

  this.drawGuide = () => {
    if (this.guide !== true) { return }
    const operators = Object.keys(this.library).filter((val) => { return isNaN(val) })
    for (const id in operators) {
      const key = operators[id]
      const oper = new this.library[key]()
      const text = oper.info
      const frame = this.orca.h - 4
      const x = (Math.floor(parseInt(id) / frame) * 32) + 2
      const y = (parseInt(id) % frame) + 2
      this.write(key, x, y, 99, 3)
      this.write(text, x + 2, y, 99, 10)
    }
    const cmds = [
      ['ALT+V', 'fx prompt nome.seed.drive (+combo)'],
      ['ALT+T', 'broken tv on'],
      ['ALT+G', 'stormo gif boids'],
      ['ALT+B', 'background random'],
      ['ALT+SH+B', 'auto archive 30s x 1min'],
      ['ALT+W', 'scritta cubitale max 42'],
      ['ESC', 'reset tutto']
    ]
    const bx = this.orca.w - 46
    for (let i = 0; i < cmds.length; i++) {
      const y = 2 + i
      if (y > this.orca.h - 3) { break }
      this.write(cmds[i][0], bx, y, 10, 3)
      this.write(cmds[i][1], bx + 9, y, 36, 10)
    }
  }

  this.drawSprite = (x, y, g, type) => {
    const theme = this.makeTheme(type)
    if (theme.bg) {
      this.context.fillStyle = theme.bg
      this.context.fillRect(x * this.tile.ws, (y) * this.tile.hs, this.tile.ws, this.tile.hs)
    }
    if (theme.fg) {
      this.context.fillStyle = theme.fg
      this.context.fillText(g, (x + 0.5) * this.tile.ws, (y + 1) * this.tile.hs)
    }
  }

  this.write = (text, offsetX, offsetY, limit = 50, type = 2) => {
    for (let x = 0; x < text.length && x < limit; x++) {
      this.drawSprite(offsetX + x, offsetY, text.substr(x, 1), type)
    }
  }

  this.resize = () => {
    const W = window.innerWidth
    const H = window.innerHeight

    const tiles = {
      w: Math.ceil(W / this.tile.w),
      h: Math.ceil(H / this.tile.h)
    }

    const bounds = this.orca.bounds()
    if (tiles.w < bounds.w + 1) { tiles.w = bounds.w + 1 }
    if (tiles.h < bounds.h + 1) { tiles.h = bounds.h + 1 }

    const maxW = 400
    const maxH = 200
    if (tiles.w > maxW) { tiles.w = maxW }
    if (tiles.h > maxH) { tiles.h = maxH }

    this.crop(tiles.w, tiles.h)

    if (this.cursor.x >= tiles.w) { this.cursor.moveTo(tiles.w - 1, this.cursor.y) }
    if (this.cursor.y >= tiles.h) { this.cursor.moveTo(this.cursor.x, tiles.h - 1) }

    if (W === this.el.width && H === this.el.height) { return }

    console.log(`Resized to: ${this.orca.w}x${this.orca.h}`)

    this.el.width = W
    this.el.height = H
    this.el.style.width = `${W}px`
    this.el.style.height = `${H}px`

    this.context.textBaseline = 'bottom'
    this.context.textAlign = 'center'
    this.context.font = `${this.tile.hs * 0.75}px input_mono_medium`
    this.context.imageSmoothingEnabled = false

    this.update()
  }

  this.crop = (w, h) => {
    let block = `${this.orca}`
    if (h > this.orca.h) {
      block = `${block}${`\n${'.'.repeat(this.orca.w)}`.repeat((h - this.orca.h))}`
    } else if (h < this.orca.h) {
      block = `${block}`.split(/\r?\n/).slice(0, (h - this.orca.h)).join('\n').trim()
    }
    if (w > this.orca.w) {
      block = `${block}`.split(/\r?\n/).map((val) => { return val + ('.').repeat((w - this.orca.w)) }).join('\n').trim()
    } else if (w < this.orca.w) {
      block = `${block}`.split(/\r?\n/).map((val) => { return val.substr(0, val.length + (w - this.orca.w)) }).join('\n').trim()
    }
    this.history.reset()
    this.orca.load(w, h, block, this.orca.f)
  }

  this.docs = () => {
    let html = ''
    const operators = Object.keys(library).filter((val) => { return isNaN(val) })
    for (const id in operators) {
      const oper = new this.library[operators[id]]()
      const ports = oper.ports.input ? Object.keys(oper.ports.input).reduce((acc, key, val) => { return acc + ' ' + key }, '') : ''
      html += `- \`${oper.glyph.toUpperCase()}\` ${oper.name}${ports !== '' ? '(' + ports.trim() + ')' : ''}: ${oper.info}.\n`
    }
    return html
  }

  window.addEventListener('dragover', (e) => { e.stopPropagation(); e.preventDefault(); e.dataTransfer.dropEffect = 'copy' })
  window.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation()
    for (const file of e.dataTransfer.files) {
      if (file.name.indexOf('.orca') < 0) { continue }
      this.toggleGuide(false)
      this.source.read(file, null, true)
      this.commander.start('inject:' + file.name.replace('.orca', ''))
    }
  })
  window.onresize = (e) => { this.resize() }

  function display (str, f, max) { return str.length < max ? str : str.slice(f % str.length) + str.substr(0, f % str.length) }
  function clamp (v, min, max) { return v < min ? min : v > max ? max : v }
}
'use strict'

function Acels (client) {
  this.all = {}
  this.roles = {}
  this.pipe = null

  this.install = (host = window) => {
    host.addEventListener('keydown', this.onKeyDown, false)
    host.addEventListener('keyup', this.onKeyUp, false)
  }

  this.set = (cat, name, accelerator, downfn, upfn) => {
    if (this.all[accelerator]) {
      console.warn('Acels', `Trying to overwrite ${this.all[accelerator].name}, with ${name}.`)
    }
    this.all[accelerator] = { cat, name, downfn, upfn, accelerator }
  }

  this.add = (cat, role) => {
    this.all[':' + role] = { cat, name: role, role }
  }

  this.get = (accelerator) => {
    return this.all[accelerator]
  }

  this.sort = () => {
    const h = {}
    for (const item of Object.values(this.all)) {
      if (!h[item.cat]) { h[item.cat] = [] }
      h[item.cat].push(item)
    }
    return h
  }

  this.convert = (event) => {
    // macOS: Alt+lettera produce caratteri speciali (es. Alt+V = '√') — usa event.code
    if (event.altKey && event.code && /^Key[A-Z]$/.test(event.code)) {
      return `Alt+${event.code.slice(3)}`
    }
    const accelerator = event.key === ' ' ? 'Space' : event.key.substr(0, 1).toUpperCase() + event.key.substr(1)
    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
      return `CmdOrCtrl+Shift+${accelerator}`
    }
    if (event.shiftKey && event.key.toUpperCase() !== event.key) {
      return `Shift+${accelerator}`
    }
    if (event.altKey && event.key.length !== 1) {
      return `Alt+${accelerator}`
    }
    if (event.ctrlKey || event.metaKey) {
      return `CmdOrCtrl+${accelerator}`
    }
    return accelerator
  }

  this.pipe = (obj) => {
    this.pipe = obj
  }

  this.onKeyDown = (e) => {
    // Ignora l'auto-repeat del tasto: tenere Space premuto non deve far
    // scattare togglePlay in loop (play/stop/play/stop = flicker rosso)
    if (e.repeat) { return }
    const target = this.get(this.convert(e))
    if (!target || !target.downfn) {
      return this.pipe ? this.pipe.onKeyDown(e) : null
    }
    target.downfn()
    e.preventDefault()
  }

  this.onKeyUp = (e) => {
    const target = this.get(this.convert(e))
    if (!target || !target.upfn) {
      return this.pipe ? this.pipe.onKeyUp(e) : null
    }
    target.upfn()
    e.preventDefault()
  }

  this.toMarkdown = () => {
    const cats = this.sort()
    let text = ''
    for (const cat in cats) {
      text += `\n### ${cat}\n\n`
      for (const item of cats[cat]) {
        text += item.accelerator ? `- \`${item.accelerator.replace('`', 'tilde')}\`: ${item.name}\n` : ''
      }
    }
    return text.trim()
  }

  this.toString = () => {
    const cats = this.sort()
    let text = ''
    for (const cat in cats) {
      text += `\n${cat}\n\n`
      for (const item of cats[cat]) {
        text += item.accelerator ? `${item.name.padEnd(25, '.')} ${item.accelerator}\n` : ''
      }
    }
    return text.trim()
  }

  // --- Iniezione menu via API ---
  this.inject = (name = 'Untitled') => {
    if (!window.api || !window.api.app) {
      console.warn('[Acels] API menu non disponibile')
      return
    }

    // Registra tutti i click handlers in un globale per IPC
    if (!window.__menuActions) window.__menuActions = {}
    let actionIdx = 0

    const injection = []

    // Menu principale
    injection.push({
      label: name,
      submenu: [
        { label: 'About', click: () => {} },
        { label: 'Theme', submenu: [
          { label: 'Download Themes', click: () => {} },
          { label: 'Open Theme', click: () => { if (client && client.theme) client.theme.open() } },
          { label: 'Reset Theme', accelerator: 'CmdOrCtrl+Escape', click: () => { if (client && client.theme) client.theme.reset() } }
        ]},
        { label: 'Fullscreen', accelerator: 'CmdOrCtrl+Enter', click: () => { if (window.api && window.api.app) window.api.app.toggleFullscreen() } },
        { label: 'Hide', accelerator: 'CmdOrCtrl+H', click: () => { if (window.api && window.api.app) window.api.app.toggleVisible() } },
        { label: 'Toggle Menubar', accelerator: 'Alt+H', click: () => { if (window.api && window.api.app) window.api.app.toggleMenubar() } },
        { label: 'Inspect', accelerator: 'CmdOrCtrl+Tab', click: () => { if (window.api && window.api.app) window.api.app.inspect() } },
        { label: 'Quit', click: () => { if (window.api && window.api.app) window.api.app.quit() } }
      ]
    })

    // Aggiungi le voci definite in client.js
    const sorted = this.sort()
    for (const cat of Object.keys(sorted)) {
      const submenu = []
      for (const option of sorted[cat]) {
        if (option.role) {
          submenu.push({ role: option.role })
        } else if (option.type) {
          submenu.push({ type: option.type })
        } else {
          submenu.push({
            label: option.name,
            accelerator: option.accelerator,
            click: option.downfn
          })
        }
      }
      injection.push({ label: cat, submenu: submenu })
    }

    // Inietta il menu via IPC — on macOS, le funzioni click vengono
    // mantenute nella template e usate dal processo renderer direttamente
    // (Electron costruisce il menu nel renderer quando usato da qui)
    try {
      window.api.app.injectMenu(injection)
    } catch (e) {
      console.warn('[Acels] Menu injection fallita:', e)
    }
  }
}
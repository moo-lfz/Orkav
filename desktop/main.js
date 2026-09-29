'use strict'
const { app, BrowserWindow, Menu, ipcMain, shell, session, nativeImage, systemPreferences } = require('electron')
const path = require('path')

const { setupSystemInfoService, setupIpcHandlers: setupSystemInfoIpc } = require('./services/systeminfo-service')
const { createUdpService, createOscService } = require('./services/network-services')
const { createAbletonLinkService, disposeAbletonLinkService } = require('./services/ableton-link-service')
const { createFsService } = require('./services/fs-service')

app.allowRendererProcessReuse = true
app.setName('Orkav') // in dev mode macOS mostra "Electron" senza questo
let isShown = true
let mainWindow = null

// Permessi media: senza questo handler Electron nega microfono/webcam/MIDI.
// Ristretto: media (mic+webcam) e midi — niente clipboard/mediaKeySystem/midiSysex.
// NOTA: qui NON verifichiamo il sender (webContents) perché il check stretto
// negava il Web MIDI (NotAllowedError) su alcune finestre/timing. Il renderer
// è comunque l'unica finestra e nodeIntegration:false lo isola.
function setupPermissions() {
  const ses = session.defaultSession
  // `midi` (no sysex) + `midiSysex` (alcune build Chromium controllano comunque
  // midiSysex anche per richieste sysex:false su macOS → altrimenti NotAllowedError).
  // Aggiunti media/videoCapture/audioCapture per microfono e webcam.
  const allowed = ['media', 'midi', 'midiSysex', 'videoCapture', 'audioCapture']
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowed.includes(permission))
  })
  ses.setPermissionCheckHandler((webContents, permission) => {
    return allowed.includes(permission)
  })
  console.log('[Main] Permission handler attivo (media/midi/midiSysex/webcam)')
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#000',
    icon: path.join(__dirname, { darwin: 'icon.icns', linux: 'icon.png', win32: 'icon.ico' }[process.platform] || 'icon.ico'),
    resizable: true,
    frame: true,
    // skipTaskbar rimosso: su macOS nascondeva il Dock icon e impediva l'attivazione della menu bar
    autoHideMenuBar: false,
    webPreferences: {
      zoomFactor: 1.0,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    }
  })

  mainWindow.loadURL(`file://${__dirname}/sources/index.html`)
  // Blocca navigazione a URL esterni (anti-phishing / anti-reroute)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://' + __dirname)) {
      console.warn('[Security] Navigazione bloccata:', url)
      event.preventDefault()
    }
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('did-finish-load', () => {
    // DevTools SOLO in sviluppo (non pacchettizzato)
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'right' })
      mainWindow.webContents.focus()
    }
  })
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main] did-fail-load:', errorCode, errorDescription, validatedURL)
  })
  mainWindow.webContents.on('crashed', () => {
    console.error('[Main] Renderer CRASHED')
  })
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[Main] Renderer unresponsive')
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.on('hide', () => { isShown = false })
  mainWindow.on('show', () => { isShown = true })

  return mainWindow
}

async function setupServices() {
  setupSystemInfoIpc()
  setupSystemInfoService(mainWindow)
  createUdpService(mainWindow)
  createOscService(mainWindow)
  createAbletonLinkService(mainWindow)
  createFsService(mainWindow)
  console.log('[Main] Tutti i servizi avviati')
}

function setupMenu(app, win) {
  // Costruisci il menu Orkav direttamente nel main process
  // Gli acceleratori Electron funzionano solo qui
  const isMac = process.platform === 'darwin'
  const template = [
    {
      label: app.name || 'Orkav',
      submenu: [
        { role: 'about', label: 'About Orkav' },
        { type: 'separator' },
        { label: 'Fullscreen', accelerator: 'CmdOrCtrl+Enter', click: () => { if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen()) } },
        { label: 'Hide', accelerator: 'CmdOrCtrl+H', click: () => { if (win && !win.isDestroyed()) { if (isMac) win.hide(); else win.minimize() } } },
        { label: 'Toggle Menubar', accelerator: 'Alt+H', click: () => { if (win && !win.isDestroyed()) win.setMenuBarVisibility(!win.isMenuBarVisible()) } },
        { type: 'separator' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send('menu:action', 'fileNew') },
        { label: 'Open', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu:action', 'fileOpen') },
        { label: 'Export', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu:action', 'fileExport') }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+Z') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+Shift+Z') },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: () => win.webContents.send('menu:action', ':cut') },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => win.webContents.send('menu:action', ':copy') },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => win.webContents.send('menu:action', ':paste') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+A') },
        { label: 'Erase Selection', click: () => win.webContents.send('menu:action', 'Backspace') },
        { type: 'separator' },
        { label: 'Uppercase', accelerator: 'CmdOrCtrl+Shift+U', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+Shift+U') },
        { label: 'Lowercase', accelerator: 'CmdOrCtrl+Shift+L', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+Shift+L') }
      ]
    },
    {
      label: 'Project',
      submenu: [
        { label: 'Find', accelerator: 'CmdOrCtrl+J', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+J') },
        { label: 'Inject Module', accelerator: 'CmdOrCtrl+B', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+B') },
        { label: 'Import Modules', accelerator: 'CmdOrCtrl+L', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+L') },
        { type: 'separator' },
        { label: 'Toggle Commander', accelerator: 'CmdOrCtrl+K', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+K') },
        { label: 'Run Commander', click: () => win.webContents.send('menu:action', 'Enter') }
      ]
    },
    {
      label: 'Cursor',
      submenu: [
        { label: 'Toggle Insert Mode', accelerator: 'CmdOrCtrl+I', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+I') },
        { label: 'Toggle Block Comment', accelerator: 'CmdOrCtrl+/', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+/') },
        { label: 'Trigger Operator', accelerator: 'CmdOrCtrl+P', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+P') },
        { label: 'Reset', click: () => win.webContents.send('menu:action', 'Escape') }
      ]
    },
    {
      label: 'Clock',
      submenu: [
        { label: 'Play/Pause', click: () => win.webContents.send('menu:action', 'Space') },
        { label: 'Frame By Frame', accelerator: 'CmdOrCtrl+F', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+F') },
        { label: 'Reset Frame', accelerator: 'CmdOrCtrl+Shift+R', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+Shift+R') },
        { type: 'separator' },
        { label: 'Incr. Speed', click: () => win.webContents.send('menu:action', '>') },
        { label: 'Decr. Speed', click: () => win.webContents.send('menu:action', '<') }
      ]
    },
    {
      label: 'FX',
      submenu: [
        { label: 'FX Prompt (fx:)', accelerator: 'Alt+V', click: () => win.webContents.send('menu:action', 'Alt+V') },
        { type: 'separator' },
        { label: 'Broken TV', accelerator: 'Alt+T', click: () => win.webContents.send('menu:action', 'fxBrokentv') },
        { label: 'Datamosh', accelerator: 'Alt+D', click: () => win.webContents.send('menu:action', 'fxDatamosh') },
        { label: 'Glitch', accelerator: 'Alt+J', click: () => win.webContents.send('menu:action', 'Alt+J') },
        { label: 'Ameba', accelerator: 'Alt+K', click: () => win.webContents.send('menu:action', 'Alt+K') },
        { label: 'Fractal', accelerator: 'Alt+R', click: () => win.webContents.send('menu:action', 'fxFractal') },
        { label: 'Displace', accelerator: 'Alt+S', click: () => win.webContents.send('menu:action', 'Alt+S') },
        { label: 'Chromawarp', accelerator: 'Alt+N', click: () => win.webContents.send('menu:action', 'Alt+N') },
        { label: 'Fracture', accelerator: 'Alt+Q', click: () => win.webContents.send('menu:action', 'Alt+Q') },
        { label: 'Glow', accelerator: 'Alt+L', click: () => win.webContents.send('menu:action', 'Alt+L') },
        { type: 'separator' },
        { label: 'TOTAL GLITCH / PANIC', accelerator: 'Alt+Shift+X', click: () => win.webContents.send('menu:action', 'fxTotalGlitch') }
      ]
    },
    {
      label: 'Visual',
      submenu: [
        { label: 'GIF Swarm', accelerator: 'Alt+G', click: () => win.webContents.send('menu:action', 'Alt+G') },
        { label: 'Background Random', accelerator: 'Alt+B', click: () => win.webContents.send('menu:action', 'Alt+B') },
        { label: 'Background Auto Cycle', accelerator: 'Alt+Shift+B', click: () => win.webContents.send('menu:action', 'Alt+Shift+B') },
        // Niente accelerator sui TOGGLE (webcam/3D): il renderer li gestisce già
        // nel keydown e l'acceleratore del menu scatenerebbe un doppio toggle.
        { label: 'Webcam Livefeed (Alt+Z)', click: () => win.webContents.send('menu:action', 'toggleWebcam') },
        { label: '3D Model (Alt+P)', click: () => win.webContents.send('menu:action', 'Alt+P') },
        { label: '3D Add Model (Alt+M)', click: () => win.webContents.send('menu:action', 'Alt+M') },
        { label: '3D Search Model (Alt+Shift+P)', click: () => win.webContents.send('menu:action', 'Alt+Shift+P') },
        { label: '3D Glossy / Chrome (Alt+C)', click: () => win.webContents.send('menu:action', 'Alt+C') },
        { label: '3D Clear Models (Alt+Shift+C)', click: () => win.webContents.send('menu:action', 'Alt+Shift+C') },
        { label: 'Big Text Overlay', accelerator: 'Alt+W', click: () => win.webContents.send('menu:action', 'Alt+W') },
        { label: 'Add Tag & Search', accelerator: 'CmdOrCtrl+W', click: () => win.webContents.send('menu:action', 'addTag') },
        { label: 'Next Tag', accelerator: 'CmdOrCtrl+Shift+T', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+Shift+T') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => win.webContents.send('menu:action', 'zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => win.webContents.send('menu:action', 'zoomOut') },
        { label: 'Zoom Reset', accelerator: 'CmdOrCtrl+0', click: () => win.webContents.send('menu:action', 'zoomReset') },
        { type: 'separator' },
        { label: 'Toggle Guide', accelerator: 'CmdOrCtrl+G', click: () => win.webContents.send('menu:action', 'toggleGuide') },
        { label: 'Toggle Retina', click: () => win.webContents.send('menu:action', 'Tab') },
        { type: 'separator' },
        { label: 'Inspect', accelerator: 'CmdOrCtrl+Tab', click: () => { if (win && !win.isDestroyed()) win.webContents.toggleDevTools() } },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Midi',
      submenu: [
        { label: 'Play/Pause Midi', accelerator: 'CmdOrCtrl+Space', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+Space') },
        { label: 'Next Input Device', accelerator: 'CmdOrCtrl+,', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+,') },
        { label: 'Next Output Device', accelerator: 'CmdOrCtrl+.', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+.') },
        { label: 'Refresh Devices', accelerator: 'CmdOrCtrl+Shift+M', click: () => win.webContents.send('menu:action', 'CmdOrCtrl+Shift+M') }
      ]
    },
    {
      label: 'Comm',
      submenu: [
        { label: 'Choose OSC Port', accelerator: 'Alt+O', click: () => win.webContents.send('menu:action', 'alt+O') },
        { label: 'Choose UDP Port', accelerator: 'Alt+U', click: () => win.webContents.send('menu:action', 'alt+U') }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  // Verifica immediata: quali top-level menu sono davvero registrati?
  const check = Menu.getApplicationMenu()
  const names = check ? check.items.map(i => i.label || i.role).join(' | ') : 'NULL'
  console.log('[Main] Menu registrati:', names)
  // Su macOS l'app deve essere attiva per mostrare il suo menu nella barra di sistema
  // (app.activate NON esiste: l'API Electron è app.focus)
  if (app.focus) app.focus({ steal: true })
  console.log('[Main] Menu Orkav applicato:', app.name || 'Orkav')
}

function setupMenuHandlers() {
  ipcMain.handle('app:injectMenu', (event, menuTemplate) => {
    // Legacy handler — ignora, il menu è gestito da setupMenu
    return true
  })

  ipcMain.on('app:toggleFullscreen', () => {
    if (mainWindow) {
      const isFullscreen = mainWindow.isFullScreen()
      mainWindow.setFullScreen(!isFullscreen)
      console.log('[Main] Fullscreen:', !isFullscreen)
    }
  })

  ipcMain.on('app:toggleVisible', () => {
    if (!mainWindow) return
    if (process.platform !== 'darwin') {
      if (!mainWindow.isMinimized()) mainWindow.minimize()
      else mainWindow.restore()
    } else {
      if (isShown && !mainWindow.isFullScreen()) mainWindow.hide()
      else mainWindow.show()
    }
  })

  ipcMain.on('app:toggleMenubar', () => {
    if (mainWindow) {
      const isVisible = mainWindow.isMenuBarVisible()
      mainWindow.setMenuBarVisibility(!isVisible)
    }
  })

  ipcMain.on('app:inspect', () => {
    if (mainWindow) mainWindow.toggleDevTools()
  })

  ipcMain.on('app:quit', () => {
    app.quit()
  })

  ipcMain.on('menu:action', (event, action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:action', action)
    }
  })

  ipcMain.handle('shell:openExternal', (event, url) => {
    // Validazione URL: consenti SOLO http/https (blocca file://, smb://, ssh://...)
    if (typeof url !== 'string') return false
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        console.warn('[Security] openExternal bloccato:', url)
        return false
      }
    } catch (e) {
      return false
    }
    shell.openExternal(url)
    return true
  })

  ipcMain.handle('app:loadpatch', (event, patchName) => {
    console.log('[Main] Caricamento patch:', patchName)
    return true
  })
}

app.on('ready', async () => {
  console.log('[Main] app ready')
  setupPermissions()
  // Microfono su macOS: se TCC ha già negato il permesso a questo binary,
  // getUserMedia fallisce SENZA mostrare alcun prompt. Controlliamo e chiediamo esplicitamente.
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    console.log('[Main] Stato permesso microfono:', micStatus)
    if (micStatus === 'not-determined') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      console.log('[Main] Microfono richiesto all utente:', granted ? 'CONCESSO' : 'NEGATO')
    } else if (micStatus === 'denied') {
      console.warn('[Main] MICROFONO NEGATO da macOS per questo binary.')
      console.warn('[Main] Riabilitalo in: Impostazioni di Sistema > Privacy e Sicurezza > Microfono > Electron')
      console.warn('[Main] oppure da terminale: tccutil reset Microphone com.github.Electron')
    }
    try {
      const dockIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
      if (!dockIcon.isEmpty()) { app.dock.setIcon(dockIcon); console.log('[Main] Icona Dock impostata') }
    } catch (e) { console.warn('[Main] Icona Dock fallita:', e.message) }
  }
  mainWindow = createMainWindow()
  console.log('[Main] finestra creata')
  try {
    await setupServices()
    console.log('[Main] servizi avviati')
  } catch (e) {
    console.error('[Main] Errore setupServices:', e)
  }
  try {
    setupMenu(app, mainWindow)
    console.log('[Main] menu setup completato')
  } catch (e) {
    console.error('[Main] Errore setupMenu:', e)
  }
  try {
    setupMenuHandlers()
    console.log('[Main] menu handlers setup completato')
  } catch (e) {
    console.error('[Main] Errore setupMenuHandlers:', e)
  }
})

app.on('window-all-closed', async () => {
  await disposeAbletonLinkService() // shutdown ordinato del worker, poi quit
  app.quit()
})

// Cmd+Q su macOS passa da before-quit, non da window-all-closed
let quitting = false
app.on('before-quit', async (event) => {
  if (quitting) return
  quitting = true
  await disposeAbletonLinkService()
})

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow()
    setupServices()
  } else {
    mainWindow.show()
  }
  // Re-assert del menu quando l'app torna in primo piano (macOS dock click)
  if (!Menu.getApplicationMenu()) {
    console.warn('[Main] Menu perso, re-applico')
    setupMenu(app, mainWindow)
  }
})

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err)
})

app.inspect = function () {
  if (mainWindow) mainWindow.toggleDevTools()
}

app.toggleFullscreen = function () {
  if (mainWindow) {
    const isFullscreen = mainWindow.isFullScreen()
    mainWindow.setFullScreen(!isFullscreen)
  }
}

app.toggleMenubar = function () {
  if (mainWindow) {
    const isVisible = mainWindow.isMenuBarVisible()
    mainWindow.setMenuBarVisibility(!isVisible)
  }
}

app.toggleVisible = function () {
  if (!mainWindow) return
  if (process.platform !== 'darwin') {
    if (!mainWindow.isMinimized()) mainWindow.minimize()
    else mainWindow.restore()
  } else {
    if (isShown && !mainWindow.isFullScreen()) mainWindow.hide()
    else mainWindow.show()
  }
}

app.injectMenu = function (menu) {
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu))
  } catch (err) {
    console.warn('Cannot inject menu.', err)
  }
}
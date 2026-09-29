const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  udp: {
    createSocket: (port) => ipcRenderer.invoke('udp:create', port),
    send: (port, message, targetPort, targetIP) => ipcRenderer.send('udp:send', { port, message, targetPort, targetIP }),
    onMessage: (callback) => ipcRenderer.on('udp:message', (event, data) => callback(data))
  },
  osc: {
    createServer: (port) => ipcRenderer.invoke('osc:create', port),
    send: (port, address, args) => ipcRenderer.send('osc:send', { port, address, args }),
    onMessage: (callback) => ipcRenderer.on('osc:message', (event, data) => callback(data))
  },
  abletonlink: {
    create: (bpm) => ipcRenderer.invoke('abletonlink:create', bpm),
    setTempo: (bpm) => ipcRenderer.send('abletonlink:setTempo', bpm),
    setIsPlaying: (playing) => ipcRenderer.send('abletonlink:setIsPlaying', playing),
    onTempoChange: (callback) => ipcRenderer.on('abletonlink:tempo', (event, bpm) => callback(bpm)),
    onStartStop: (callback) => ipcRenderer.on('abletonlink:startstop', (event, playing) => callback(playing)),
    onPeers: (callback) => ipcRenderer.on('abletonlink:peers', (event, num) => callback(num))
  },
  fs: {
    readdirSync: (path) => ipcRenderer.invoke('fs:readdirSync', path),
    readFileSync: (path, encoding) => ipcRenderer.invoke('fs:readFileSync', { path, encoding }),
    existsSync: (path) => ipcRenderer.invoke('fs:existsSync', path),
    statSync: (path) => ipcRenderer.invoke('fs:statSync', path)
  },
  systeminformation: {
    onUpdate: (callback) => ipcRenderer.on('systeminfo:update', (event, data) => callback(data))
  },
  app: {
    injectMenu: (menuTemplate) => ipcRenderer.invoke('app:injectMenu', menuTemplate),
    toggleFullscreen: () => ipcRenderer.send('app:toggleFullscreen'),
    toggleVisible: () => ipcRenderer.send('app:toggleVisible'),
    toggleMenubar: () => ipcRenderer.send('app:toggleMenubar'),
    inspect: () => ipcRenderer.send('app:inspect'),
    quit: () => ipcRenderer.send('app:quit'),
    loadpatch: (patchName) => ipcRenderer.invoke('app:loadpatch', patchName)
  },
  menu: {
    onAction: (callback) => ipcRenderer.on('menu:action', (event, action) => callback(action))
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  }
});
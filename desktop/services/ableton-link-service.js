const path = require('path');
const { ipcMain, utilityProcess } = require('electron');

let worker = null;
let workerReady = false;
let restartTimer = null;
let disposed = false; // evita il riavvio dopo dispose
let pendingCreateBpm = null; // create richiesto dal renderer prima che il worker fosse pronto

function sendToWorker(action, data) {
  if (worker && workerReady) {
    worker.postMessage({ action, data });
    return true;
  }
  return false;
}

function startWorker(win) {
  disposed = false; // nuovo worker: riabilita il riavvio automatico
  if (worker) {
    try { worker.kill(); } catch (e) {}
    worker = null;
  }

  const workerPath = path.join(__dirname, '..', 'ableton-link-worker.js');
  // utilityProcess.fork: API Electron moderna che gestisce correttamente il
  // lifecycle su macOS (evita l'errore "task_policy_set TASK_SUPPRESSION_POLICY"
  // che child_process.fork causava killando un processo già morto).
  worker = utilityProcess.fork(workerPath, [], {
    serviceName: 'ableton-link'
  });

  worker.on('message', (message) => {
    const { channel, data } = message;
    // Guard: non inviare se la finestra è stata distrutta
    if (!win || win.isDestroyed()) return;
    switch (channel) {
      case 'workerReady':
        workerReady = true;
        console.log('[AbletonLink] Worker pronto');
        // Invia il create SOLO se il renderer lo ha già richiesto (altrimenti
        // aspetta la richiesta vera). Il vecchio `sendToWorker('create', 120)`
        // qui causava un DOPPIO create (questo + quello del renderer): il secondo
        // disable() resettava il play state a "stopped" → onStartStop(false) →
        // clock.stop() → la patch Orca non partiva.
        if (pendingCreateBpm !== null) {
          const bpm = pendingCreateBpm
          pendingCreateBpm = null
          sendToWorker('create', bpm)
        }
        break;
      case 'ready':
        console.log('[AbletonLink] Istanza creata nel worker');
        break;
      case 'tempo':
        win.webContents.send('abletonlink:tempo', data);
        break;
      case 'startstop':
        win.webContents.send('abletonlink:startstop', data);
        break;
      case 'peers':
        win.webContents.send('abletonlink:peers', data);
        break;
      case 'error':
        console.error('[AbletonLink] Errore dal worker:', data);
        break;
      default:
        console.log('[AbletonLink] Messaggio sconosciuto:', channel, data);
    }
  });

  worker.on('exit', (code) => {
    console.warn('[AbletonLink] Worker uscito con codice:', code);
    workerReady = false;
    worker = null;
    if (restartTimer) clearTimeout(restartTimer);
    if (disposed) return; // uscita volontaria durante lo shutdown: non riavviare
    restartTimer = setTimeout(() => {
      console.log('[AbletonLink] Riavvio worker...');
      startWorker(win);
    }, 1000);
  });
}

function createAbletonLinkService(win) {
  startWorker(win);

  ipcMain.handle('abletonlink:create', (event, bpm) => {
    // Se il worker non è ancora pronto, memorizza il BPM e lo invieremo
    // appena arriva 'workerReady' (evita create persi e doppi create).
    if (!sendToWorker('create', bpm)) {
      pendingCreateBpm = bpm
    }
    return true;
  });

  ipcMain.on('abletonlink:setTempo', (event, bpm) => {
    sendToWorker('setTempo', bpm);
  });

  ipcMain.on('abletonlink:setIsPlaying', (event, playing) => {
    sendToWorker('setIsPlaying', playing);
  });

  ipcMain.on('abletonlink:dispose', () => {
    sendToWorker('dispose');
  });
}

function disposeAbletonLinkService() {
  // Shutdown ordinato + kill garantito: il worker riceve 'dispose' ed esce,
  // ma se non muore in 800ms lo uccidiamo forzatamente. Evita worker orfani
  // (peer fantasma sulla rete Link).
  disposed = true;
  return new Promise((resolve) => {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (!worker) { resolve(); return; }
    const w = worker;
    worker = null;
    workerReady = false;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    w.once('exit', finish);
    // Fallback duro: kill se non esce da solo
    setTimeout(() => {
      try { w.kill(); } catch (e) {}
    }, 800);
    // Non bloccare mai lo shutdown oltre 1.2s
    setTimeout(finish, 1200);
    try { w.postMessage({ action: 'dispose' }); } catch (e) { finish(); }
  });
}

module.exports = { createAbletonLinkService, disposeAbletonLinkService };

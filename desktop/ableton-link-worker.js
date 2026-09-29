'use strict';

const AbletonLink = require('abletonlink');
let linkInstance = null;
let updateInterval = null;

// --- IPC: supporta BOTH utilityProcess (parentPort) e child_process.fork (process.send) ---
const parentPort = process.parentPort || null;
function sendToParent(channel, data) {
  if (parentPort) {
    parentPort.postMessage({ channel, data });
  } else if (process.send) {
    process.send({ channel, data });
  }
}
function onMessage(handler) {
  if (parentPort) {
    // utilityProcess: il messaggio arriva come evento con .data
    parentPort.on('message', (e) => handler(e.data));
  } else {
    process.on('message', handler);
  }
}

function createLink(bpm) {
  if (linkInstance) {
    try { linkInstance.disable(); } catch (e) {}
    linkInstance = null;
  }
  try {
    linkInstance = new AbletonLink(bpm || 120);
    try { linkInstance.enable(); } catch (e) {}
    try { linkInstance.enablePlayStateSync(); } catch (e) {}
    console.log('[AbletonLink Worker] Istanza creata (play state sync abilitato)');

    // Peer count via callback nativo onNumPeersChanged: più affidabile del polling
    if (typeof linkInstance.onNumPeersChanged === 'function') {
      try {
        linkInstance.onNumPeersChanged((num) => { sendToParent('peers', num); });
      } catch (e) {}
    }
    // Play state via callback nativo
    if (typeof linkInstance.onPlayStateChanged === 'function') {
      try {
        linkInstance.onPlayStateChanged((isPlaying) => { sendToParent('startstop', isPlaying); });
      } catch (e) {}
    }

    if (typeof linkInstance.startUpdate === 'function') {
      // startUpdate manda SOLO il tempo (bpm): lo start/stop passa dal callback
      // nativo onPlayStateChanged, non dal polling (evita feedback loop stale).
      linkInstance.startUpdate(100, (beat, phase, tempo) => {
        sendToParent('tempo', tempo);
      });
    } else {
      updateInterval = setInterval(() => {
        if (!linkInstance) return;
        try {
          const tempo = linkInstance.bpm;
          if (tempo !== undefined) sendToParent('tempo', tempo);
          const numPeers = typeof linkInstance.getNumPeers === 'function' ? linkInstance.getNumPeers() : (linkInstance.numPeers || 0);
          sendToParent('peers', numPeers);
        } catch (e) {}
      }, 100);
    }

    // Primo update + report immediato del numero peer reale
    try {
      linkInstance.update();
      const n = typeof linkInstance.getNumPeers === 'function' ? linkInstance.getNumPeers() : 0;
      console.log('[AbletonLink Worker] Peer iniziali:', n);
      sendToParent('peers', n);
    } catch (e) {}

    sendToParent('ready', true);
  } catch (e) {
    console.error('[AbletonLink Worker] Errore creazione:', e.message);
    sendToParent('error', e.message);
  }
}

onMessage((message) => {
  const { action, data } = message;
  switch (action) {
    case 'create':
      createLink(data);
      break;
    case 'setTempo':
      if (linkInstance) {
        try {
          if (typeof linkInstance.setTempo === 'function') linkInstance.setTempo(data);
          else linkInstance.bpm = data;
        } catch (e) { console.error(e); }
      }
      break;
    case 'setIsPlaying':
      if (linkInstance) {
        try {
          if (typeof linkInstance.setIsPlaying === 'function') linkInstance.setIsPlaying(data);
          else if (typeof linkInstance.play === 'function' && typeof linkInstance.stop === 'function') { if (data) linkInstance.play(); else linkInstance.stop(); }
          else linkInstance.isPlayStateSync = data;
        } catch (e) { console.error(e); }
      }
      break;
    case 'dispose':
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = null;
      // NON chiamare disable()/disablePlayStateSync(): la libreria nativa
      // abletonlink tiene thread vivi che bloccano l'exit e lasciano worker
      // orfani (peer fantasma). Il SO ripulisce la memoria nativa.
      linkInstance = null;
      process.exit(0);
      break;
    default:
      console.warn('[AbletonLink Worker] Azione sconosciuta:', action);
  }
});

sendToParent('workerReady', true);

process.on('uncaughtException', (err) => {
  console.error('[AbletonLink Worker] Uncaught Exception:', err);
  sendToParent('error', err.message);
});

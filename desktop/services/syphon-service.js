const { TextureSender, sendTextureFromPaintEvent } = require('@napolab/texture-bridge-core');

let orcaSender = null;
let orcaPaintHandler = null;

function setupSyphonService(win, cablesWin) {
  try {
    orcaSender = new TextureSender('Orca Feed', 1280, 720);
    console.log('[Syphon] Sender Orca creato');

    orcaPaintHandler = (event, details) => {
      const texture = details.texture;
      if (!texture) return;
      try {
        sendTextureFromPaintEvent(orcaSender, texture.textureInfo);
      } finally {
        if (typeof texture.release === 'function') texture.release();
      }
    };
    win.webContents.on('paint', orcaPaintHandler);

    console.log('[Syphon] Sender Orca attivo');
  } catch (e) {
    console.warn('[Syphon] Errore:', e.message);
  }
}

function disposeSyphonService() {
  if (orcaPaintHandler && global.win) {
    global.win.webContents.off('paint', orcaPaintHandler);
  }
  if (orcaSender) {
    if (typeof orcaSender.dispose === 'function') orcaSender.dispose();
    orcaSender = null;
  }
  console.log('[Syphon] Rilasciato');
}

module.exports = { setupSyphonService, disposeSyphonService };
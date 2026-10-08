const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Whitelist dei percorsi accessibili dal renderer.
// SENZA questa whitelist il renderer può leggere QUALSIASI file del sistema
// (path traversal → ~/.ssh, /etc/passwd, ecc.) via fs:readFileSync.
const DESKTOP_ROOT = path.join(__dirname, '..') // .../desktop/ (contiene sources/shaders)
const ALLOWED_ROOTS = [
  DESKTOP_ROOT,                                       // desktop/ (shaders)
  path.join(os.homedir(), 'Orca', 'backgrounds')      // gif locali
];

function resolveAllowed(p) {
  const resolved = path.resolve(p);
  for (const root of ALLOWED_ROOTS) {
    const r = path.resolve(root);
    if (resolved === r || resolved.startsWith(r + path.sep)) return resolved;
  }
  return null;
}

function isTrustedSender(event, win) {
  return win && !win.isDestroyed() && event.sender === win.webContents;
}

function createFsService(win) {
  ipcMain.handle('fs:readdirSync', (event, dirPath) => {
    if (!isTrustedSender(event, win)) throw new Error('Untrusted sender');
    const safe = resolveAllowed(dirPath);
    if (!safe) throw new Error('Path not allowed: ' + dirPath);
    return fs.readdirSync(safe);
  });

  ipcMain.handle('fs:readFileSync', (event, { path: filePath, encoding }) => {
    if (!isTrustedSender(event, win)) throw new Error('Untrusted sender');
    const safe = resolveAllowed(filePath);
    if (!safe) throw new Error('Path not allowed: ' + filePath);
    // encoding: solo stringa o undefined (evita tipi inattesi)
    const enc = (typeof encoding === 'string') ? encoding : 'utf8';
    return fs.readFileSync(safe, enc);
  });

  ipcMain.handle('fs:existsSync', (event, filePath) => {
    if (!isTrustedSender(event, win)) throw new Error('Untrusted sender');
    const safe = resolveAllowed(filePath);
    if (!safe) return false;
    return fs.existsSync(safe);
  });

  ipcMain.handle('fs:statSync', (event, filePath) => {
    if (!isTrustedSender(event, win)) throw new Error('Untrusted sender');
    const safe = resolveAllowed(filePath);
    if (!safe) throw new Error('Path not allowed: ' + filePath);
    return fs.statSync(safe);
  });

  // ---------------------------------------------------------------------
  // Cache chiave/valore su disco (userData/cache/<key>.json).
  // Serve perché localStorage su origine file:// NON persiste su disco in
  // Electron: l'indice Poly Haven (~530 KB) veniva riscaricato a ogni avvio.
  // La chiave è sanificata a [a-z0-9_-]: nessun path arbitrario, nessun
  // traversal possibile (a differenza di fs:*).
  // ---------------------------------------------------------------------
  function cachePath(key) {
    const k = String(key == null ? '' : key).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!k || k.length > 64) return null;
    return path.join(app.getPath('userData'), 'orkav-cache', k + '.json');
  }

  ipcMain.handle('cache:get', (event, key) => {
    if (!isTrustedSender(event, win)) throw new Error('Untrusted sender');
    const p = cachePath(key);
    if (!p) return null;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const box = JSON.parse(raw);
      if (!box || typeof box.t !== 'number') return null;
      return box;
    } catch (e) { return null; }
  });

  ipcMain.handle('cache:set', (event, { key, value }) => {
    if (!isTrustedSender(event, win)) throw new Error('Untrusted sender');
    const p = cachePath(key);
    if (!p) return false;
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      // scrittura atomica: tmp + rename, così un crash non lascia file corrotti
      const tmp = p + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ t: Date.now(), v: value }));
      fs.renameSync(tmp, p);
      return true;
    } catch (e) {
      console.error('[fs-service] cache:set', key, e && e.message ? e.message : e);
      return false;
    }
  });

  ipcMain.handle('cache:del', (event, key) => {
    if (!isTrustedSender(event, win)) throw new Error('Untrusted sender');
    const p = cachePath(key);
    if (!p) return false;
    try { fs.unlinkSync(p); return true } catch (e) { return false }
  });
}

module.exports = { createFsService };

const { ipcMain } = require('electron');
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
}

module.exports = { createFsService };

'use strict'
window.addEventListener('error', (e) => { console.error('[GLOBAL] Uncaught error:', e.error, e.filename, e.lineno) })
window.addEventListener('unhandledrejection', (e) => { console.error('[GLOBAL] Unhandled rejection:', e.reason) })
console.log('[BOOT] Prima di new Client()')
const client = new Client()
window.orkavClient = client
console.log('[BOOT] Client creato, install()...')
client.install(document.body)
console.log('[BOOT] install() completato, attesa load...')
window.addEventListener('load', () => {
  console.log('[BOOT] load event, chiamo start()')
  client.start()
  // Riscaldamento in background delle risorse di rete (three.js, Poly Haven, ...)
  try { if (window.Prefetch) { Prefetch.start() } } catch (e) { console.warn('[BOOT] Prefetch:', e) }
})

'use strict'

// ---------------------------------------------------------------------------
// Prefetch — riscalda in background (durante l'idle) le risorse di rete che
// Orkav usa su richiesta. Obiettivo: quando premi Alt+P / Alt+Z la roba e' gia'
// in cache HTTP e il primo caricamento non blocca piu' il render.
//
// Regole:
//  - parte solo dopo il boot + un ritardo, e solo nei momenti di idle;
//  - una risorsa alla volta, con pausa fra le une e le altre;
//  - si mette in pausa se una richiesta vera e' in corso (Net.busy());
//  - un fallimento e' un warning, mai un errore fatale.
// ---------------------------------------------------------------------------

const Prefetch = {
  started: false,
  stopped: false,
  minDelay: 2500,
  gap: 900,
  tasks: [],

  MEDIAPIPE_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  MEDIAPIPE_MODEL: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',

  add(name, fn, when) { this.tasks.push({ name: name, fn: fn, when: when || null }) },

  stop() { this.stopped = true },

  start() {
    if (this.started) { return }
    this.started = true
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const idle = () => new Promise((res) => {
      if (window.requestIdleCallback) { window.requestIdleCallback(() => res(), { timeout: 4000 }) }
      else { setTimeout(res, 1200) }
    })

    const run = async () => {
      await sleep(this.minDelay)
      for (let i = 0; i < this.tasks.length; i++) {
        if (this.stopped) { return }
        const t = this.tasks[i]
        try {
          if (t.when && !t.when()) { continue }
          await idle()
          // Se l'utente ha appena chiesto qualcosa, lascialo passare avanti.
          let guard = 0
          while (window.Net && Net.busy() && guard++ < 12) { await sleep(1200) }
          const t0 = performance.now()
          await t.fn()
          console.log('[Prefetch] ' + t.name + ' pronto in ' + Math.round(performance.now() - t0) + 'ms')
        } catch (e) {
          console.warn('[Prefetch] ' + t.name + ' saltato:', (e && e.message) || e)
        }
        await sleep(this.gap)
      }
      console.log('[Prefetch] completato')
    }
    run()
  }
}

// Chi ha già usato la webcam: solo allora vale la pena scaricare i 3.7 MB di MediaPipe.
Prefetch.webcamUsed = function () {
  try { return window.localStorage.getItem('orkav_webcam_used') === '1' } catch (e) { return false }
}

// --- 1) three.js + i loader usati da model3d.js (1.35 MB da jsdelivr) -------
Prefetch.add('three', async () => {
  const m3 = window.orkavClient && window.orkavClient.model3d
  if (m3 && m3.ready) { return }
  await import('three')
  await import('three/addons/loaders/GLTFLoader.js')
  await import('three/addons/loaders/STLLoader.js')
  await import('three/addons/loaders/OBJLoader.js')
  await import('three/addons/environments/RoomEnvironment.js')
  await import('three/addons/utils/BufferGeometryUtils.js')
}, () => !(window.orkavClient && window.orkavClient.model3d && window.orkavClient.model3d.ready))

// --- 2) indice Poly Haven (~530 KB, 521 modelli CC0) ------------------------
Prefetch.add('polyhaven-index', async () => {
  if (!window.Net) { return }
  const KEY = 'ph_index_v1'
  const TTL = 7 * 24 * 3600 * 1000
  if (await Net.cacheLoad(KEY, TTL)) {
    console.log('[Prefetch] indice Poly Haven già in cache locale')
    return
  }
  const api = (window.Model3d && Model3d.PH_API) || 'https://api.polyhaven.com'
  const json = await Net.json(api + '/assets?t=models', { quiet: true }, 8000)
  const n = json ? Object.keys(json).length : 0
  if (n) { await Net.cacheSave(KEY, json) }
  console.log('[Prefetch] indice Poly Haven:', n, 'modelli')
})

// --- 3) MediaPipe: bundle + wasm + modello face landmarker -------------------
// È la voce che pesa di più sul primo Alt+Z: il wasm di tasks-vision è la parte
// grossa (~10 MB) e veniva scaricato in linea mentre l'utente aspettava.
// Misurato: init completo 10.5 s a freddo. Ora si scarica SEMPRE in background
// (richieste "quiet", in idle) così al primo Alt+Z è già nella cache HTTP.
Prefetch.MEDIAPIPE_FILES = [
  '/vision_bundle.mjs',
  '/wasm/vision_wasm_internal.js',
  '/wasm/vision_wasm_internal.wasm',      // 9.4 MB: è QUESTA la voce da 10.5 s
  '/wasm/vision_wasm_nosimd_internal.js',
  '/wasm/vision_wasm_nosimd_internal.wasm' // solo se manca il SIMD: per ultima
]

Prefetch.add('mediapipe', async () => {
  const cdn = Prefetch.MEDIAPIPE_CDN
  await import(cdn + '/vision_bundle.mjs')
  // Prima la variante SIMD (quella usata su qualunque Mac recente) e il modello,
  // poi — molto dopo — la variante senza SIMD, che serve solo ai casi rari.
  for (const f of ['/wasm/vision_wasm_internal.js', '/wasm/vision_wasm_internal.wasm']) {
    try { await Net.fetch(cdn + f, { quiet: true }, 40000) } catch (e) {}
  }
  try { await Net.fetch(Prefetch.MEDIAPIPE_MODEL, { quiet: true }, 40000) } catch (e) {}
  for (const f of ['/wasm/vision_wasm_nosimd_internal.js', '/wasm/vision_wasm_nosimd_internal.wasm']) {
    try { await Net.fetch(cdn + f, { quiet: true }, 40000) } catch (e) {}
  }
}, () => {
  // Salta solo se il face tracker è già pronto in questa sessione
  return !(window.orkavClient && window.orkavClient.faceTracker && window.orkavClient.faceTracker.ready)
})

// --- 4) MaskFX: compila lo shader della maschera prima che serva ------------
// Il primo Alt+H costava ~440 ms fra lettura del .frag e compilazione.
Prefetch.add('maskfx', async () => {
  const ft = window.orkavClient && window.orkavClient.faceTracker
  if (!ft || !ft.maskFX || ft.maskFX.ready) { return }
  await ft.maskFX.init()
})

window.Prefetch = Prefetch

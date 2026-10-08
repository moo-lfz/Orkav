'use strict'
// ============================================================================
// FaceTracker — riconoscimento facciale via MediaPipe FaceLandmarker (468 punti)
// Carica il bundle via import() dalla CDN (CSP script-src include jsdelivr),
// esegue detectForVideo sul video della webcam e ricava metriche derivate:
//   bocca aperta, occhio sx/dx aperto, rotazione testa (roll/pitch/yaw),
//   posizione viso normalizzata (x,y), scala (dimensione), ammiccamento.
//
// Inoltre gestisce una MASCHERA GIF/PNG trasparente agganciata al volto
// (posizione + rotazione + scala dai landmark). La trasparenza è nativa
// dell'<img> (drawImage preserva alpha), quindi nessun decoder necessario.
// ============================================================================
function FaceTracker (client) {
  this.client = client
  this.ready = false        // FaceLandmarker creato
  this.active = false       // detection loop attivo
  this.loading = false
  this.landmarker = null
  this.video = null         // video element webcam
  this.landmarks = null     // ultimi 468 landmark (normalizzati 0-1)
  this.blendshapes = null   // blendshape (bocca, occhi, sopracciglia)
  this.metrics = null       // metriche derivate pronte per gli shader
  this._initPromise = null
  this._lastTs = 0
  // Maschere: tutte le emoticon smile (procedurali, trasparenti)
  this.masks = []          // [{ img, type }]
  this.maskImg = null      // maschera attualmente selezionata
  this.maskType = 'face'
  this.maskReady = false
  this.maskOn = false
  this._maskIdx = -1
  this._maskSwapTimer = null
  this._maskSwapMs = 150   // cambio molto veloce (6-7 al secondo)
  this._lastSwap = 0
}

// Indici landmark FaceMesh canonici (468)
FaceTracker.LM = {
  foreheadTop: 10,
  chin: 152,
  noseTip: 1,
  // occhio sinistro (soggetto) — sul piano immagine è a destra
  leftEyeOuter: 33, leftEyeInner: 133, leftEyeUpper: 159, leftEyeLower: 145,
  // occhio destro (soggetto) — sul piano immagine è a sinistra
  rightEyeOuter: 362, rightEyeInner: 263, rightEyeUpper: 386, rightEyeLower: 374,
  mouthUpper: 13, mouthLower: 14, mouthLeft: 61, mouthRight: 291,
  cheekLeft: 234, cheekRight: 454
}

FaceTracker.prototype.init = function () {
  if (this._initPromise) return this._initPromise
  this.loading = true
  // Flag per il prefetch: MediaPipe (3.7 MB) si scarica in background solo
  // a partire dal secondo avvio in cui la webcam viene usata.
  try { window.localStorage.setItem('orkav_webcam_used', '1') } catch (e) {}
  this._initPromise = (async () => {
    try {
      const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
      const { FilesetResolver, FaceLandmarker } = await import(CDN + '/vision_bundle.mjs')
      const wasm = await FilesetResolver.forVisionTasks(CDN + '/wasm')
      const modelPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
      const baseOptions = { modelAssetPath: modelPath, delegate: 'GPU' }
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(wasm, {
          baseOptions,
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: true
        })
      } catch (gpuErr) {
        console.warn('[FaceTracker] GPU fallita, provo CPU:', gpuErr.message || gpuErr)
        this.landmarker = await FaceLandmarker.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: true
        })
      }
      this.ready = true
      console.log('[FaceTracker] pronto (468 landmark)')
    } catch (e) {
      console.error('[FaceTracker] init fallito:', e)
      this._initPromise = null
    } finally {
      this.loading = false
    }
  })()
  return this._initPromise
}

FaceTracker.prototype.start = function () {
  if (!this.ready) { this.init(); return }
  if (this.active) return
  this.active = true
  console.log('[FaceTracker] detection loop avviato')
  const loop = () => {
    if (!this.active) return
    if (this.video && this.video.videoWidth) { this.detect(this.video) }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

FaceTracker.prototype.stop = function () {
  this.active = false
  this.metrics = null
  this.landmarks = null
}

FaceTracker.prototype.setVideo = function (video) {
  this.video = video
}

FaceTracker.prototype.detect = function (video) {
  if (!this.ready || !this.landmarker) return null
  try {
    const ts = performance.now()
    // MediaPipe richiede timestamp monotoni crescenti
    if (ts <= this._lastTs) { this._lastTs = ts + 1 } else { this._lastTs = ts }
    const res = this.landmarker.detectForVideo(video, this._lastTs)
    if (res && res.faceLandmarks && res.faceLandmarks.length) {
      this.landmarks = res.faceLandmarks[0]
      this.blendshapes = (res.faceBlendshapes && res.faceBlendshapes[0]) || null
      this.metrics = this.computeMetrics(this.landmarks)
      this.metrics = this._smoothMetrics(this.metrics)
      return this.metrics
    }
  } catch (e) {
    // errore transitorio (es. frame non pronto) — non spamma la console
  }
  return null
}

// Smussa le metriche (EMA) per eliminare il jitter dei landmark e rendere
// l'aggancio maschera/parametri shader più stabile. Pesi: posizione/rotazione
// più lenti (stabili), bocca/occhi più reattivi.
FaceTracker.prototype._smoothMetrics = function (m) {
  if (!this._sm) {
    this._sm = { faceX: m.faceX, faceY: m.faceY, faceCx: m.faceCx, faceCy: m.faceCy, roll: m.roll, pitch: m.pitch, yaw: m.yaw, faceH: m.faceH, faceW: m.faceW, mouthOpen: m.mouthOpen, eyeOpen: m.eyeOpen }
  }
  const s = this._sm
  // Smoothing: fattore alpha (0..1); più alto = più reattivo ma più jitter
  const lerp = (a, b, k) => a + (b - a) * k
  const Kpos = 0.45   // posizione/rotazione: medio (stabile)
  const Kshape = 0.7  // bocca/occhi: reattivi
  s.faceX = lerp(s.faceX, m.faceX, Kpos)
  s.faceY = lerp(s.faceY, m.faceY, Kpos)
  s.faceCx = lerp(s.faceCx, m.faceCx, Kpos)
  s.faceCy = lerp(s.faceCy, m.faceCy, Kpos)
  s.roll = lerp(s.roll, m.roll, Kpos)
  s.pitch = lerp(s.pitch, m.pitch, Kpos)
  s.yaw = lerp(s.yaw, m.yaw, Kpos)
  s.faceH = lerp(s.faceH, m.faceH, 0.5)
  s.faceW = lerp(s.faceW, m.faceW, 0.5)
  s.mouthOpen = lerp(s.mouthOpen, m.mouthOpen, Kshape)
  s.eyeOpen = lerp(s.eyeOpen, m.eyeOpen, Kshape)

  return {
    mouthOpen: s.mouthOpen,
    leftEye: m.leftEye, rightEye: m.rightEye,
    eyeOpen: s.eyeOpen,
    blink: m.blink, blinkEdge: m.blinkEdge,
    roll: s.roll, pitch: s.pitch, yaw: s.yaw,
    faceX: s.faceX, faceY: s.faceY,
    faceScale: s.faceH,
    faceH: s.faceH, faceW: s.faceW,
    faceCx: s.faceCx, faceCy: s.faceCy,
    eyesMid: m.eyesMid, leC: m.leC, reC: m.reC,
    mouthCx: m.mouthCx, mouthCy: m.mouthCy, mouthW: m.mouthW,
    present: true
  }
}

FaceTracker.prototype.dist = function (a, b) {
  const dx = a.x - b.x; const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

FaceTracker.prototype.clamp01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v) }

// Mappa i landmark in metriche compatte per gli shader.
FaceTracker.prototype.computeMetrics = function (lm) {
  const L = FaceTracker.LM
  const g = i => lm[i]
  const faceH = this.dist(g(L.foreheadTop), g(L.chin)) || 1e-6
  const faceW = this.dist(g(L.cheekLeft), g(L.cheekRight)) || 1e-6

  // Bocca: apertura verticale normalizzata sull'altezza del viso
  const mouthOpen = this.clamp01(this.dist(g(L.mouthUpper), g(L.mouthLower)) / (faceH * 0.35))

  // Occhi: apertura = altezza / larghezza (0=chiuso, ~0.3 aperto)
  const leRaw = this.dist(g(L.leftEyeUpper), g(L.leftEyeLower)) / (this.dist(g(L.leftEyeOuter), g(L.leftEyeInner)) || 1e-6)
  const reRaw = this.dist(g(L.rightEyeUpper), g(L.rightEyeLower)) / (this.dist(g(L.rightEyeOuter), g(L.rightEyeInner)) || 1e-6)
  const leftEye = this.clamp01(leRaw / 0.35)
  const rightEye = this.clamp01(reRaw / 0.35)
  const eyeOpen = (leftEye + rightEye) * 0.5
  const blink = eyeOpen < 0.22 ? 1 : 0

  // Occhi mediani per roll/pitch/yaw
  const leC = { x: (g(L.leftEyeOuter).x + g(L.leftEyeInner).x) / 2, y: (g(L.leftEyeOuter).y + g(L.leftEyeInner).y) / 2 }
  const reC = { x: (g(L.rightEyeOuter).x + g(L.rightEyeInner).x) / 2, y: (g(L.rightEyeOuter).y + g(L.rightEyeInner).y) / 2 }
  const eyesMid = { x: (leC.x + reC.x) / 2, y: (leC.y + reC.y) / 2 }

  // Roll: angolo della linea tra i due occhi (0 = livellato)
  const roll = Math.atan2(leC.y - reC.y, leC.x - reC.x) // rad
  // Pitch: naso sopra/sotto il punto medio degli occhi
  const pitch = (g(L.noseTip).y - eyesMid.y) / faceH
  // Yaw: naso spostato lateralmente rispetto al punto medio degli occhi
  const yaw = (g(L.noseTip).x - eyesMid.x) / faceW

  // Posizione viso (naso) e scala (dimensione relativa)
  const faceX = g(L.noseTip).x
  const faceY = g(L.noseTip).y
  const faceScale = faceH // 0..~1, più vicino = più grande

  // Centro viso: punto medio tra fronte-mento (verticale) e guance (orizzontale)
  const faceCx = (g(L.foreheadTop).x + g(L.chin).x + g(L.cheekLeft).x + g(L.cheekRight).x) / 4
  const faceCy = (g(L.foreheadTop).y + g(L.chin).y) / 2

  // Bocca: centro e larghezza (per maschere "bocca")
  const mouthCx = (g(L.mouthLeft).x + g(L.mouthRight).x) / 2
  const mouthCy = (g(L.mouthUpper).y + g(L.mouthLower).y) / 2
  const mouthW = this.dist(g(L.mouthLeft), g(L.mouthRight))

  // Ammiccamento "edge": flash su transizione aperto→chiuso (per u_flash)
  const blinkEdge = blink && !this._prevBlink ? 1 : 0
  this._prevBlink = blink

  return {
    mouthOpen, leftEye, rightEye, eyeOpen, blink, blinkEdge,
    roll, pitch, yaw, faceX, faceY, faceScale,
    faceH, faceW, faceCx, faceCy, eyesMid, leC, reC,
    mouthCx, mouthCy, mouthW,
    present: true
  }
}

// ============================================================================
// MASCHERE: due emoticon procedurali agganciate al volto (DEMONE + SMILE
// che si scioglie). Alternano casualmente ogni _maskSwapMs (default 6s).
// ============================================================================

FaceTracker.prototype.toggleMask = async function () {
  this.maskOn = !this.maskOn
  if (this.maskOn) {
    await this._ensureMaskPool()
    this._selectRandomMask()
    this._startMaskSwapTimer()
    console.log('[FaceTracker] maschera ON')
  } else {
    this._stopMaskSwapTimer()
    console.log('[FaceTracker] maschera OFF')
  }
  return this.maskOn
}

// Tutte le emoticon smile (viso). Cambio molto veloce, con freeze sui bassi
// e freeze periodico ogni 17s.
FaceTracker.prototype._ensureMaskPool = async function () {
  if (!this.masks || !this.masks.length) {
    const emojis = [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌',
      '😔', '😪', '🤤', '😴', '🥱', '😷', '🤒', '🤕', '🤢', '🤮',
      '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
      '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦',
      '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
      '😓', '😩', '😫', '😤', '😡', '😠', '🤬', '😈', '👿', '💀',
      '👻', '👽', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽',
      '🙀', '😿', '😾', '💩', '🤡', '👺', '👹', '🥸', '🤠', '😺'
    ]
    this.masks = emojis.map(e => ({ img: this._makeEmoji(e), type: 'face' }))
  }
}

FaceTracker.prototype._selectRandomMask = function () {
  if (!this.masks || !this.masks.length) return
  let idx = Math.floor(Math.random() * this.masks.length)
  if (this.masks.length > 1 && this._maskIdx === idx) { idx = (idx + 1) % this.masks.length }
  this._maskIdx = idx
  this.maskImg = this.masks[idx].img
  this.maskType = this.masks[idx].type
  this.maskReady = true
}

// Swap veloce con due regole di freeze:
//  1. picco di bassi FORTE (bass > 0.8) → congela sull'emoji corrente
//  2. ogni 17s → congela per ~600ms (effetto "stroboscopico")
FaceTracker.prototype._updateMaskSwap = function (now) {
  if (!this.masks || !this.masks.length || !this.maskOn) return
  const a = this.client && this.client.audioReactor
  const bass = a ? (a.bass || 0) : 0
  const in17Freeze = (now % 17000) < 600
  // Freeze sui bassi solo su PICCO forte (il rumore ambientale del microfono
  // teneva bass ~0.5-0.6 costante e congelava tutto: soglia alzata a 0.8)
  if (bass > 0.8 || in17Freeze) {
    this._lastSwap = now // congela: resetta il timer per ripartire subito dopo
    return
  }
  const ms = this._maskSwapMs || 150
  if (now - this._lastSwap >= ms) {
    this._lastSwap = now
    this._selectRandomMask()
  }
}

FaceTracker.prototype._startMaskSwapTimer = function () {
  this._stopMaskSwapTimer()
  // Non serve un setInterval: lo swap viene pilotato da drawMask (rAF) via
  // _updateMaskSwap, così può reagire ai bassi in tempo reale.
}

FaceTracker.prototype._stopMaskSwapTimer = function () {
  if (this._maskSwapTimer) { clearInterval(this._maskSwapTimer); this._maskSwapTimer = null }
}

// Renderizza un'emoji nativa (font di sistema) su canvas trasparente.
FaceTracker.prototype._makeEmoji = function (emoji) {
  const cv = document.createElement('canvas')
  cv.width = 512; cv.height = 512
  const ctx = cv.getContext('2d')
  ctx.clearRect(0, 0, 512, 512)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const fonts = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif'
  ctx.font = '420px ' + fonts
  ctx.fillText(emoji, 256, 430)
  return cv
}

// Disegna la maschera agganciata ai landmark giusti dentro il ctx del feed.
FaceTracker.prototype.drawMask = function (ctx, W, H) {
  if (!this.maskOn || !this.maskReady || !this.metrics || !this.maskImg) return false
  // Pilota lo swap veloce (con freeze su bassi / ogni 17s) a ogni frame
  this._updateMaskSwap(performance.now())
  const m = this.metrics
  const type = this.maskType || 'face'
  let cx, cy, mw, rot

  if (type === 'eyes') {
    cx = m.eyesMid.x * W
    cy = m.eyesMid.y * H
    mw = m.faceW * W * 1.1
    rot = m.roll
  } else if (type === 'mouth') {
    cx = m.mouthCx * W
    cy = m.mouthCy * H
    mw = m.mouthW * W * 1.6
    rot = m.roll
  } else if (type === 'nose') {
    cx = m.faceX * W
    cy = m.faceY * H
    mw = m.faceW * W * 0.6
    rot = m.roll
  } else {
    // face: centrato sul viso, ~20px SOTTO il centro (il font emoji ha il
    // glyph spostato in basso, quindi compensiamo leggermente)
    cx = m.faceCx * W
    cy = m.faceCy * H + 20
    mw = m.faceW * W * 1.35 * 1.5 // +50% size
    rot = m.roll
  }

  const mh = mw * (this.maskImg.height / this.maskImg.width || 1)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.globalAlpha = 0.92
  ctx.drawImage(this.maskImg, -mw / 2, -mh / 2, mw, mh)
  ctx.restore()
  return true
}

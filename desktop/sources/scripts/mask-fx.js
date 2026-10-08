'use strict'

// ---------------------------------------------------------------------------
// MaskFX — pipeline WebGL2 DEDICATA alle emoticon della maschera facciale.
//
// Perché separata da GLEngine: la catena FX lavora sul feed già composto,
// mentre la maschera va glitchata PRIMA di essere disegnata sul viso — e deve
// restare trasparente attorno all'emoji (un quadrato glitchato coprirebbe il
// viso). Qui c'è un canvas 256×256 con alpha, il suo programma e la sua
// texture, caricata dal canvas dell'emoji ad ogni frame.
//
// È SEMPRE ATTIVA: quando c'è una maschera, l'emoticon nasce già glitchata.
//
//   const fx = new MaskFX(client)
//   await fx.init()                  // carica shaders/mask/glitch.frag
//   const out = fx.process(emojiCanvas, params)   // -> canvas da drawImage()
// ---------------------------------------------------------------------------

function MaskFX (client) {
  this.client = client
  this.ready = false
  this.enabled = true
  this.size = 256

  this.canvas = document.createElement('canvas')
  this.canvas.width = this.size
  this.canvas.height = this.size
  this.gl = this.canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  })
  this.ok = !!this.gl
  this._seed = Math.random()
  this._t0 = performance.now()
}

// Shader inline di riserva: se il file .frag non è leggibile l'effetto resta.
MaskFX.FALLBACK_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 FragColor;
uniform sampler2D u_tex; uniform float u_time; uniform float u_high; uniform float u_flash; uniform float u_seed; uniform float u_glitch;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 uv = v_uv;
  float tk = floor(u_time * 24.0);
  float by = floor(uv.y * 14.0);
  uv.x += (hash(vec2(by, tk)) - 0.5) * 0.06 * step(0.5, hash(vec2(by*2.0, tk))) * u_glitch;
  float s = 0.006 + u_high * 0.02 + u_flash * 0.03;
  vec4 a = texture(u_tex, clamp(uv,0.0,1.0));
  vec4 r = texture(u_tex, clamp(uv + vec2(s,0.0),0.0,1.0));
  vec4 b = texture(u_tex, clamp(uv - vec2(s,0.0),0.0,1.0));
  FragColor = vec4(r.r, a.g, b.b, a.a);
}`

MaskFX.prototype.init = async function () {
  if (!this.ok) { console.warn('[MaskFX] WebGL2 non disponibile: maschera senza glitch'); return false }
  const gl = this.gl
  try {
    let frag = MaskFX.FALLBACK_FRAG
    try {
      if (window.api && window.api.fs) {
        const baseUrl = window.location.href.replace('file://', '').replace(/\/[^\/]*$/, '')
        const p = baseUrl + '/shaders/mask/glitch.frag'
        const txt = await window.api.fs.readFileSync(p, 'utf8')
        if (txt && txt.indexOf('void main') >= 0) { frag = txt }
      }
    } catch (e) {
      console.warn('[MaskFX] glitch.frag non letto, uso il fallback inline:', e && e.message)
    }

    const vs = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vs, '#version 300 es\nin vec2 a_pos; out vec2 v_uv;\nvoid main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }')
    gl.compileShader(vs)
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { throw new Error('VS: ' + gl.getShaderInfoLog(vs)) }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fs, frag)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { throw new Error('FS: ' + gl.getShaderInfoLog(fs)) }

    const p = gl.createProgram()
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { throw new Error('link: ' + gl.getProgramInfoLog(p)) }
    this.prog = p

    this.buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(p, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    this.tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    // NIENTE UNPACK_FLIP_Y: drawImage disegna con y verso il basso e il canvas
    // della maschera è già nello stesso verso, quindi evitiamo il flip.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)

    gl.useProgram(p)
    this.u = {
      tex: gl.getUniformLocation(p, 'u_tex'),
      res: gl.getUniformLocation(p, 'u_res'),
      time: gl.getUniformLocation(p, 'u_time'),
      seed: gl.getUniformLocation(p, 'u_seed'),
      inten: gl.getUniformLocation(p, 'u_int'),
      bass: gl.getUniformLocation(p, 'u_bass'),
      mid: gl.getUniformLocation(p, 'u_mid'),
      high: gl.getUniformLocation(p, 'u_high'),
      vol: gl.getUniformLocation(p, 'u_vol'),
      flash: gl.getUniformLocation(p, 'u_flash'),
      glitch: gl.getUniformLocation(p, 'u_glitch')
    }
    gl.uniform1i(this.u.tex, 0)
    gl.uniform2f(this.u.res, this.size, this.size)
    gl.uniform1f(this.u.glitch, 1.0)
    gl.viewport(0, 0, this.size, this.size)
    gl.clearColor(0, 0, 0, 0)

    this.ready = true
    console.log('[MaskFX] glitch maschera pronto (256×256, sempre attivo)')
    return true
  } catch (e) {
    console.error('[MaskFX] init fallito:', e && e.message)
    this.ready = false
    return false
  }
}

// Nuovo seed quando cambia l'emoji: ogni emoticon ha il SUO pattern di glitch.
MaskFX.prototype.reseed = function () {
  this._seed = Math.random()
  this._t0 = performance.now()
}

// Disegna l'emoji glitchata nel canvas interno e lo restituisce.
// Ritorna null se non è utilizzabile (il chiamante usa l'emoji originale).
MaskFX.prototype.process = function (srcCanvas, audio) {
  if (!this.ready || !this.enabled || !srcCanvas) { return null }
  const gl = this.gl
  try {
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas)
    gl.useProgram(this.prog)
    const t = (performance.now() - this._t0) / 1000
    const a = audio || {}
    gl.uniform1f(this.u.time, t)
    gl.uniform1f(this.u.seed, this._seed)
    gl.uniform1f(this.u.inten, 0.75)
    gl.uniform1f(this.u.bass, a.bass || 0)
    gl.uniform1f(this.u.mid, a.mid || 0)
    gl.uniform1f(this.u.high, a.high || 0)
    gl.uniform1f(this.u.vol, a.vol || 0)
    gl.uniform1f(this.u.flash, a.flash || 0)
    gl.uniform1f(this.u.glitch, 1.0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return this.canvas
  } catch (e) {
    return null
  }
}

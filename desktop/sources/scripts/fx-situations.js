'use strict'
function GLEngine () {
  this.canvas = document.createElement('canvas')
  this.gl = this.canvas.getContext('webgl2', {
    alpha: false,
    preserveDrawingBuffer: false,
    antialias: false,
    powerPreference: 'high-performance'
  })
  this.chain = []; this.ok = !!this.gl
  this.phase = 'wave'; this.nextSwitch = 0; this.dropRaw = 0; this.seedPrev = false
  this.q = 1
  // Scala di risoluzione interna della catena (1 = piena). Modificata a runtime
  // da client.update() in base agli fps: 0.5 = un quarto dei pixel da shaderare.
  this.quality = 1
  if (!this.ok) {
    console.warn('GLEngine: WebGL2 not available, fallback to WebGL1')
    this.gl = this.canvas.getContext('webgl', {
      alpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      powerPreference: 'high-performance'
    })
    this.ok = !!this.gl
    if (!this.ok) return
    this.isWebGL2 = false
  } else {
    this.isWebGL2 = true
  }
  this.build()
  // Shaders caricati async dopo l'avvio (da client.start)
  this._shadersLoaded = false
}

GLEngine.prototype.setChain = function (arr) {
  this.chain = (arr || []).filter(f => this.progs[f.name]).slice(0, 4)
  this.seedPrev = this.chain.length > 0
}

GLEngine.prototype.build = function () {
  const gl = this.gl
  this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  this.texScene = this.makeTex()
  this.fboOut = this.makeFBO()
  this.fboTmp = this.makeFBO()
  this.fboPrev = this.makeFBO()

  // Vertex Shader WebGL2
  this.VERT = '#version 300 es\n' +
    'in vec2 a_pos;\n' +
    'out vec2 v_uv;\n' +
    'void main() {\n' +
    '  v_uv = a_pos * 0.5 + 0.5;\n' +
    '  gl_Position = vec4(a_pos, 0.0, 1.0);\n' +
    '}'

  // HEAD WebGL2 (TUTTE le uniform, in/out, helper)
  this.HEAD = '#version 300 es\n' +
    'precision highp float;\n' +
    'in vec2 v_uv;\n' +
    'out vec4 FragColor;\n' +
    'uniform sampler2D u_tex;\n' +
    'uniform sampler2D u_prev;\n' +
    'uniform vec2 u_res;\n' +
    'uniform float u_time;\n' +
    'uniform float u_int;\n' +
    'uniform float u_bass;\n' +
    'uniform float u_mid;\n' +
    'uniform float u_high;\n' +
    'uniform float u_vol;\n' +
    'uniform float u_drop;\n' +
    'uniform float u_dscroll;\n' +
    'uniform float u_flash;\n' +
    'uniform float u_regime;\n' +
    'uniform float u_strobe;\n' +
    'uniform vec4 u_pa;\n' +
    'uniform vec4 u_pb;\n' +
    'uniform float u_wave[16];\n' +
    // Face tracking: bocca/occhi/rotazione/posizione
    // u_face  = (mouthOpen, eyeOpen, blink, blinkEdge)
    // u_face2 = (faceX, faceY, roll, faceScale)
    'uniform vec4 u_face;\n' +
    'uniform vec4 u_face2;\n' +

    // Helper functions
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n' +
    'float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}\n' +
    'float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<3;i++){v+=a*vnoise(p);p*=2.03;a*=.5;}return v;}\n' +
    'vec3 hue(vec3 c,float a){const vec3 k=vec3(.57735);float ca=cos(a),sa=sin(a);return c*ca+cross(k,c)*sa+k*dot(k,c)*(1.-ca);}\n' +
    'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}\n' +
    'vec3 ramp(float t){return mix(mix(vec3(.07,.6,.8),vec3(.95,.45,.5),smoothstep(.3,.6,t)),vec3(1.),smoothstep(.7,1.,t));}\n' +
    'vec2 dropUV(vec2 uv){if(u_drop<.5)return uv;float y=fract(uv.y+u_dscroll);float cx=floor(uv.x*60.);float x=fract(cx/60.+floor(hash(vec2(cx,floor(y*24.)))*3.)/60.);return vec2(x,y);}\n' +
    'vec2 warp(vec2 uv,float t,float amp){vec2 w=vec2(fbm(uv*3.+t),fbm(uv*3.-t))-.5;return uv+w*amp;}\n' +

    // permute e cellular2x2x2 (per Worley)
    'vec4 permute(vec4 x){return mod((34.0*x+1.0)*x,289.0);}\n' +
    'vec3 permute(vec3 x){return mod((34.0*x+1.0)*x,289.0);}\n' +
    'vec2 cellular2x2x2(vec3 P){const float K=0.142857142857;const float Ko=0.428571428571;const float K2=0.020408163265306;const float Kz=0.166666666667;const float Kzo=0.416666666667;const float jitter=0.8;vec3 Pi=mod(floor(P),289.0);vec3 Pf=fract(P);vec4 Pfx=Pf.x+vec4(0.0,-1.0,0.0,-1.0);vec4 Pfy=Pf.y+vec4(0.0,0.0,-1.0,-1.0);vec4 p=permute(Pi.x+vec4(0.0,1.0,0.0,1.0));p=permute(p+Pi.y+vec4(0.0,0.0,1.0,1.0));vec4 p1=permute(p+Pi.z);vec4 p2=permute(p+Pi.z+vec4(1.0));vec4 ox1=fract(p1*K)-Ko;vec4 oy1=mod(floor(p1*K),7.0)*K-Ko;vec4 oz1=floor(p1*K2)*Kz-Kzo;vec4 ox2=fract(p2*K)-Ko;vec4 oy2=mod(floor(p2*K),7.0)*K-Ko;vec4 oz2=floor(p2*K2)*Kz-Kzo;vec4 dx1=Pfx+jitter*ox1;vec4 dy1=Pfy+jitter*oy1;vec4 dz1=Pf.z+jitter*oz1;vec4 dx2=Pfx+jitter*ox2;vec4 dy2=Pfy+jitter*oy2;vec4 dz2=Pf.z-1.0+jitter*oz2;vec4 d1=dx1*dx1+dy1*dy1+dz1*dz1;vec4 d2=dx2*dx2+dy2*dy2+dz2*dz2;vec4 d=min(d1,d2);d2=max(d1,d2);d.xy=(d.x<d.y)?d.xy:d.yx;d.xz=(d.x<d.z)?d.xz:d.zx;d.xw=(d.x<d.w)?d.xw:d.wx;d.yzw=min(d.yzw,d2.yzw);d.y=min(d.y,d.z);d.y=min(d.y,d.w);d.y=min(d.y,d2.x);return sqrt(d.xy);}\n' +

    // voronoi (usa hash e u_time)
    'float voronoi(vec2 p,out vec2 id){vec2 i=floor(p),f=fract(p);float md=8.;id=vec2(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=vec2(hash(i+g),hash(i+g+7.7));o=.5+.5*sin(u_time*.6+6.2831*o);float d=length(g+o-f);if(d<md){md=d;id=i+g;}}return md;}\n'

  this.progs = {}
}

GLEngine.prototype.makeTex = function () {
  const gl = this.gl
  const t = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return t
}

GLEngine.prototype.makeFBO = function () {
  const gl = this.gl
  return { tex: this.makeTex(), fb: gl.createFramebuffer() }
}

GLEngine.prototype.linkProgram = function (vs0, fs0, name) {
  const gl = this.gl
  const vs = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vs, vs0)
  gl.compileShader(vs)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fs, fs0)
  gl.compileShader(fs)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn('GLEngine shader fail:', name, gl.getShaderInfoLog(fs))
    return null
  }
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.warn('GLEngine vertex shader fail:', name, gl.getShaderInfoLog(vs))
    return null
  }
  const p = gl.createProgram()
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('GLEngine link fail:', name, gl.getProgramInfoLog(p))
    return null
  }
  return p
}

GLEngine.prototype.shadersDir = function () {
  return 'shaders'
}

GLEngine.prototype.loadCustomShaders = async function () {
  if (!this.ok) return
  if (!window.api || !window.api.fs) {
    console.warn('[GLEngine] window.api.fs non disponibile, shaders non caricati')
    return
  }
  // window.location.href = file:///…/sources/index.html → /…/sources
  const baseUrl = window.location.href.replace('file://', '').replace(/\/[^\/]*$/, '')
  const fullDir = baseUrl + '/' + this.shadersDir()
  console.log('[GLEngine] Shader dir:', fullDir)
  try {
    const files = await window.api.fs.readdirSync(fullDir)
    if (!files || !files.length) {
      console.warn('[GLEngine] Nessun file shader trovato in:', fullDir)
      return
    }
    const fragFiles = files.filter(f => /\.frag$/i.test(f))
    console.log('[GLEngine] Shaders found:', fragFiles)
    for (const f of fragFiles) {
      await this.compileCustom(fullDir + '/' + f, f.replace(/\.frag$/i, ''))
    }
  } catch (e) { console.error('[GLEngine] Error loading shaders:', e) }
}

GLEngine.prototype.compileCustom = async function (filePath, name) {
  if (!window.api || !window.api.fs) return
  try {
    const src = await window.api.fs.readFileSync(filePath, 'utf8')
    if (!src) return
    // Se il file non inizia con #version, aggiungi il HEAD
    const fullSrc = src.trim().startsWith('#version') ? src : this.HEAD + '\n' + src
    const p = this.linkProgram(this.VERT, fullSrc, name)
    if (p) {
      console.log('[GLEngine] Loaded:', name)
      this.progs[name] = p
    } else {
      console.error('[GLEngine] Failed to load shader:', name)
    }
  } catch (e) { console.error('[GLEngine] Error reading shader:', filePath, e) }
}

GLEngine.prototype.bindQuad = function (prog) {
  const gl = this.gl
  gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
  const loc = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
}

GLEngine.prototype.resize = function (W, H) {
  const gl = this.gl
  this.canvas.width = W; this.canvas.height = H
  for (const f of [this.fboOut, this.fboTmp, this.fboPrev]) {
    gl.bindTexture(gl.TEXTURE_2D, f.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0)
  }
  gl.bindTexture(gl.TEXTURE_2D, this.texScene)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

GLEngine.prototype.render = function (scene, info) {
  if (!this.ok || !this.chain.length) return false
  const gl = this.gl
  const W = scene.width, H = scene.height
  // QUALITÀ ADATTIVA: la catena può girare a risoluzione interna ridotta
  // (this.quality, 0.5–1.0). Tutti i pass shader costano in proporzione ai
  // pixel, quindi 0.7× ≈ metà del lavoro. L'upscale è gratis: il canvas viene
  // disegnato nel feed con una drawImage che scala (filtro LINEARE della GPU).
  // È client.update() che alza/abbassa `quality` in base agli fps misurati.
  const q = (this.quality != null ? this.quality : 1)
  const RW = Math.max(160, Math.round(W * q))
  const RH = Math.max(90, Math.round(H * q))
  if (this.canvas.width !== RW || this.canvas.height !== RH) this.resize(RW, RH)

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.bindTexture(gl.TEXTURE_2D, this.texScene)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)

  if (this.seedPrev) {
    gl.useProgram(this.progs.copy)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrev.fb)
    gl.viewport(0, 0, RW, RH)
    this.bindQuad(this.progs.copy)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texScene)
    gl.uniform1i(gl.getUniformLocation(this.progs.copy, 'u_tex'), 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    this.seedPrev = false
  }

  const now = performance.now()
  const hasBroken = this.chain.some(f => f.name === 'brokentv')
  if (this.phase === 'wave' && now > this.nextSwitch) {
    this.phase = 'drop'
    this.nextSwitch = now + (hasBroken ? 900 + Math.random() * 1200 : 700 + Math.random() * 900)
  } else if (this.phase === 'drop' && now > this.nextSwitch) {
    this.phase = 'wave'
    this.nextSwitch = now + (hasBroken ? 1200 + Math.random() * 2000 : 3000 + Math.random() * 5000)
  }
  let dscroll = 0
  if (this.phase === 'drop') {
    this.dropRaw += 0.02 * (1 + (info.vol || 0))
    dscroll = Math.floor(this.dropRaw * 40) / 40
  }
  const beatPhase = info.beat % 1
  const strobe = ((info.regime || 0) >= 1 && (info.high || 0) > 0.5 && beatPhase < 0.08) ? 1 : 0
  // Flash = transienti audio + note dello score MIDI generato da Orca + ammiccamento face tracking
  const audioFlash = ((info.high || 0) > 0.45 && Math.sin(info.beat * 6.2831) > 0.92) ? 1 : 0
  const flash = Math.max(audioFlash, Math.min(1, info.scoreFlash || 0), Math.min(1, info.faceFlash || 0))

  let input = this.texScene
  for (let i = 0; i < this.chain.length; i++) {
    const f = this.chain[i]
    const prog = this.progs[f.name]
    if (!prog) continue
    // Ping-pong tra fboTmp e fboOut: con 3+ effetti il target non può essere
    // sempre fboTmp (input==target → feedback loop). Ogni effetto alterna.
    const target = (i % 2 === 0) ? this.fboTmp : this.fboOut
    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb)
    gl.viewport(0, 0, RW, RH)
    this.bindQuad(prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, input)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.fboPrev.tex)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_prev'), 1)
    gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), RW, RH)
    // seed = primo valore fx: (0-1, da 0-999). Randomizza 3 parametri dello shader via hash.
    const seed = f.seed !== undefined ? f.seed : 0.4
    gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), info.beat)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_int'), seed)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_bass'), info.bass || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_mid'), info.mid || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_high'), info.high || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_vol'), info.vol || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_drop'), this.phase === 'drop' ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_dscroll'), dscroll)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_flash'), flash)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_regime'), info.regime || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_strobe'), strobe)
    // Contratto 10 parametri:
    // u_pa.xyzw = bande audio p0-p3 (7 filtri random sullo spettro)
    // u_pb.xyz  = bande audio p4-p6
    // u_pb.w    = drive audio capture (0-1, dal 2° valore fx:)
    gl.uniform4f(gl.getUniformLocation(prog, 'u_pa'), info.p0 || 0, info.p1 || 0, info.p2 || 0, info.p3 || 0)
    gl.uniform4f(gl.getUniformLocation(prog, 'u_pb'), info.p4 || 0, info.p5 || 0, info.p6 || 0, (f.drive || 400) / 1000)
    // Face tracking (0 se assente) — mappatura default:
    // u_face  = (bocca aperta, occhio aperto, ammiccamento, ammiccamento-edge)
    // u_face2 = (posX viso, posY viso, roll testa, scala viso)
    gl.uniform4f(gl.getUniformLocation(prog, 'u_face'), info.fMouth || 0, info.fEye || 0, info.fBlink || 0, info.fBlinkEdge || 0)
    gl.uniform4f(gl.getUniformLocation(prog, 'u_face2'), info.fX || 0, info.fY || 0, info.fRoll || 0, info.fScale || 0)
    // Profilo RMS temporale (16 finestre) per shader tipo ameba/pixel fall
    const waveLoc = gl.getUniformLocation(prog, 'u_wave')
    if (waveLoc) {
      const wave = (info.wave && info.wave.length === 16) ? info.wave : new Float32Array(16)
      gl.uniform1fv(waveLoc, wave)
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    input = target.tex
  }

  const copy = this.progs.copy
  gl.useProgram(copy)
  this.bindQuad(copy)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, input)
  gl.uniform1i(gl.getUniformLocation(copy, 'u_tex'), 0)
  // Unbind TEXTURE1 (fboPrev.tex) PRIMA di scrivere su fboPrev:
  // altrimenti WebGL rileva un feedback loop framebuffer↔texture ad ogni frame.
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, null)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, RW, RH)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrev.fb)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return true
}
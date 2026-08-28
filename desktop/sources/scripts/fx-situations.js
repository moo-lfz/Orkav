'use strict'

function GLEngine () {
  this.canvas = document.createElement('canvas')
  this.gl = this.canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance' })
  this.chain = []
  this.ok = !!this.gl
  this.phase = 'wave'
  this.nextSwitch = 0
  this.dropRaw = 0
  this.seedPrev = false
  if (!this.ok) { console.warn('GLEngine', 'WebGL non disponibile, fallback 2D'); return }
  this.build()
  this.loadCustomShaders()
}

GLEngine.prototype.setChain = function (arr) {
  this.chain = (arr || []).filter(f => this.progs[f.name]).slice(0, 2)
  this.seedPrev = this.chain.length > 0
}

GLEngine.prototype.build = function () {
  const gl = this.gl
  this.buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  this.texScene = this.makeTex()
  this.fboOut = this.makeFBO()
  this.fboTmp = this.makeFBO()
  this.fboPrev = this.makeFBO()

  this.VERT = 'attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0.,1.);}'

  // HEAD: hash/vnoise/fbm/hue/warp/dropUV + rot + voronoi (Hydra-style, open source)
  this.HEAD = 'precision highp float;varying vec2 v_uv;' +
    'uniform sampler2D u_tex;uniform sampler2D u_prev;uniform vec2 u_res;' +
    'uniform float u_time;uniform float u_int;uniform float u_bass;uniform float u_mid;uniform float u_high;uniform float u_vol;uniform float u_drop;uniform float u_dscroll;uniform float u_flash;uniform float u_regime;' +
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}' +
    'float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<3;i++){v+=a*vnoise(p);p*=2.03;a*=.5;}return v;}' +
    'vec3 hue(vec3 c,float a){const vec3 k=vec3(.57735);float ca=cos(a),sa=sin(a);return c*ca+cross(k,c)*sa+k*dot(k,c)*(1.-ca);}' +
    'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}' +
    'vec2 dropUV(vec2 uv){if(u_drop<.5)return uv;float y=fract(uv.y+u_dscroll);float cx=floor(uv.x*60.);float x=fract(cx/60.+floor(hash(vec2(cx,floor(y*24.)))*3.)/60.);return vec2(x,y);}' +
    'vec2 warp(vec2 uv,float t,float amp){vec2 w=vec2(fbm(uv*3.+t),fbm(uv*3.-t))-.5;return uv+w*amp;}' +
    'float voronoi(vec2 p,out vec2 id){vec2 i=floor(p),f=fract(p);float md=8.;id=vec2(0.);' +
    'for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));' +
    'vec2 o=vec2(hash(i+g),hash(i+g+7.7));o=.5+.5*sin(u_time*.6+6.2831*o);' +
    'float d=length(g+o-f);if(d<md){md=d;id=i+g;}}return md;}'

  const FRAGS = {
    copy: 'void main(){gl_FragColor=texture2D(u_tex,v_uv);}',

    // DATAMOSH: smear di moto a 2 direzioni + warp + hue + rgb split
    datamosh: 'void main(){vec2 uv=dropUV(v_uv);vec4 cur=texture2D(u_tex,uv);' +
      'vec2 w=warp(uv,u_time*.7,.1*u_int*(.4+u_bass));vec4 pr=texture2D(u_prev,w);' +
      'float d=length(cur.rgb-pr.rgb);float m=smoothstep(.04,.4,d);' +
      'vec3 col=mix(cur.rgb,pr.rgb,clamp(m*(.5+.6*u_vol),0.,1.));' +
      'vec4 pr2=texture2D(u_prev,uv+vec2(0.,.01)*u_int*m);col=mix(col,pr2.rgb,m*.4);' +
      'col=hue(col,sin(u_time*.5)*.7*u_int);' +
      'float rs=.003+.015*u_high;' +
      'col.r=mix(col.r,texture2D(u_tex,uv+vec2(rs,0.)).r,.6);' +
      'col.b=mix(col.b,texture2D(u_tex,uv-vec2(rs,0.)).b,.6);' +
      'gl_FragColor=vec4(col,1.);}',

    // DISPLACE: domain warp + ridge + rotazione + tear fini + ghost (non solo onda)
    displace: 'void main(){vec2 uv=dropUV(v_uv);float t=u_time*.5;vec2 p=uv*2.;' +
      'vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));' +
      'float ridge=1.-abs(2.*fbm(p*1.5+q*2.)-1.);' +
      'vec2 r=vec2(fbm(p+q*2.+t*.7),fbm(p+q*2.+vec2(8.1,3.7)));' +
      'float ang=(ridge-.5)*2.*u_int;vec2 off=(r-.5)*.4*u_int*(.5+u_mid);off=rot(ang*.6)*off;' +
      'float line=step(.97,hash(vec2(floor(uv.y*200.),floor(t*8.))));' +
      'off+=vec2(line*(hash(vec2(floor(uv.y*200.)))-.5)*.2*u_int,0.);' +
      'vec3 col=texture2D(u_tex,clamp(uv+off,0.,1.)).rgb;' +
      'col=mix(col,texture2D(u_tex,clamp(uv-off*.5,0.,1.)).rgb,.35);' +
      'col=hue(col,ridge*1.6*u_int);' +
      'gl_FragColor=vec4(col,1.);}',

    // GLITCH: tear multi-scala (1px -> mezza riga) + swap + scanline + invert
    glitch: 'void main(){vec2 uv=dropUV(v_uv);' +
      'float tk=floor(u_time*(8.+u_regime*8.));' +
      'float sel=hash(vec2(floor(uv.y*8.),tk*1.3));' +
      'float rows=sel<.4?120.:(sel<.75?40.:8.);' +
      'float bl=floor(uv.y*rows);float g=step(.5,hash(vec2(bl,tk)));' +
      'float amp=rows>100.?.01:(rows>20.?.06:.25);' +
      'float sh=(hash(vec2(bl,tk*1.7))-.5)*amp*2.*u_int*g;' +
      'vec2 guv=clamp(uv+vec2(sh,0.),0.,1.);float rs=.004+.02*u_high;vec3 c;' +
      'c.r=texture2D(u_tex,guv+vec2(rs,0.)).r;c.g=texture2D(u_tex,guv).g;c.b=texture2D(u_tex,guv-vec2(rs,0.)).b;' +
      'if(hash(vec2(bl,tk*.5))>.8){c=c.bgr;}' +
      'c*=.9+.1*step(.5,fract(uv.y*u_res.y*.5));' +
      'if(u_flash>.5){c=1.-c;}' +
      'gl_FragColor=vec4(c,1.);}',

    // FRACTURE: poligoni voronoi a 2 scale, offset lineari quantizzati, edge invert
    fracture: 'void main(){vec2 uv=dropUV(v_uv);' +
      'vec2 id;float d1=voronoi(uv*vec2(8.,6.),id);' +
      'vec2 id2;float d2=voronoi(uv*vec2(20.,14.)+3.7,id2);' +
      'float h1=hash(id);float h2=hash(id2);float tk=floor(u_time*(2.+u_regime*4.));' +
      'vec2 o1=(vec2(h1,hash(id+3.1))-.5)*step(.45,hash(id+tk))*vec2(.35,.12)*u_int*(.5+u_bass);o1=floor(o1*32.)/32.;' +
      'vec2 o2=(vec2(h2,hash(id2+5.7))-.5)*step(.6,hash(id2+tk))*vec2(.12,.05)*u_int;o2=floor(o2*48.)/48.;' +
      'vec3 col=texture2D(u_tex,clamp(uv+o1+o2,0.,1.)).rgb;' +
      'float edge=smoothstep(0.,.08,abs(d1-.5));' +
      'col=mix(col,1.-col,(1.-edge)*.6*step(.5,hash(id+9.)));' +
      'col=floor(col*5.)/5.;col=hue(col,h1*.9);' +
      'gl_FragColor=vec4(col,1.);}',

    // BROKENTV: feedback max-blend + voronoi tear + rolling + static + flash
    brokentv: 'void main(){vec2 uv=dropUV(v_uv);' +
      'vec2 id;float d=voronoi(uv*vec2(6.,5.),id);' +
      'float tk=floor(u_time*14.);' +
      'float sh=(hash(vec2(floor(uv.y*24.),tk))-.5)*.4*u_int;' +
      'vec2 off=vec2(sh,0.)+(vec2(hash(id),hash(id+3.))-.5)*.1*u_int*step(.6,hash(id+tk));' +
      'vec2 tuv=clamp(uv+off,0.,1.);' +
      'vec3 cur=texture2D(u_tex,tuv).rgb;vec3 pr=texture2D(u_prev,tuv+vec2(0.,.004)).rgb;' +
      'vec3 col=max(cur,pr*(.5+.4*u_vol));' +
      'col+=(hash(uv*u_res.y+u_time)-.5)*.18;' +
      'float bar=smoothstep(.45,.5,abs(fract(uv.y-u_time*.15)-.5));' +
      'col*=.85+.3*bar;' +
      'if(u_flash>.5){col=1.-col;}' +
      'col=hue(col,sin(u_time*.7)*.4);' +
      'gl_FragColor=vec4(col,1.);}'
  }

  this.progs = {}
  for (const name in FRAGS) {
    this.progs[name] = this.linkProgram(this.VERT, this.HEAD + FRAGS[name], name)
  }
}

GLEngine.prototype.linkProgram = function (vertSrc, fragSrc, name) {
  const gl = this.gl
  const vs = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vs, vertSrc)
  gl.compileShader(vs)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fs, fragSrc)
  gl.compileShader(fs)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn('GLEngine', 'shader fail:', name, gl.getShaderInfoLog(fs))
    return null
  }
  const p = gl.createProgram()
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  return p
}

GLEngine.prototype.shadersDir = function () {
  try {
    const path = require('path')
    const base = require('electron').remote.app.getAppPath()
    return path.join(base, 'sources', 'shaders')
  } catch (e) {
    try { return require('path').join(process.cwd(), 'sources', 'shaders') } catch (e2) { return null }
  }
}

GLEngine.prototype.loadCustomShaders = function () {
  if (!this.ok) { return }
  const dir = this.shadersDir()
  if (!dir) { return }
  const fs = require('fs')
  const path = require('path')
  try {
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }) }
    const files = fs.readdirSync(dir).filter(f => /\.frag$/i.test(f))
    for (const f of files) { this.compileCustom(path.join(dir, f)) }
    fs.watch(dir, (evt, fname) => {
      if (!fname || !/\.frag$/i.test(fname)) { return }
      clearTimeout(this.watchTimer)
      this.watchTimer = setTimeout(() => { this.compileCustom(path.join(dir, fname)) }, 300)
    })
    console.log('GLEngine', 'shader disponibili:', Object.keys(this.progs).join(', '))
  } catch (e) { console.warn('GLEngine', 'cartella shader:', e.message) }
}

GLEngine.prototype.compileCustom = function (file) {
  const fs = require('fs')
  const name = file.split(/[\\/]/).pop().replace(/\.frag$/i, '')
  let src = ''
  try { src = fs.readFileSync(file, 'utf8') } catch (e) { return }
  const p = this.linkProgram(this.VERT, this.HEAD + '\n' + src, name)
  if (p) {
    this.progs[name] = p
    console.log('GLEngine', 'shader caricato/aggiornato:', name)
  }
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
  const tex = this.makeTex()
  const fb = gl.createFramebuffer()
  return { tex: tex, fb: fb }
}

GLEngine.prototype.resize = function (W, H) {
  const gl = this.gl
  this.canvas.width = W
  this.canvas.height = H
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

GLEngine.prototype.bindQuad = function (prog) {
  const gl = this.gl
  gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
  const loc = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
}

GLEngine.prototype.render = function (scene, info) {
  if (!this.ok || !this.chain.length) { return false }
  const gl = this.gl
  const W = scene.width
  const H = scene.height
  if (this.canvas.width !== W || this.canvas.height !== H) { this.resize(W, H) }

  gl.bindTexture(gl.TEXTURE_2D, this.texScene)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene)

  if (this.seedPrev) {
    gl.useProgram(this.progs.copy)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrev.fb)
    gl.viewport(0, 0, W, H)
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
  const flash = ((info.high || 0) > 0.3 && Math.sin(info.beat * 12.7) > 0.6) ? 1 : 0

  let input = this.texScene
  for (let i = 0; i < this.chain.length; i++) {
    const f = this.chain[i]
    const prog = this.progs[f.name]
    if (!prog) { continue }
    const target = (i === this.chain.length - 1) ? this.fboOut : this.fboTmp
    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb)
    gl.viewport(0, 0, W, H)
    this.bindQuad(prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, input)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.fboPrev.tex)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_prev'), 1)
    gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), W, H)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), info.beat)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_int'), (f.seed || 333) / 666)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_bass'), info.bass || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_mid'), info.mid || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_high'), info.high || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_vol'), info.vol || 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_drop'), this.phase === 'drop' ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_dscroll'), dscroll)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_flash'), flash)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_regime'), info.regime || 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    input = target.tex
  }

  const copy = this.progs.copy
  gl.useProgram(copy)
  this.bindQuad(copy)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, input)
  gl.uniform1i(gl.getUniformLocation(copy, 'u_tex'), 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, W, H)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrev.fb)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return true
}
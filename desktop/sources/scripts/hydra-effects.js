'use strict'

function HydraEffects () {
  this.canvas = document.createElement('canvas')
  this.gl = this.canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: true })
  this.activeChain = []
  this.time = 0

  if (!this.gl) {
    console.warn('HydraEffects', 'WebGL non supportato')
    return
  }

  this.initShaders()
  this.initFramebuffers()
}

HydraEffects.prototype.initShaders = function () {
  const gl = this.gl
  const vertexSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `

  const fragmentSources = {
    blit: `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_source;
      void main() {
        gl_FragColor = texture2D(u_source, v_texCoord);
      }`,
        datamosh: `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_source;
      uniform sampler2D u_history;
      uniform float u_time;
      uniform float u_p1, u_p2, u_p3, u_p4;
      void main() {
        vec4 curr = texture2D(u_source, v_texCoord);
        
        // Movimento ondulatorio fluido
        float waveFreq = 5.0 + u_p3 * 20.0;
        float waveAmp = u_p1 * 0.02;
        float speed = 2.0 + u_p4 * 8.0;
        
        vec2 warp = v_texCoord;
        warp.x += sin(u_time * speed + v_texCoord.y * waveFreq) * waveAmp;
        warp.y += cos(u_time * speed * 0.7 + v_texCoord.x * waveFreq) * waveAmp;
        
        vec4 hist = texture2D(u_history, warp);
        
        // Dissolvenza dinamica basata sulla differenza
        float diff = length(curr.rgb - hist.rgb);
        float threshold = 0.01 + u_p4 * 0.05;
        float mixFactor = smoothstep(0.0, threshold, diff) * (u_p2 * 0.8);
        
        // Shift cromatico sui bordi
        if (diff > threshold * 0.5) {
          float shift = u_p1 * 0.01;
          curr.r = texture2D(u_source, v_texCoord + vec2(shift, 0.0)).r;
          curr.b = texture2D(u_source, v_texCoord - vec2(shift, 0.0)).b;
        }
        
        gl_FragColor = mix(curr, hist, mixFactor);
      }`,
    glitch: `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_source;
      uniform float u_time;
      uniform float u_p1, u_p2, u_p3, u_p4;
      float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }
      void main() {
        vec2 uv = v_texCoord;
        float block = floor(uv.y * (666.0 / max(u_p1, 1.0))) / (666.0 / max(u_p1, 1.0));
        float r = rand(vec2(block, floor(u_time * 10.0)));
        if (r < (u_p4 * 0.0015)) {
          uv.x += (u_p3 * 0.0003) * (r - 0.5);
        }
        vec4 col = texture2D(u_source, uv);
        vec3 inv = vec3(1.0) - col.rgb;
        inv = mix(inv, vec3(0.45, 0.87, 0.76), 0.3);
        gl_FragColor = vec4(mix(col.rgb, inv, u_p2 * 0.0015), col.a);
      }`,
    particle: `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_source;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_p1, u_p2, u_p3, u_p4;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 pixelCoord = v_texCoord * u_resolution;
        float size = max(u_p2, 1.0);
        vec2 blockUV = floor(pixelCoord / size) * size / u_resolution;
        float rnd = hash(blockUV + floor(u_time * 3.0));
        float trigger = fract(rnd + u_time * 0.5);
        if (trigger < (u_p4 * 0.0015)) {
          float gravity = (u_p1 * 0.0015) - 0.5;
          float dispersion = (rnd - 0.5) * (u_p3 * 0.0003);
          vec2 newUV = v_texCoord + vec2(dispersion, gravity * (u_p4 * 0.0015));
          gl_FragColor = texture2D(u_source, newUV);
        } else {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }
      }`,
    displace: `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_source;
      uniform float u_time;
      uniform float u_p1, u_p2, u_p3, u_p4;
      float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float freq = u_p3 * 0.015;
        float speed = u_p2 * 0.005;
        float n = noise(v_texCoord * freq + u_time * speed);
        n = pow(n, 1.0 + (u_p4 * 0.003));
        vec2 disp = vec2(n - 0.5, n - 0.5) * (u_p1 * 0.0003);
        gl_FragColor = texture2D(u_source, v_texCoord + disp);
      }`
  }

  this.programs = {}
  for (const name in fragmentSources) {
    const vertShader = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vertShader, vertexSource)
    gl.compileShader(vertShader)

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fragShader, fragmentSources[name])
    gl.compileShader(fragShader)

    const prog = gl.createProgram()
    gl.attachShader(prog, vertShader)
    gl.attachShader(prog, fragShader)
    gl.linkProgram(prog)
    this.programs[name] = prog
  }

  this.positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
  this.texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0])
}

HydraEffects.prototype.initFramebuffers = function () {
  const gl = this.gl

  this.sourceTexture = gl.createTexture()
  this.historyTexture = gl.createTexture()

  this.fbA = { texture: gl.createTexture(), framebuffer: gl.createFramebuffer() }
  this.fbB = { texture: gl.createTexture(), framebuffer: gl.createFramebuffer() }
  this.historyFb = { framebuffer: gl.createFramebuffer() }

  const texs = [this.sourceTexture, this.historyTexture, this.fbA.texture, this.fbB.texture]
  for (let i = 0; i < texs.length; i++) {
    gl.bindTexture(gl.TEXTURE_2D, texs[i])
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }
}

HydraEffects.prototype.resize = function (width, height) {
  this.canvas.width = width
  this.canvas.height = height
  const gl = this.gl
  gl.viewport(0, 0, width, height)

  const texs = [this.sourceTexture, this.historyTexture, this.fbA.texture, this.fbB.texture]
  for (let i = 0; i < texs.length; i++) {
    gl.bindTexture(gl.TEXTURE_2D, texs[i])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA.framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbA.texture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbB.framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbB.texture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, this.historyFb.framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.historyTexture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

HydraEffects.prototype.setChain = function (chainArray) {
  this.activeChain = chainArray.slice(0, 8)
  console.log('FX Chain:', this.activeChain)
}

HydraEffects.prototype.render = function (sourceCanvas) {
  const gl = this.gl

  if (this.canvas.width !== sourceCanvas.width || this.canvas.height !== sourceCanvas.height) {
    this.resize(sourceCanvas.width, sourceCanvas.height)
  }

  gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas)

  if (this.activeChain.length === 0) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.blitTexture(this.sourceTexture)
    this.blitTextureToFb(this.sourceTexture, this.historyFb)
    return
  }

  let readTex = this.sourceTexture
  let writeFb = this.fbA

  this.time += 0.016

  for (let i = 0; i < this.activeChain.length; i++) {
    const fx = this.activeChain[i]
    const prog = this.programs[fx.name]
    if (!prog) { continue }

    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFb.framebuffer)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, readTex)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_source'), 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.historyTexture)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_history'), 1)

    gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), this.time)
    gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), this.canvas.width, this.canvas.height)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_p1'), fx.p1)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_p2'), fx.p2)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_p3'), fx.p3)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_p4'), fx.p4)

    this.drawQuad(gl, prog)

    readTex = writeFb.texture
    writeFb = (writeFb === this.fbA) ? this.fbB : this.fbA
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  this.blitTexture(readTex)

  this.blitTextureToFb(readTex, this.historyFb)
}

HydraEffects.prototype.blitTexture = function (tex) {
  const gl = this.gl
  const prog = this.programs['blit']
  gl.useProgram(prog)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.uniform1i(gl.getUniformLocation(prog, 'u_source'), 0)
  this.drawQuad(gl, prog)
}

HydraEffects.prototype.blitTextureToFb = function (tex, fb) {
  const gl = this.gl
  const prog = this.programs['blit']
  gl.useProgram(prog)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.framebuffer)
  gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.uniform1i(gl.getUniformLocation(prog, 'u_source'), 0)
  this.drawQuad(gl, prog)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

HydraEffects.prototype.drawQuad = function (gl, prog) {
  const posLoc = gl.getAttribLocation(prog, 'a_position')
  const posBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
  gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

  const texLoc = gl.getAttribLocation(prog, 'a_texCoord')
  const texBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuf)
  gl.bufferData(gl.ARRAY_BUFFER, this.texCoords, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(texLoc)
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0)

  gl.drawArrays(gl.TRIANGLES, 0, 6)
  gl.deleteBuffer(posBuf)
  gl.deleteBuffer(texBuf)
}
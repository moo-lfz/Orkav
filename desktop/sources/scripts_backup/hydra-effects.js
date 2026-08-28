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
  
  // FIX CRITICO: Flip verticale per allineare WebGL a Canvas 2D
  const vertexSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y);
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
      uniform float u_seed;
      
      void main() {
        float intensity = u_seed / 666.0;
        vec2 uv = v_texCoord;
        vec4 curr = texture2D(u_source, uv);
        
        // Optical flow approssimato
        vec2 mv = vec2(
          texture2D(u_source, uv + vec2(0.01, 0.0)).r - texture2D(u_source, uv - vec2(0.01, 0.0)).r,
          texture2D(u_source, uv + vec2(0.0, 0.01)).r - texture2D(u_source, uv - vec2(0.0, 0.01)).r
        );
        
        // Warp fluido
        uv += mv * intensity * 0.8 + vec2(sin(u_time * 2.0) * 0.01, cos(u_time * 1.5) * 0.01);
        vec4 hist = texture2D(u_history, uv);
        
        gl_FragColor = mix(curr, hist, intensity * 0.85);
      }`,

    glitch: `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_source;
      uniform float u_time;
      uniform float u_seed;
      
      void main() {
        float intensity = u_seed / 666.0;
        vec2 uv = v_texCoord;
        
        // Block displacement
        float blockFreq = 10.0 + intensity * 30.0;
        float block = floor(uv.y * blockFreq);
        float offset = sin(block * 12.9898 + u_time * 5.0) * 0.02 * intensity;
        uv.x += offset;
        
        // RGB Split aggressivo
        float r = texture2D(u_source, uv + vec2(intensity * 0.03, 0.0)).r;
        float g = texture2D(u_source, uv).g;
        float b = texture2D(u_source, uv - vec2(intensity * 0.03, 0.0)).b;
        vec3 col = vec3(r, g, b);
        
        // Strobe inversion
        float strobe = sin(u_time * (10.0 + intensity * 20.0));
        if (strobe > 0.8) {
          col = 1.0 - col;
          col = mix(col, vec3(0.45, 0.87, 0.76), 0.5); // Tinge di turchese
        }
        
        gl_FragColor = vec4(col, 1.0);
      }`,

    particle: `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_source;
      uniform float u_time;
      uniform float u_seed;
      
      void main() {
        float intensity = u_seed / 666.0;
        vec2 uv = v_texCoord;
        
        // Griglia di disintegrazione
        float gridSize = 20.0 + intensity * 40.0;
        vec2 grid = floor(uv * gridSize) / gridSize;
        float n = fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453);
        
        // Trigger stroboscopico
        float trigger = step(0.7, n) * step(0.5, sin(u_time * 3.0 + n * 10.0));
        
        if (trigger > 0.5) {
          uv += vec2((n - 0.5) * intensity * 0.15, intensity * 0.3 * sin(u_time * 2.0 + n * 5.0));
        }
        
        gl_FragColor = texture2D(u_source, uv);
      }`,

    displace: `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_source;
      uniform float u_time;
      uniform float u_seed;
      
      void main() {
        float intensity = u_seed / 666.0;
        vec2 uv = v_texCoord;
        
        // Noise organico multi-direzionale
        float n1 = sin(uv.x * 15.0 + u_time * 2.0) * cos(uv.y * 15.0 + u_time * 1.5);
        float n2 = cos(uv.x * 10.0 - u_time) * sin(uv.y * 10.0 + u_time);
        
        vec2 disp = vec2(n1, n2) * intensity * 0.08;
        
        // Rotazione del displacement
        float angle = n1 * 3.14159 * intensity;
        vec2 rotDisp = vec2(
          disp.x * cos(angle) - disp.y * sin(angle),
          disp.x * sin(angle) + disp.y * cos(angle)
        );
        
        gl_FragColor = texture2D(u_source, uv + rotDisp);
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
  this.activeChain = chainArray.slice(0, 7)
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
    if (!prog) continue

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
    gl.uniform1f(gl.getUniformLocation(prog, 'u_seed'), fx.seed)

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
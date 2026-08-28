'use strict'
/* global library, Acels, Source, History, Orca, IO, Cursor, Commander, Clock, Theme, AudioReactor, GLEngine, Background */

function Client () {
  this.version = 178
  this.library = library
  this.theme = new Theme(this)
  this.acels = new Acels(this)
  this.source = new Source(this)
  this.history = new History(this)
  this.orca = new Orca(this.library)
  this.io = new IO(this)
  this.cursor = new Cursor(this)
  this.commander = new Commander(this)
  this.clock = new Clock(this)

  this.audioReactor = new AudioReactor()
  this.fxManager = new GLEngine()
  this.background = new Background(this)

  this.scale = 1
  this.grid = { w: 8, h: 8 }
  this.tile = { w: +localStorage.getItem('tilew') || 10, h: +localStorage.getItem('tileh') || 15 }
  this.guide = false

  this.el = document.createElement('canvas')
  this.context = this.el.getContext('2d')
  this.sceneEl = document.createElement('canvas')
  this.sceneCtx = this.sceneEl.getContext('2d')

  this.fxTextMode = false; this.fxTextBuffer = ''
  this.bigTextMode = false; this.bigTextBuffer = ''; this.bigTexts = []

  this.params = { p0:0,p1:0,p2:0,p3:0,p4:0,p5:0,p6:0,p7:0 }
  this.midiNote = 0; this.midiCC = {}
  this.fps = 60; this.lastFrame = 0; this.frameCount = 0
  this.freqArr = null; this.timeArr = null; this.specPeak = null
  this.si = null; this.telemetry = { cpu:0, gpu:0, temp:null, net:null }

  this.install = (host) => {
    host.appendChild(this.el)
    document.body.style.margin = '0'; document.body.style.overflow = 'hidden'
    this.el.style.position = 'fixed'; this.el.style.top = '0'; this.el.style.left = '0'
    this.theme.install(host)
    this.theme.default = { background:'#000000', f_high:'#ffffff', f_med:'#777777', f_low:'#444444', f_inv:'#000000', b_high:'#eeeeee', b_med:'#72dec2', b_low:'#444444', b_inv:'#ffb545' }
    this.audioReactor.start()

    this.acels.set('File','New','CmdOrCtrl+N',()=>{this.reset()})
    this.acels.set('File','Open','CmdOrCtrl+O',()=>{this.source.open('orca',this.whenOpen,true)})
    this.acels.set('File','Import Modules','CmdOrCtrl+L',()=>{this.source.load('orca')})
    this.acels.set('File','Export','CmdOrCtrl+S',()=>{this.source.write('orca','orca',`${this.orca}`,'text/plain')})
    this.acels.set('File','Export Selection','CmdOrCtrl+Shift+S',()=>{this.source.write('orca','orca',`${this.cursor.selection()}`,'text/plain')})
    this.acels.set('Edit','Undo','CmdOrCtrl+Z',()=>{this.history.undo()})
    this.acels.set('Edit','Redo','CmdOrCtrl+Shift+Z',()=>{this.history.redo()})
    this.acels.add('Edit','cut'); this.acels.add('Edit','copy'); this.acels.add('Edit','paste')
    this.acels.set('Edit','Select All','CmdOrCtrl+A',()=>{this.cursor.selectAll()})
    this.acels.set('Edit','Erase Selection','Backspace',()=>{if(this.cursor.ins){this.cursor.erase();this.cursor.move(-1,0)}else{this[this.commander.isActive?'commander':'cursor'].erase()}})
    this.acels.set('Edit','Uppercase','CmdOrCtrl+Shift+U',()=>{this.cursor.toUpperCase()})
    this.acels.set('Edit','Lowercase','CmdOrCtrl+Shift+L',()=>{this.cursor.toLowerCase()})
    this.acels.set('Edit','Drag North','Alt+ArrowUp',()=>{this.cursor.drag(0,1)})
    this.acels.set('Edit','Drag East','Alt+ArrowRight',()=>{this.cursor.drag(1,0)})
    this.acels.set('Edit','Drag South','Alt+ArrowDown',()=>{this.cursor.drag(0,-1)})
    this.acels.set('Edit','Drag West','Alt+ArrowLeft',()=>{this.cursor.drag(-1,0)})
    this.acels.set('Edit','Drag North(Leap)','CmdOrCtrl+Alt+ArrowUp',()=>{this.cursor.drag(0,this.grid.h)})
    this.acels.set('Edit','Drag East(Leap)','CmdOrCtrl+Alt+ArrowRight',()=>{this.cursor.drag(this.grid.w,0)})
    this.acels.set('Edit','Drag South(Leap)','CmdOrCtrl+Alt+ArrowDown',()=>{this.cursor.drag(0,-this.grid.h)})
    this.acels.set('Edit','Drag West(Leap)','CmdOrCtrl+Alt+ArrowLeft',()=>{this.cursor.drag(-this.grid.w,0)})
    this.acels.set('Project','Find','CmdOrCtrl+J',()=>{this.commander.start('find:')})
    this.acels.set('Project','Inject','CmdOrCtrl+B',()=>{this.commander.start('inject:')})
    this.acels.set('Project','Toggle Commander','CmdOrCtrl+K',()=>{this.commander.start()})
    this.acels.set('Project','Run Commander','Enter',()=>{this.runEnter()})
    this.acels.set('Cursor','Toggle Insert Mode','CmdOrCtrl+I',()=>{this.cursor.ins=!this.cursor.ins})
    this.acels.set('Cursor','Toggle Block Comment','CmdOrCtrl+/',()=>{this.cursor.comment()})
    this.acels.set('Cursor','Trigger Operator','CmdOrCtrl+P',()=>{this.cursor.trigger()})
    this.acels.set('Cursor','Reset','Escape',()=>{
      this.toggleGuide(false); this.commander.stop(); this.clear(); this.clock.isPaused=false; this.cursor.reset()
      if(this.fxManager){this.fxManager.setChain([])} if(this.background){this.background.off()}
      this.fxTextMode=false; this.fxTextBuffer=''; this.bigTextMode=false; this.bigTextBuffer=''; this.bigTexts=[]
    })
    this.acels.set('Move','Move North','ArrowUp',()=>{this.cursor.move(0,1)})
    this.acels.set('Move','Move East','ArrowRight',()=>{this.cursor.move(1,0)})
    this.acels.set('Move','Move South','ArrowDown',()=>{this.cursor.move(0,-1)})
    this.acels.set('Move','Move West','ArrowLeft',()=>{this.cursor.move(-1,0)})
    this.acels.set('Move','Move North(Leap)','CmdOrCtrl+ArrowUp',()=>{this.cursor.move(0,this.grid.h)})
    this.acels.set('Move','Move East(Leap)','CmdOrCtrl+ArrowRight',()=>{this.cursor.move(this.grid.w,0)})
    this.acels.set('Move','Move South(Leap)','CmdOrCtrl+ArrowDown',()=>{this.cursor.move(0,-this.grid.h)})
    this.acels.set('Move','Move West(Leap)','CmdOrCtrl+ArrowLeft',()=>{this.cursor.move(-this.grid.w,0)})
    this.acels.set('Move','Scale North','Shift+ArrowUp',()=>{this.cursor.scale(0,1)})
    this.acels.set('Move','Scale East','Shift+ArrowRight',()=>{this.cursor.scale(1,0)})
    this.acels.set('Move','Scale South','Shift+ArrowDown',()=>{this.cursor.scale(0,-1)})
    this.acels.set('Move','Scale West','Shift+ArrowLeft',()=>{this.cursor.scale(-1,0)})
    this.acels.set('Move','Scale North(Leap)','CmdOrCtrl+Shift+ArrowUp',()=>{this.cursor.scale(0,this.grid.h)})
    this.acels.set('Move','Scale East(Leap)','CmdOrCtrl+Shift+ArrowRight',()=>{this.cursor.scale(this.grid.w,0)})
    this.acels.set('Move','Scale South(Leap)','CmdOrCtrl+Shift+ArrowDown',()=>{this.cursor.scale(0,-this.grid.h)})
    this.acels.set('Move','Scale West(Leap)','CmdOrCtrl+Shift+ArrowLeft',()=>{this.cursor.scale(-this.grid.w,0)})
    this.acels.set('Clock','Play/Pause','Space',()=>{if(this.cursor.ins){this.cursor.move(1,0)}else{this.clock.togglePlay(false)}})
    this.acels.set('Clock','Frame By Frame','CmdOrCtrl+F',()=>{this.clock.touch()})
    this.acels.set('Clock','Reset Frame','CmdOrCtrl+Shift+R',()=>{this.clock.setFrame(0)})
    this.acels.set('Clock','Incr. Speed','>',()=>{this.clock.modSpeed(1)})
    this.acels.set('Clock','Decr. Speed','<',()=>{this.clock.modSpeed(-1)})
    this.acels.set('Clock','Incr. Speed(10x)','CmdOrCtrl+>',()=>{this.clock.modSpeed(10,true)})
    this.acels.set('Clock','Decr. Speed(10x)','CmdOrCtrl+<',()=>{this.clock.modSpeed(-10,true)})
    this.acels.set('View','Toggle Retina','Tab',()=>{this.toggleRetina()})
    this.acels.set('View','Toggle Guide','CmdOrCtrl+G',()=>{this.toggleGuide()})
    this.acels.set('View','Incr. Col',']',()=>{this.modGrid(1,0)})
    this.acels.set('View','Decr. Col','[',()=>{this.modGrid(-1,0)})
    this.acels.set('View','Incr. Row','}',()=>{this.modGrid(0,1)})
    this.acels.set('View','Decr. Row','{',()=>{this.modGrid(0,-1)})
    this.acels.set('View','Zoom In','CmdOrCtrl+=',()=>{this.modZoom(0.0625)})
    this.acels.set('View','Zoom Out','CmdOrCtrl+-',()=>{this.modZoom(-0.0625)})
    this.acels.set('View','Zoom Reset','CmdOrCtrl+0',()=>{this.modZoom(1,true)})
    this.acels.set('View','Activate FX Situation','Alt+V',()=>{this.fxTextMode=false;this.bigTextMode=false;this.commander.isActive=false;this.commander.query='fx:';this.cursor.ins=false;this.update()})
    this.acels.set('View','Broken TV Mode','Alt+T',()=>{this.fxManager.setChain([{name:'brokentv',seed:450,drive:500}]);this.update()})
    this.acels.set('View','Load GIF Swarm','Alt+G',()=>{this.background.loadSwarm();this.update()})
    this.acels.set('View','Load Background Once','Alt+B',()=>{this.background.loadBackground();this.update()})
    this.acels.set('View','Background Auto Cycle','Alt+Shift+B',()=>{this.background.startAuto();this.update()})
    this.acels.set('View','Big Text Overlay','Alt+W',()=>{this.commander.isActive=false;this.fxTextMode=false;this.bigTextMode=true;this.bigTextBuffer='';this.cursor.ins=false;this.update()})
    this.acels.set('Midi','Play/Pause Midi','CmdOrCtrl+Space',()=>{this.clock.togglePlay(true)})
    this.acels.set('Midi','Next Input Device','CmdOrCtrl+,',()=>{this.clock.setFrame(0);this.io.midi.selectNextInput()})
    this.acels.set('Midi','Next Output Device','CmdOrCtrl+.',()=>{this.clock.setFrame(0);this.io.midi.selectNextOutput()})
    this.acels.set('Midi','Refresh Devices','CmdOrCtrl+Shift+M',()=>{this.io.midi.refresh()})
    this.acels.set('Communication','Choose OSC Port','alt+O',()=>{this.commander.start('osc:')})
    this.acels.set('Communication','Choose UDP Port','alt+U',()=>{this.commander.start('udp:')})
    this.acels.install(window)
    this.acels.pipe(this.commander)

    window.addEventListener('keydown',(e)=>{
      if(this.bigTextMode){
        if(e.key==='Enter'){this.runEnter();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){this.bigTextMode=false;this.bigTextBuffer='';this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.bigTextBuffer=this.bigTextBuffer.slice(0,-1);this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(this.bigTextBuffer.length<42){this.bigTextBuffer+=e.key}this.update();e.preventDefault();e.stopPropagation();return}
        return
      }
      if(this.fxTextMode){
        if(e.key==='Enter'){this.runEnter();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){this.fxTextMode=false;this.fxTextBuffer='';this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.fxTextBuffer=this.fxTextBuffer.slice(0,-1);this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){this.fxTextBuffer+=e.key;this.update();e.preventDefault();e.stopPropagation();return}
        return
      }
      if(this.commander.query.startsWith('fx:')){
        if(e.key==='Enter'){this.runEnter();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Escape'){if(this.fxManager){this.fxManager.setChain([])}this.commander.query='';this.commander.isActive=false;this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key==='Backspace'){this.commander.query=this.commander.query.slice(0,-1);if(this.commander.query==='fx'){this.commander.query='fx:'}this.update();e.preventDefault();e.stopPropagation();return}
        if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){this.commander.query+=e.key;this.update();e.preventDefault();e.stopPropagation();return}
      }
    },true)
  }

  this.start = () => {
    console.info('Client','Starting..')
    this.theme.start(); this.io.start()
    this.history.bind(this.orca,'s'); this.history.record(this.orca.s)
    this.clock.start(); this.cursor.start()
    this.reset(); this.modZoom(); this.update()
    this.el.className='ready'; this.toggleGuide()
    // MIDI in sola lettura per i parametri
    if(navigator.requestMIDIAccess){
      navigator.requestMIDIAccess({sysex:false}).then((acc)=>{
        const hook=(inp)=>{inp.onmidimessage=(m)=>this.onMidi(m)}
        acc.inputs.forEach(hook)
        acc.onstatechange=(e)=>{if(e.port.type==='input'&&e.port.state==='connected'){hook(e.port)}}
      }).catch(()=>{})
    }
    // Telemetria nativa (systeminformation) con fallback
    try{
      const si=require('systeminformation'); this.si=si
      const poll=()=>{
        si.currentLoad().then(l=>{this.telemetry.cpu=l.currentLoad/100}).catch(()=>{})
        si.cpuTemperature().then(t=>{this.telemetry.temp=t.main}).catch(()=>{})
        si.graphics().then(g=>{const u=g.controllers&&g.controllers[0]&&g.controllers[0].utilizationGpu;if(u!=null){this.telemetry.gpu=u/100}}).catch(()=>{})
        si.networkStats().then(n=>{const s=n&&n[0];if(s){this.telemetry.net=(s.rx_sec+s.tx_sec)/125000}}).catch(()=>{})
      }
      poll(); setInterval(poll,800)
    }catch(e){ this.si=null }
  }

  this.onMidi = (m) => {
    const st=m.data[0]&0xf0; const d1=m.data[1]||0; const d2=m.data[2]||0
    if(st===0x90&&d2>0){this.midiNote=d1/127}
    if(st===0xb0){this.midiCC[d1]=d2/127}
  }

  this.reset = () => { this.orca.reset(); this.resize(); this.source.new(); this.history.reset(); this.cursor.reset(); this.clock.play() }
  this.run = () => { this.io.clear(); this.clock.run(); this.orca.run(); this.io.run(); this.update() }

  this.runEnter = () => {
    if(this.bigTextMode){
      if(this.bigTextBuffer.length>0){this.bigTexts.push({text:this.bigTextBuffer.toUpperCase().slice(0,42),mode:Math.floor(Math.random()*3),born:performance.now(),ttl:8000+Math.random()*6000,seed:Math.random()})}
      this.bigTextMode=false;this.bigTextBuffer='';this.update();return
    }
    if(this.fxTextMode){
      if(this.fxTextBuffer.length>0){const t=this.fxTextBuffer.toUpperCase();this.orca.writeBlock(this.cursor.x,this.cursor.y,t);this.cursor.move(t.length,0)}
      this.fxTextMode=false;this.fxTextBuffer='';this.history.record(this.orca.s);this.update();return
    }
    if(this.commander.query.startsWith('fx:')){
      const val=this.commander.query.substr(3).trim()
      if(val.length>0){this.commander.trigger('fx:'+val)}else{this.fxManager.setChain([])}
      this.commander.query='';this.commander.isActive=false;this.update();return
    }
    this.commander.run()
  }

  this.getBeatTime = function(){const bpm=this.clock.speed.value||120;return (this.orca.f||0)*(60/bpm)/4}

  this.update = () => {
    if(document.hidden===true){return}
    this.frameCount++
    const now=performance.now(); const dt=now-(this.lastFrame||now); this.lastFrame=now
    this.fps=this.fps*0.9+(1000/Math.max(1,dt))*0.1
    const bpm=this.clock.speed.value||120
    const regime=bpm>600?2:(bpm>200?1:0)
    const beat=this.getBeatTime()
    const a=this.audioReactor
    this.params={p0:a.bass||0,p1:a.mid||0,p2:a.high||0,p3:a.vol||0,p4:beat%1,p5:(beat/4)%1,p6:bpm/999,p7:this.midiNote||0}
    const fxOn=this.fxManager&&this.fxManager.ok&&this.fxManager.chain&&this.fxManager.chain.length>0
    this.clear()
    this.sceneCtx.clearRect(0,0,this.sceneEl.width,this.sceneEl.height)
    const savedCtx=this.context; this.context=this.sceneCtx
    this.ports=this.findPorts()
    this.background.draw(this.context,this.sceneEl.width,this.sceneEl.height)
    this.background.drawSwarm(this.context,this.sceneEl.width,this.sceneEl.height)
    this.drawProgram()
    this.drawBigTexts(this.context,this.sceneEl.width,this.sceneEl.height)
    this.context=savedCtx
    if(fxOn){
      const skip=(regime===2&&(this.frameCount%2===1))
      if(!skip){
        const info={beat:beat,regime:regime,bass:a.bass,mid:a.mid,high:a.high,vol:a.envelope,p0:this.params.p0,p1:this.params.p1,p2:this.params.p2,p3:this.params.p3,p4:this.params.p4,p5:this.params.p5,p6:this.params.p6,p7:this.params.p7}
        if(this.fxManager.render(this.sceneEl,info)){this.context.drawImage(this.fxManager.canvas,0,0,this.el.width,this.el.height)}else{this.context.drawImage(this.sceneEl,0,0)}
      }else{
        this.context.drawImage(this.fxManager.canvas,0,0,this.el.width,this.el.height)
      }
    }else{
      this.context.drawImage(this.sceneEl,0,0)
    }
    this.drawInterface(); this.drawMonitor(); this.drawStatus(); this.drawOverlay(); this.drawGuide()
  }

  this.drawBigTexts = (ctx,W,gridH) => {
    if(!this.bigTexts.length&&!this.bigTextMode){return}
    const now=performance.now()
    const cols=['#f5efe6','#ef8f7d','#2e9cc3','#c81e4e','#ff4fd8']
    for(let i=this.bigTexts.length-1;i>=0;i--){
      const t=this.bigTexts[i]; const age=now-t.born
      if(age>t.ttl){this.bigTexts.splice(i,1);continue}
      const size=Math.floor(gridH*0.92)
      ctx.font=`bold ${size}px input_mono_medium`; ctx.textBaseline='middle'; ctx.textAlign='left'
      const unitW=Math.max(10,ctx.measureText(t.text).width)
      const reps=Math.ceil(W/unitW)+2
      let full=''; for(let r=0;r<reps;r++){full+=t.text}
      const fullW=unitW*(reps-1)
      const phase=Math.floor(age/160)%4
      ctx.globalCompositeOperation='screen'
      if(phase===2){ctx.globalAlpha=0.08}else if(phase===3){ctx.globalAlpha=0.35}else{ctx.globalAlpha=0.6}
      ctx.fillStyle=cols[(Math.floor(t.seed*10)+phase)%cols.length]
      const y=gridH*0.5; let x=0
      if(t.mode===0){x=((age*0.25)%unitW)-unitW}else if(t.mode===1){x=-((age*0.25)%unitW)-unitW}else{x=-((Math.floor(age/160)*37)%unitW)}
      ctx.fillText(full,x,y); ctx.fillText(full,x+fullW,y)
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'
    }
    if(this.bigTextMode){
      const size=Math.floor(gridH*0.08)
      ctx.font=`bold ${size}px input_mono_medium`; ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillStyle='#f5efe6'
      ctx.fillText(`> ${this.bigTextBuffer}${now%500<250?'_':''}`,20,gridH-size)
    }
    ctx.font=`${this.tile.hs*0.75}px input_mono_medium`; ctx.textBaseline='bottom'; ctx.textAlign='center'
  }

  this.whenOpen = (file,text) => {
    const lines=text.trim().split(/\r?\n/); const w=lines[0].length; const h=lines.length; const s=lines.join('\n').trim()
    this.orca.load(w,h,s); this.history.reset(); this.history.record(this.orca.s); this.resize()
  }
  this.setGrid = (w,h) => { this.grid.w=w; this.grid.h=h; this.update() }
  this.toggleRetina = () => { this.scale=this.scale===1?window.devicePixelRatio:1; this.resize(true) }
  this.toggleGuide = (force=null) => { const d=force!==null?force:this.guide!==true; if(d===this.guide){return} this.guide=d; this.update() }
  this.modGrid = (x=0,y=0) => { this.setGrid(clamp(this.grid.w+x,4,16),clamp(this.grid.h+y,4,16)) }
  this.modZoom = (mod=0,reset=false) => {
    this.tile={w:reset?10:this.tile.w*(mod+1),h:reset?15:this.tile.h*(mod+1),ws:Math.floor(this.tile.w*this.scale),hs:Math.floor(this.tile.h*this.scale)}
    localStorage.setItem('tilew',this.tile.w); localStorage.setItem('tileh',this.tile.h); this.resize(true)
  }
  this.isCursor = (x,y) => x===this.cursor.x&&y===this.cursor.y
  this.isMarker = (x,y) => x%this.grid.w===0&&y%this.grid.h===0
  this.isNear = (x,y) => x>(parseInt(this.cursor.x/this.grid.w)*this.grid.w)-1&&x<=((1+parseInt(this.cursor.x/this.grid.w))*this.grid.w)&&y>(parseInt(this.cursor.y/this.grid.h)*this.grid.h)-1&&y<=((1+parseInt(this.cursor.y/this.grid.h))*this.grid.h)
  this.isLocals = (x,y) => this.isNear(x,y)===true&&(x%(this.grid.w/4)===0&&y%(this.grid.h/4)===0)===true
  this.isInvisible = (x,y) => this.orca.glyphAt(x,y)==='.'&&!this.isMarker(x,y)&&!this.cursor.selected(x,y)&&!this.isLocals(x,y)&&!this.ports[this.orca.indexAt(x,y)]&&!this.orca.lockAt(x,y)
  this.findPorts = () => {
    const a=new Array((this.orca.w*this.orca.h)-1)
    for(const op of this.orca.runtime){ if(this.orca.lockAt(op.x,op.y)){continue} const ports=op.getPorts(); for(const p of ports){a[this.orca.indexAt(p[0],p[1])]=p} }
    return a
  }
  this.makeTheme = (type) => {
    if(type===0){return{bg:this.theme.active.b_med,fg:this.theme.active.f_low}}
    if(type===1){return{fg:this.theme.active.b_med}}
    if(type===2){return{fg:this.theme.active.b_high}}
    if(type===3){return{bg:this.theme.active.b_high,fg:this.theme.active.f_low}}
    if(type===4){return{bg:this.theme.active.b_inv,fg:this.theme.active.f_inv}}
    if(type===5){return{fg:this.theme.active.f_med}}
    if(type===6){return{fg:this.theme.active.b_inv}}
    if(type===7){return{}}
    if(type===8){return{bg:this.theme.active.b_low,fg:this.theme.active.f_high}}
    if(type===9){return{bg:this.theme.active.b_inv,fg:this.theme.active.background}}
    if(type===10){return{bg:this.theme.active.background,fg:this.theme.active.f_high}}
    if(type===11){return{fg:this.theme.active.b_inv}}
    return{fg:this.theme.active.f_low}
  }
  this.clear = () => { this.context.clearRect(0,0,this.el.width,this.el.height) }
  this.drawProgram = () => {
    const selection=this.cursor.read()
    for(let y=0;y<this.orca.h;y++){for(let x=0;x<this.orca.w;x++){
      if(this.isInvisible(x,y)){continue}
      const g=this.orca.glyphAt(x,y)
      const glyph=g!=='.'?g:this.isCursor(x,y)?(this.clock.isPaused?'~':'@'):this.isMarker(x,y)?'+':g
      this.drawSprite(x,y,glyph,this.makeStyle(x,y,glyph,selection))
    }}
  }
  this.makeStyle = (x,y,glyph,selection) => {
    if(this.cursor.selected(x,y)){return 4}
    const isLocked=this.orca.lockAt(x,y)
    if(selection===glyph&&isLocked===false&&selection!=='.'){return 6}
    if(glyph==='*'&&isLocked===false){return 2}
    const port=this.ports[this.orca.indexAt(x,y)]
    if(port){return port[2]}
    if(isLocked===true){return 5}
    return 20
  }

  this.makeTerminalTheme = (type) => {
    if(type===1){return{fg:'#b39dff'}}
    if(type===2){return{fg:'#4ade80'}}
    if(type===3){return{fg:'#ffb545'}}
    if(type===4){return{bg:'#b39dff',fg:'#000000'}}
    if(type===5){return{fg:'#4ade80'}}
    if(type===6){return{fg:'#ffb545'}}
    if(type===7){return{}}
    if(type===8){return{fg:'#b39dff'}}
    if(type===9){return{bg:'#ffb545',fg:'#000000'}}
    if(type===10){return{bg:'#000000',fg:'#4ade80'}}
    if(type===11){return{fg:'#ffb545'}}
    if(type===20){return{fg:'#4ade80'}}
    return{fg:'#b39dff'}
  }
  this.drawTermSprite = (x,y,g,type) => {
    const theme=this.makeTerminalTheme(type)
    if(theme.bg){this.context.fillStyle=theme.bg;this.context.fillRect(x*this.tile.ws,y*this.tile.hs,this.tile.ws,this.tile.hs)}
    if(theme.fg){this.context.fillStyle=theme.fg;this.context.fillText(g,(x+0.5)*this.tile.ws,(y+1)*this.tile.hs)}
  }
  this.writeTerm = (text,offsetX,offsetY,limit=50,type=2) => {
    for(let x=0;x<text.length&&x<limit;x++){this.drawTermSprite(offsetX+x,offsetY,text.substr(x,1),type)}
  }

  this.drawInterface = () => {
    const ctx=this.context; const tile=this.tile
    const termHeightPx=tile.hs*2; const termY=this.el.height-termHeightPx
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1
    ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,termY,this.el.width,termHeightPx)
    ctx.textBaseline='bottom'; ctx.textAlign='center'; ctx.font=`${tile.hs*0.75}px input_mono_medium`
    const termRow=Math.floor(termY/tile.hs); const termRow2=termRow+1
    this.writeTerm(`${this.cursor.inspect()}`,this.grid.w*0,termRow,this.grid.w-1,2)
    this.writeTerm(`${this.cursor.x},${this.cursor.y}${this.cursor.ins?'+':''}`,this.grid.w*1,termRow,this.grid.w,this.cursor.ins?1:2)
    this.writeTerm(`${this.cursor.w}:${this.cursor.h}`,this.grid.w*2,termRow,this.grid.w,2)
    this.writeTerm(`${this.orca.f}f${this.clock.isPaused?'~':''}`,this.grid.w*3,termRow,this.grid.w,2)
    this.writeTerm(`${this.io.inspect(this.grid.w)}`,this.grid.w*4,termRow,this.grid.w-1,2)
    this.writeTerm(this.orca.f<250?`< ${this.io.midi.toInputString()}`:'',this.grid.w*5,termRow,this.grid.w*4,2)
    if(this.bigTextMode){this.writeTerm(`[BIG TEXT] ${this.bigTextBuffer}${this.orca.f%2===0?'_':''}`,this.grid.w*0,termRow2,this.grid.w*6,6)}
    else if(this.fxTextMode){this.writeTerm(`[FX TEXT] ${this.fxTextBuffer}${this.orca.f%2===0?'_':''}`,this.grid.w*0,termRow2,this.grid.w*6,6)}
    else if(this.commander.query.startsWith('fx:')){this.writeTerm(`${this.commander.query}${this.orca.f%2===0?'_':''}`,this.grid.w*0,termRow2,this.grid.w*6,6)}
    else if(this.commander.isActive===true){this.writeTerm(`${this.commander.query}${this.orca.f%2===0?'_':''}`,this.grid.w*0,termRow2,this.grid.w*4,6)}
    else{
      this.writeTerm(this.orca.f<25?`ver${this.version}`:`${Object.keys(this.source.cache).length} mods`,this.grid.w*0,termRow2,this.grid.w,1)
      this.writeTerm(`${this.orca.w}x${this.orca.h}`,this.grid.w*1,termRow2,this.grid.w,1)
      this.writeTerm(`${this.grid.w}/${this.grid.h}${this.tile.w!==10?' '+(this.tile.w/10).toFixed(1):''}`,this.grid.w*2,termRow2,this.grid.w,1)
      this.writeTerm(`${this.clock}`,this.grid.w*3,termRow2,this.grid.w,this.clock.isPuppet?3:this.io.midi.isClock?11:this.clock.isPaused?20:1)
      this.writeTerm(`${display(Object.keys(this.orca.variables).join(''),this.orca.f,this.grid.w-1)}`,this.grid.w*4,termRow2,this.grid.w-1,1)
      this.writeTerm(this.orca.f<250?`> ${this.io.midi.toOutputString()}`:'',this.grid.w*5,termRow2,this.grid.w*4,1)
    }
    if(this.fxManager.chain&&this.fxManager.chain.length){
      const mods=Object.keys(this.source.cache)
      let info=this.fxManager.chain.map(f=>f.name).join('+')
      if(mods.length){info+=` mods:${mods.length}`}
      const startX=this.orca.w-info.length-1
      if(startX>this.grid.w*5){this.writeTerm(info,startX,termRow2,info.length+1,6)}
    }
  }

  this.drawMonitor = () => {
    const ctx=this.context; const a=this.audioReactor
    if(!a||!a.analyser){return}
    const termH=this.tile.hs*2; const termY=this.el.height-termH
    const MW=189,MH=132; const mx=10; const my=termY-MH-10
    if(my<0){return}
    const bins=a.analyser.frequencyBinCount
    if(!this.freqArr||this.freqArr.length!==bins){this.freqArr=new Uint8Array(bins);this.timeArr=new Uint8Array(bins);this.specPeak=new Float32Array(bins)}
    a.analyser.getByteFrequencyData(this.freqArr); a.analyser.getByteTimeDomainData(this.timeArr)
    let sum=0; for(let i=0;i<this.timeArr.length;i++){const v=(this.timeArr[i]-128)/128;sum+=v*v}
    const rms=Math.sqrt(sum/this.timeArr.length)
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(mx,my,MW,MH)
    ctx.fillStyle='#4ade80'; ctx.fillRect(mx,my,MW,1); ctx.fillStyle='#b39dff'; ctx.fillRect(mx,my+1,MW,1)
    const N=64; const top=my+8; const bh=MH-8-30
    ctx.strokeStyle='#4ade80'; ctx.lineWidth=1; ctx.beginPath()
    for(let i=0;i<N;i++){
      const idx=Math.floor(Math.pow(i/N,1.6)*(bins*0.7)); const val=this.freqArr[idx]/255
      this.specPeak[i]=Math.max(val,this.specPeak[i]-0.02)
      const x=mx+4+(i/N)*(MW-8); const y=top+bh-val*bh
      if(i===0){ctx.moveTo(x,y)}else{ctx.lineTo(x,y)}
    }
    ctx.stroke()
    ctx.strokeStyle='rgba(185,103,255,0.6)'; ctx.beginPath()
    for(let i=0;i<N;i++){const x=mx+4+(i/N)*(MW-8); const y=top+bh-this.specPeak[i]*bh; if(i===0){ctx.moveTo(x,y)}else{ctx.lineTo(x,y)}}
    ctx.stroke()
    const ry=my+MH-16
    ctx.font=`${Math.floor(this.tile.hs*0.7)}px input_mono_medium`; ctx.textAlign='left'; ctx.textBaseline='bottom'
    ctx.fillStyle='#4ade80'; ctx.fillText('RMS',mx+6,ry+12)
    ctx.fillStyle='#222'; ctx.fillRect(mx+36,ry,MW-36-44,10)
    ctx.fillStyle='#ffb545'; ctx.fillRect(mx+36,ry,Math.min(1,rms*2.5)*(MW-36-44),10)
    ctx.textAlign='right'; ctx.fillText(rms.toFixed(2),mx+MW-6,ry+12)
    const P=this.params; const pk=[P.p0,P.p1,P.p2,P.p3]
    for(let i=0;i<4;i++){
      const bx=mx+6+i*24
      ctx.strokeStyle=i%2?'#b39dff':'#4ade80'; ctx.strokeRect(bx+0.5,my+4.5,18,4)
      ctx.fillStyle=i%2?'#b39dff':'#4ade80'; ctx.fillRect(bx+1,my+5,16*pk[i],3)
    }
    ctx.textAlign='center'
  }

  this.drawStatus = () => {
    const ctx=this.context
    let cpu,gpu,temp,net
    if(this.si){cpu=this.telemetry.cpu;gpu=this.telemetry.gpu;temp=this.telemetry.temp;net=this.telemetry.net}
    else{try{cpu=Math.min(1,require('os').loadavg()[0]/4)}catch(e){cpu=0} gpu=Math.min(1,(1000/Math.max(1,this.fps))/16.7);temp=null;net=null}
    const a=this.audioReactor; const rms=a?a.vol:0; const db=20*Math.log10(rms+1e-6)
    if(net==null){try{if(navigator.connection&&navigator.connection.downlink){net=navigator.connection.downlink}}catch(e){}}
    const items=[
      {l:'CPU',v:cpu||0,c:'#ffb545',t:Math.round((cpu||0)*100)+'%'},
      {l:'GPU',v:gpu||0,c:'#b39dff',t:Math.round((gpu||0)*100)+'%'},
      {l:'FPS',v:Math.min(1,this.fps/60),c:'#4ade80',t:Math.round(this.fps)},
      {l:'dB',v:Math.min(1,(db+60)/60),c:'#ffb545',t:Math.round(db)},
      {l:'NET',v:net?Math.min(1,net/100):0,c:'#4ade80',t:net?net.toFixed(0)+'Mb':'--'},
      {l:'T',v:temp!=null?Math.min(1,temp/100):0,c:'#b39dff',t:temp!=null?Math.round(temp)+'°':'--'}
    ]
    const bw=60; let x=8
    ctx.font=`${Math.floor(this.tile.hs*0.7)}px input_mono_medium`; ctx.textAlign='left'; ctx.textBaseline='bottom'
    for(const it of items){
      ctx.fillStyle=it.c; ctx.fillText(it.l,x,12)
      ctx.fillStyle='#222'; ctx.fillRect(x+26,4,bw,6)
      ctx.fillStyle=it.c; ctx.fillRect(x+26,4,bw*it.v,6)
      if(it.t!==undefined){ctx.fillText(String(it.t),x+26+bw+4,12)}
      x+=26+bw+40
    }
  }

  this.drawOverlay = () => {
    const ctx=this.context; const W=this.el.width; const H=this.el.height
    const P=this.params; const bpm=Math.round(this.clock.speed.value||120)
    const anchors=[
      {x:W*0.2+P.p4*60,y:H*0.3+P.p0*80,t:`id:0 bpm:${bpm}`},
      {x:W*0.6+P.p5*80,y:H*0.4+P.p1*60,t:`id:1 b:${P.p4.toFixed(2)}`},
      {x:W*0.4+P.p7*100,y:H*0.6+P.p2*70,t:`id:2 n:${Math.round(P.p7*127)}`},
      {x:W*0.75+P.p0*50,y:H*0.25+P.p3*60,t:`id:3 v:${P.p3.toFixed(2)}`}
    ]
    ctx.lineWidth=1
    for(let i=0;i<anchors.length;i++){
      const an=anchors[i]
      ctx.strokeStyle=i%3===0?'#ffb545':(i%3===1?'#4ade80':'#b39dff')
      ctx.strokeRect(an.x+0.5,an.y+0.5,26,14)
      ctx.beginPath(); ctx.moveTo(an.x+26,an.y+7); ctx.lineTo(an.x+40,an.y+7); ctx.stroke()
      ctx.font=`${Math.floor(this.tile.hs*0.6)}px input_mono_medium`; ctx.textAlign='left'; ctx.textBaseline='middle'
      ctx.fillStyle=ctx.strokeStyle; ctx.fillText(an.t,an.x+42,an.y+8)
    }
  }

  this.drawGuide = () => {
    if(this.guide!==true){return}
    const operators=Object.keys(this.library).filter(v=>isNaN(v))
    for(const id in operators){
      const key=operators[id]; const oper=new this.library[key](); const text=oper.info
      const frame=this.orca.h-4
      const x=(Math.floor(parseInt(id)/frame)*32)+2; const y=(parseInt(id)%frame)+2
      this.write(key,x,y,99,3); this.write(text,x+2,y,99,10)
    }
    const cmds=[['ALT+V','fx prompt nome.seed.drive (+combo)'],['ALT+T','broken tv on'],['ALT+G','stormo gif boids'],['ALT+B','background random'],['ALT+SH+B','auto archive 30s x 1min'],['ALT+W','scritta cubitale max 42'],['ESC','reset tutto']]
    const bx=this.orca.w-46
    for(let i=0;i<cmds.length;i++){const y=2+i; if(y>this.orca.h-3){break} this.write(cmds[i][0],bx,y,10,3); this.write(cmds[i][1],bx+9,y,36,10)}
  }

  this.drawSprite = (x,y,g,type) => {
    const theme=this.makeTheme(type)
    if(theme.bg){this.context.fillStyle=theme.bg;this.context.fillRect(x*this.tile.ws,y*this.tile.hs,this.tile.ws,this.tile.hs)}
    if(theme.fg){this.context.fillStyle=theme.fg;this.context.fillText(g,(x+0.5)*this.tile.ws,(y+1)*this.tile.hs)}
  }
  this.write = (text,offsetX,offsetY,limit=50,type=2) => {
    for(let x=0;x<text.length&&x<limit;x++){this.drawSprite(offsetX+x,offsetY,text.substr(x,1),type)}
  }

  this.resize = () => {
    const W=window.innerWidth; const H=window.innerHeight
    const tiles={w:Math.ceil(W/this.tile.w),h:Math.ceil(H/this.tile.h)}
    const bounds=this.orca.bounds()
    if(tiles.w<bounds.w+1){tiles.w=bounds.w+1}
    if(tiles.h<bounds.h+1){tiles.h=bounds.h+1}
    const maxW=400,maxH=200
    if(tiles.w>maxW){tiles.w=maxW}
    if(tiles.h>maxH){tiles.h=maxH}
    this.crop(tiles.w,tiles.h)
    if(this.cursor.x>=tiles.w){this.cursor.moveTo(tiles.w-1,this.cursor.y)}
    if(this.cursor.y>=tiles.h){this.cursor.moveTo(this.cursor.x,tiles.h-1)}
    if(W===this.el.width&&H===this.el.height&&W===this.sceneEl.width){return}
    this.el.width=W; this.el.height=H
    this.el.style.width=`${W}px`; this.el.style.height=`${H}px`
    this.sceneEl.width=W; this.sceneEl.height=H
    this.context.textBaseline='bottom'; this.context.textAlign='center'; this.context.font=`${this.tile.hs*0.75}px input_mono_medium`; this.context.imageSmoothingEnabled=false
    this.sceneCtx.textBaseline='bottom'; this.sceneCtx.textAlign='center'; this.sceneCtx.font=`${this.tile.hs*0.75}px input_mono_medium`; this.sceneCtx.imageSmoothingEnabled=false
    this.update()
  }

  this.crop = (w,h) => {
    let block=`${this.orca}`
    if(h>this.orca.h){block=`${block}${`\n${'.'.repeat(this.orca.w)}`.repeat((h-this.orca.h))}`}
    else if(h<this.orca.h){block=`${block}`.split(/\r?\n/).slice(0,(h-this.orca.h)).join('\n').trim()}
    if(w>this.orca.w){block=`${block}`.split(/\r?\n/).map(v=>v+('.').repeat((w-this.orca.w))).join('\n').trim()}
    else if(w<this.orca.w){block=`${block}`.split(/\r?\n/).map(v=>v.substr(0,v.length+(w-this.orca.w))).join('\n').trim()}
    this.history.reset(); this.orca.load(w,h,block,this.orca.f)
  }

  this.docs = () => {
    let html=''
    const operators=Object.keys(library).filter(v=>isNaN(v))
    for(const id in operators){
      const oper=new this.library[operators[id]]()
      const ports=oper.ports.input?Object.keys(oper.ports.input).reduce((a,k)=>a+' '+k,''):''
      html+=`- \`${oper.glyph.toUpperCase()}\` ${oper.name}${ports!==''?'('+ports.trim()+')':''}: ${oper.info}.\n`
    }
    return html
  }

  window.addEventListener('dragover',(e)=>{e.stopPropagation();e.preventDefault();e.dataTransfer.dropEffect='copy'})
  window.addEventListener('drop',(e)=>{
    e.preventDefault(); e.stopPropagation()
    for(const file of e.dataTransfer.files){
      if(file.name.indexOf('.orca')<0){continue}
      this.toggleGuide(false); this.source.read(file,null,true)
      this.commander.start('inject:'+file.name.replace('.orca',''))
    }
  })
  window.onresize = (e) => { this.resize() }

  function display (str,f,max){return str.length<max?str:str.slice(f%str.length)+str.substr(0,f%str.length)}
  function clamp (v,min,max){return v<min?min:v>max?max:v}
}
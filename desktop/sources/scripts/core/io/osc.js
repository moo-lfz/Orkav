'use strict'

function Osc (client) {
  this.port = 49162
  this.isActive = false
  this.messages = []
  this.client = client

  this.start = () => {
    if (this.isActive) return
    console.log('OSC', 'Starting..')
    
    if (window.api && window.api.osc) {
      window.api.osc.createServer(this.port)
      window.api.osc.onMessage((data) => {
        this.messages.push(data.msg)
        if (this.client) this.client.update()
      })
      this.isActive = true
      console.log('OSC', 'Started socket at 127.0.0.1:' + this.port)
    } else {
      console.warn('OSC', 'API non disponibile')
    }
  }

  this.run = function () {
    // OSC non ha un loop, ma io.js si aspetta il metodo
  }

  this.clear = function () {
    this.messages = []
  }

  this.select = (port) => {
    if (port === this.port) return
    this.port = port
    if (this.isActive) {
      this.stop()
      this.start()
    }
  }

  this.send = (address, args) => {
    if (window.api && window.api.osc) {
      window.api.osc.send(this.port, address, args)
    }
  }

  this.stop = () => {
    this.isActive = false
  }

  this.inspect = (max) => {
    let str = ''
    const msgs = this.messages.slice(-max * 2)
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      str += m.address || m
      if (i < msgs.length - 1) str += ' '
    }
    return str
  }
}
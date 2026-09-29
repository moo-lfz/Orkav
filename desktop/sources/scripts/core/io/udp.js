'use strict'

function Udp (client) {
  this.port = 49160
  this.inputPort = 49160
  this.outputPort = 49161
  this.socket = null
  this.isActive = false
  this.messages = []
  this.client = client

  this.start = () => {
    if (this.isActive) return
    console.log('UDP', 'Starting..')
    
    if (window.api && window.api.udp) {
      window.api.udp.createSocket(this.inputPort)
      window.api.udp.onMessage((data) => {
        this.messages.push(data)
        if (this.client) this.client.update()
      })
      this.isActive = true
      console.log('UDP', 'Started socket at 0.0.0.0:' + this.inputPort)
    } else {
      console.warn('UDP', 'API non disponibile')
    }
  }

  this.run = function () {
    // UDP non ha un loop, ma io.js si aspetta il metodo
  }

  this.clear = function () {
    this.messages = []
  }

  this.selectInput = (port) => {
    if (port === this.inputPort) return
    this.inputPort = port
    if (this.isActive) {
      this.stop()
      this.start()
    }
  }

  this.selectOutput = (port) => {
    if (port === this.outputPort) return
    this.outputPort = port
  }

  this.send = (message, targetPort = null, targetIP = '127.0.0.1') => {
    const port = targetPort || this.outputPort
    if (window.api && window.api.udp) {
      window.api.udp.send(this.inputPort, message, port, targetIP)
    }
  }

  this.stop = () => {
    this.isActive = false
  }

  this.inspect = (max) => {
    let str = ''
    const msgs = this.messages.slice(-max * 4)
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      const msg = m.message || m
      str += msg.length > 20 ? msg.substr(0, 20) + '..' : msg
      if (i < msgs.length - 1) str += ' '
    }
    return str
  }
}
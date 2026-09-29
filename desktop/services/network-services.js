const { ipcMain } = require('electron');
const dgram = require('dgram');
const osc = require('osc');

let udpSockets = {};
let oscServers = {};

function isTrusted(event, win) {
  return win && !win.isDestroyed() && event.sender === win.webContents;
}

function createUdpService(win) {
  ipcMain.handle('udp:create', (event, port) => {
    if (!isTrusted(event, win)) return false;
    if (udpSockets[port]) return;
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('udp:message', {
        port,
        message: msg.toString(),
        from: rinfo
      });
    });
    socket.bind(port);
    udpSockets[port] = socket;
    return true;
  });

  ipcMain.on('udp:send', (event, { port, message, targetPort, targetIP }) => {
    if (!isTrusted(event, win)) return;
    const socket = udpSockets[port];
    if (socket) {
      socket.send(message, targetPort, targetIP);
    }
  });
}

function createOscService(win) {
  ipcMain.handle('osc:create', (event, port) => {
    if (!isTrusted(event, win)) return false;
    if (oscServers[port]) return;
    const server = new osc.UDPPort({
      localAddress: '0.0.0.0',
      localPort: port
    });
    server.on('message', (msg) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('osc:message', { port, msg });
    });
    server.open();
    oscServers[port] = server;
    return true;
  });

  ipcMain.on('osc:send', (event, { port, address, args }) => {
    if (!isTrusted(event, win)) return;
    const server = oscServers[port];
    if (server) {
      server.send({ address, args });
    }
  });
}

module.exports = { createUdpService, createOscService };
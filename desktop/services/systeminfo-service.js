const { ipcMain } = require('electron');
const si = require('systeminformation');

function setupSystemInfoService(win) {
  setInterval(async () => {
    try {
      const [cpu, temp, net, gpu] = await Promise.all([
        si.currentLoad(),
        si.cpuTemperature(),
        si.networkStats(),
        si.graphics()
      ]);
      
      win.webContents.send('systeminfo:update', {
        cpu: cpu.currentLoad / 100,
        temp: temp.main || 40,
        net: net[0] ? (net[0].rx_sec + net[0].tx_sec) / 125000 : 0,
        gpu: gpu.controllers && gpu.controllers[0] ? gpu.controllers[0].utilizationGpu / 100 : 0
      });
    } catch (e) {
      // silenzioso
    }
  }, 3000);
}

function setupIpcHandlers() {
  ipcMain.handle('systeminfo:currentLoad', () => si.currentLoad());
  ipcMain.handle('systeminfo:cpuTemperature', () => si.cpuTemperature());
  ipcMain.handle('systeminfo:networkStats', () => si.networkStats());
  ipcMain.handle('systeminfo:graphics', () => si.graphics());
}

module.exports = { setupSystemInfoService, setupIpcHandlers };
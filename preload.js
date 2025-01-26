const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      console.log(`Invoking channel: ${channel}`, args);
      return ipcRenderer.invoke(channel, ...args);
    },
    on: (channel, func) => ipcRenderer.on(channel, func),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
  }
});

console.log('Preload script finished');

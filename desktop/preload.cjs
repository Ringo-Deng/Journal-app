const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shiguangDesktop', {
  onBeforeClose(callback) {
    const listener = async (_event, id) => {
      try { await callback(); ipcRenderer.send('journal:close-result', id, true); }
      catch { ipcRenderer.send('journal:close-result', id, false); }
    };
    ipcRenderer.on('journal:before-close', listener);
    return () => ipcRenderer.removeListener('journal:before-close', listener);
  },
});

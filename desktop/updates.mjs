/** Keep update state in the main process; installation is owned by closeSafely. */
export function createDesktopUpdates(updater, onChange = () => {}) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  let state = { status: 'idle' }, pending;
  const set = value => { state = value; onChange({ ...state }); };
  updater.on('error', error => set({ status: 'error', message: String(error?.message || error) }));
  updater.on('download-progress', progress => set({ status: 'downloading', percent: Math.floor(progress.percent) }));
  updater.on('update-downloaded', info => set({ status: 'ready', version: info.version }));
  return {
    get state() { return { ...state }; },
    check() {
      if (pending) return pending;
      if (state.status === 'ready') return Promise.resolve(state);
      set({ status: 'checking' });
      pending = Promise.resolve().then(async () => {
        try {
          const result = await updater.checkForUpdates();
          if (result?.isUpdateAvailable) {
            set({ status: 'downloading', percent: 0 });
            await updater.downloadUpdate();
          } else set({ status: 'current' });
        } catch (error) {
          set({ status: 'error', message: String(error?.message || error) });
        } finally { pending = undefined; }
        return { ...state };
      });
      return pending;
    },
    // Caller must finish the renderer flush and backend shutdown first.
    install(restart = false) {
      if (state.status !== 'ready') return false;
      updater.quitAndInstall(true, restart);
      return true;
    },
  };
}

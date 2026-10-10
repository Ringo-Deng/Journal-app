import { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } from 'electron';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { availablePort, backendEnvironment, isInternalURL } from './runtime.mjs';
import { probePageTurnAudio } from './audio-probe.mjs';
import { createDesktopUpdates } from './updates.mjs';
import { createMacUpdates } from './mac-updates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
// A stable directory across releases; deliberately separate from the source edition.
app.setPath('userData', process.env.SHIGUANG_DESKTOP_TEST_DIR || resolve(app.getPath('appData'), 'ShiguangJournalDesktop'));
let window, backend, origin, closing = false, exiting = false;
let backendExited = false;
const backendReplies = new Map();
const closeReplies = new Map();
let diagnostic = '';
let checkingAudio = false;
let updates;
let updatePromptOpen = false;
function updateMenu(state) {
  const item = Menu.getApplicationMenu()?.getMenuItemById('check-updates');
  if (item) {
    item.label = state.status === 'ready' ? `重启更新至 ${state.version}`
      : state.status === 'available' ? `下载新版 ${state.version}…`
      : state.status === 'checking' ? '正在检查更新…'
      : state.status === 'downloading' ? `正在下载更新 ${state.percent || 0}%` : '检查更新';
    item.enabled = !['checking', 'downloading'].includes(state.status);
  }
  if (['ready', 'available'].includes(state.status)) void offerUpdate();
}
async function offerUpdate() {
  if (updatePromptOpen || closing || exiting || !window || window.isDestroyed()) return;
  updatePromptOpen = true;
  try {
    const state = updates.state;
    if (state.status === 'available') {
      const { response } = await dialog.showMessageBox(window, { type: 'info',
        message: `发现新版 ${state.version}`,
        detail: '点击下载将在浏览器下载 Mac 版。下载完成后，请先正常退出拾光手帐，再解压并替换原应用。手帐资料保存在独立目录，无需删除。',
        buttons: ['下载新版', '稍后'], defaultId: 1, cancelId: 1 });
      if (response === 0 && !closing && !exiting) {
        try { await shell.openExternal(state.url); }
        catch {
          if (!window.isDestroyed()) await dialog.showMessageBox(window, { type: 'warning',
            message: '暂时无法打开下载链接', detail: '请稍后从“拾光手帐”菜单重试下载。', buttons: ['知道了'] });
        }
      }
      return;
    }
    const { response } = await dialog.showMessageBox(window, { type: 'info',
      message: `新版 ${updates.state.version} 已下载`,
      detail: '重启前会先保存手帐。选择稍后，将在正常退出时安装更新。',
      buttons: ['重启更新', '稍后'], defaultId: 1, cancelId: 1 });
    if (response === 0) await closeSafely(true);
  } finally { updatePromptOpen = false; }
}
async function checkUpdates() {
  if (!updates || closing || exiting) return;
  if (['ready', 'available'].includes(updates.state.status)) { await offerUpdate(); return; }
  const state = await updates.check();
  if (closing || exiting || window.isDestroyed() || ['ready', 'available', 'downloading'].includes(state.status)) return;
  await dialog.showMessageBox(window, { type: state.status === 'error' ? 'warning' : 'info',
    message: state.status === 'error' ? '暂时无法检查更新' : '当前已是最新版本',
    detail: state.status === 'error' ? '当前版本可以继续使用，请稍后重试。\n' + state.message : `当前版本：${pkg.version}`,
    buttons: ['知道了'] });
}

async function checkPageTurnAudio() {
  if (checkingAudio || closing || exiting || !window || window.isDestroyed()) return;
  checkingAudio = true;
  try {
    const report = await window.webContents.executeJavaScript(`(${probePageTurnAudio.toString()})().then(results => ({ results }), error => ({ error: String(error?.message || error) }))`, true);
    if (report.error) throw Error(report.error);
    const results = report.results;
    if (!window.isDestroyed()) await dialog.showMessageBox(window, { type: 'info',
      message: '三段翻页音效已完成播放',
      detail: '如果刚才听到了声音，但翻页时没有声音，请反馈是编辑还是 3D 阅读。\n如果刚才仍然无声，请检查系统声音设置中拾光手帐使用的输出设备（扬声器、耳机或显示器）。\n\n' +
        results.map((result, i) => `${['编辑翻页', '阅读音效一', '阅读音效二'][i]}：${result.played.toFixed(2)} 秒`).join('\n'),
      buttons: ['知道了'] });
  } catch (error) {
    if (!window.isDestroyed()) await dialog.showMessageBox(window, { type: 'warning', message: '翻页音效检查失败',
      detail: '请将下面的信息反馈给开发者：\n\n' + String(error?.message || error), buttons: ['知道了'] });
  } finally { checkingAudio = false; }
}

function backendRequest(type) {
  if (backendExited) return Promise.reject(Error('本地服务已退出'));
  return new Promise((ok, fail) => {
    const id = randomUUID();
    const timer = setTimeout(() => { backendReplies.delete(id); fail(Error('本地服务响应超时')); }, 15000);
    backendReplies.set(id, result => { clearTimeout(timer); ok(result); });
    backend.postMessage({ type, id });
  });
}

async function closeSafely(restartForUpdate = false) {
  if (closing || exiting || !window) return;
  closing = true;
  try {
    // Prevent new edits between the flush acknowledgement and backend shutdown.
    await window.webContents.executeJavaScript('document.activeElement?.blur(); document.body.inert = true;');
    await new Promise((ok, fail) => {
      const id = randomUUID();
      const timer = setTimeout(() => { closeReplies.delete(id); fail(Error('页面没有确认保存完成，请稍后重试。')); }, 20000);
      closeReplies.set(id, success => {
        clearTimeout(timer);
        if (success) ok(); else fail(Error('手帐尚未保存，请处理页面上的保存提示后再退出。'));
      });
      window.webContents.send('journal:before-close', id);
    });
    const result = await backendRequest('desktop-shutdown');
    if (!result.ok) throw Error('仍有图片处理、备份或保存任务，请等待完成后再退出。');
    exiting = true;
    updates?.install?.(restartForUpdate);
    window.destroy();
    app.quit();
  } catch (error) {
    if (window && !window.isDestroyed()) {
      await window.webContents.executeJavaScript('document.body.inert = false;').catch(() => {});
      await dialog.showMessageBox(window, { type: 'warning', message: '暂时无法退出', detail: error.message, buttons: ['返回手帐'] });
    }
  } finally { closing = false; }
}

ipcMain.on('journal:close-result', (event, id, success) => {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) return;
  const reply = closeReplies.get(id);
  if (reply) { closeReplies.delete(id); reply(success === true); }
});

async function start() {
  const stamp = (await readFile(resolve(root, 'dist/client/.shiguang-version'), 'utf8')).trim();
  if (stamp !== pkg.version) throw Error('页面构建版本与应用不一致，请重新打包。');
  await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
  // Stable origin preserves browser-side reading positions and preferences.
  const port = await availablePort(process.env.SHIGUANG_DESKTOP_TEST_DIR ? 14330 : 14329);
  origin = `http://127.0.0.1:${port}`;
  backend = utilityProcess.fork(resolve(root, 'local/server-bootstrap.mjs'), [], {
    cwd: root, env: backendEnvironment(app.getPath('userData'), port), stdio: 'pipe', serviceName: '拾光本地服务',
  });
  backend.stdout.on('data', () => {});
  backend.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); });
  backend.on('message', message => {
    const reply = backendReplies.get(message?.id);
    if (reply) { backendReplies.delete(message.id); reply(message); }
  });
  backend.on('exit', () => {
    backendExited = true;
    if (window && !exiting && !closing) {
      // Retain the renderer's unsaved content; never reload after an unexpected exit.
      void dialog.showMessageBox(window, { type: 'error', message: '本地服务已停止', detail: '当前页面已保留。请先导出未保存的手帐，再重新打开应用。', buttons: ['保留页面'] });
    }
  });
  let healthy = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (backendExited) throw Error(`本地服务启动失败。${diagnostic}`);
    try {
      const health = await (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) })).json();
      if (health.appVersion === pkg.version && health.pid === backend.pid) { healthy = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!healthy) throw Error('本地服务启动超时。');
  window = new BrowserWindow({ width: 1380, height: 920, minWidth: 900, minHeight: 650,
    title: '拾光手帐', show: false, backgroundColor: '#f6f2eb',
    webPreferences: { preload: resolve(root, 'desktop/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!isInternalURL(url, origin)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('close', event => { if (!exiting) { event.preventDefault(); void closeSafely(); } });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(`${origin}/?build=${encodeURIComponent(pkg.version)}`);
  // Mac only checks public release metadata; users replace the bundle themselves.
  if (process.platform === 'darwin' && app.isPackaged && !process.env.SHIGUANG_DESKTOP_TEST_DIR) {
    updates = createMacUpdates(pkg.version, process.arch, updateMenu);
  }
  if (process.platform === 'win32' && app.isPackaged && !process.env.SHIGUANG_DESKTOP_TEST_DIR) {
    try {
      const { default: electronUpdater } = await import('electron-updater');
      updates = createDesktopUpdates(electronUpdater.autoUpdater, updateMenu);
    } catch (error) { console.warn('自动更新初始化失败', error); }
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '拾光手帐', submenu: [{ label: '打开资料文件夹', click: () => shell.openPath(app.getPath('userData')) },
      ...(updates ? [{ id: 'check-updates', label: '检查更新', click: () => void checkUpdates() }] : []),
      { label: '检查翻页音效', click: () => checkPageTurnAudio() },
      { type: 'separator' }, { label: '退出拾光手帐', accelerator: 'CmdOrCtrl+Q', click: () => closeSafely() }] },
    { role: 'editMenu' }, { role: 'windowMenu' },
  ]));
  if (updates) setTimeout(() => { if (!closing && !exiting && updates.state.status === 'idle') void updates.check(); }, 10000).unref();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { window.restore(); window.show(); window.focus(); } });
  app.on('activate', () => { window?.show(); window?.focus(); });
  app.on('before-quit', event => { if (!exiting && window) { event.preventDefault(); void closeSafely(); } });
  app.on('window-all-closed', () => { if (exiting) app.quit(); });
  // Electron emits ready after the ESM entry finishes evaluating.
  void app.whenReady().then(start).catch(error => {
    dialog.showErrorBox('拾光手帐无法启动', error.message); exiting = true; backend?.kill(); app.quit();
  });
}

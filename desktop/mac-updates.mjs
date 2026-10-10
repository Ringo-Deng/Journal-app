const feedURL = 'https://ringo-deng.github.io/Journal-app/mac-update.json';
const releaseURL = 'https://github.com/Ringo-Deng/Journal-app/releases/download';

function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function macUpdateFromManifest(manifest, currentVersion, arch) {
  const next = versionParts(manifest?.version), current = versionParts(currentVersion);
  if (!next || !current || manifest?.arch !== arch || arch !== 'arm64') throw Error('Mac 更新信息无效，请稍后重试。');
  const different = next.findIndex((part, index) => part !== current[index]);
  if (different === -1 || next[different] < current[different]) return { status: 'current' };
  // Never open an arbitrary URL supplied by the network; releases have one fixed owner/name.
  return { status: 'available', version: manifest.version,
    url: `${releaseURL}/v${manifest.version}/shiguang-journal-v${manifest.version}-mac-arm64.zip` };
}

/** Notification only: no bundle writes, installation, shutdown, or user-data changes. */
export function createMacUpdates(currentVersion, arch, onChange = () => {}, fetcher = fetch) {
  let state = { status: 'idle' }, pending;
  const set = value => { state = value; onChange({ ...state }); };
  return {
    get state() { return { ...state }; },
    check() {
      if (pending) return pending;
      set({ status: 'checking' });
      pending = Promise.resolve().then(async () => {
        try {
          const response = await fetcher(feedURL, { signal: AbortSignal.timeout(10000),
            cache: 'no-store', headers: { Accept: 'application/json' } });
          if (!response.ok) throw Error('暂时无法连接更新服务。');
          set(macUpdateFromManifest(await response.json(), currentVersion, arch));
        } catch (error) {
          set({ status: 'error', message: String(error?.message || error) });
        } finally { pending = undefined; }
        return { ...state };
      });
      return pending;
    },
  };
}

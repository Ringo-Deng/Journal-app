import { mkdir, mkdtemp, rm, readFile, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { backupToken, fail, readArchive, writeArchive } from "./backup-archive.mjs";
import { commitRestore, planRestore, summaryOf, validateSnapshot } from "./backup-restore.mjs";
import { resolveNotebookAssetSources } from "../lib/notebook-material-sources.mjs";

export { recoverBackupTransaction } from "./backup-restore.mjs";
export function journalBackupSnapshot(state, fonts = [], assets = []) {
  const backupState = structuredClone(state);
  backupState.books = resolveNotebookAssetSources(state.books, assets);
  const usedFontIds = new Set();
  function findFonts(value) {
    if (Array.isArray(value)) value.forEach(findFonts);
    else if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value)) {
        if (key === "fontFamily" && typeof item === "string")
          for (const match of item.matchAll(/Journal User ([a-f0-9]{24})/g))
            usedFontIds.add(match[1]);
        findFonts(item);
      }
  }
  findFonts(backupState);
  return {
    state: backupState,
    assets: [],
    materialJobs: [],
    pinterestImports: [],
    catalog: {
      revision: 0,
      autoManaged: true,
      taxonomy: { groups: [], labels: { content: [], style: [], color: [] } },
      overrides: {},
    },
    classificationJobs: [],
    photos: [],
    fonts: structuredClone(fonts.filter((font) => usedFontIds.has(font.id))),
    histories: [],
    previous: null,
    trash: { entries: [], deletedSources: [] },
  };
}
export function createFullBackup({
  data,
  publicDir,
  appVersion,
  validateState,
  getSnapshot,
  exclusive,
  reload,
}) {
  const sessions = new Map(),
    ttl = 30 * 60 * 1000;
  let preparing = false;
  async function clean() {
    for (const [token, s] of sessions)
      if (!s.inUse && Date.now() - s.time > ttl) {
        sessions.delete(token);
        await rm(s.directory, { recursive: true, force: true });
      }
    const base = join(data, ".backup-staging"),
      active = new Set([...sessions.values()].map((s) => s.directory));
    let entries;
    try {
      if (!(await lstat(base)).isDirectory()) throw fail("备份临时目录无效。");
      entries = await readdir(base, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    for (const entry of entries) {
      const directory = join(base, entry.name);
      if (
        entry.isDirectory() &&
        /^session-[a-zA-Z0-9]+$/.test(entry.name) &&
        !active.has(directory) &&
        Date.now() - (await lstat(directory)).mtimeMs > ttl
      )
        await rm(directory, { recursive: true, force: true });
    }
  }
  async function stage() {
    await clean();
    if (sessions.size >= 4) throw fail("已有多份备份待处理，请先关闭之前的备份预览。", 409);
    const base = join(data, ".backup-staging");
    await mkdir(base, { recursive: true, mode: 0o700 });
    if (!(await lstat(base)).isDirectory()) throw fail("备份临时目录无效。");
    return mkdtemp(join(base, "session-"));
  }
  const save = (session) => {
    const token = backupToken();
    sessions.set(token, { ...session, time: Date.now() });
    return token;
  };
  const session = (token, kind) => {
    const value = sessions.get(token);
    if (!value || value.kind !== kind || Date.now() - value.time > ttl)
      throw fail("备份预览已过期，请重新选择文件。", 410);
    return value;
  };
  async function inspect(staged) {
    validateSnapshot(staged.manifest.snapshot, validateState);
    const files = new Map(staged.manifest.files.map((f) => [f.path, f]));
    for (const photo of staged.manifest.snapshot.photos)
      if (files.get(photo.originalFile)?.sha256 !== photo.id)
        throw fail("照片原片与照片记录不匹配。");
    for (const font of staged.manifest.snapshot.fonts)
      if (files.get(`user-fonts/${font.id}${font.ext}`)?.sha256 !== font.sha)
        throw fail("字体文件与字体记录不匹配。");
  }
  return {
    handles: (path) => path.startsWith("/api/backup/"),
    async handle(path, req, res, json, body) {
      if (path === "/api/backup/export" && req.method === "POST") {
        const input = await body(req);
        const scope = input.scope ?? "all";
        if (!["all", "journals"].includes(scope)) throw fail("备份范围无效。");
        const directory = await stage();
        try {
          const exported = await exclusive(async () => {
            const snapshot = await getSnapshot(scope);
            if (input.revision !== snapshot.state.revision)
              throw fail("其他窗口更新了资料，请先刷新后再备份。", 409);
            validateSnapshot(snapshot, validateState);
            return writeArchive({ data, publicDir, directory, snapshot, appVersion, scope });
          });
          const token = save({ ...exported, directory, kind: "export" });
          return json(res, {
            token,
            url: `/api/backup/download/${token}`,
            scope,
            summary: summaryOf(exported.manifest.snapshot, exported.manifest.files),
          });
        } catch (e) {
          await rm(directory, { recursive: true, force: true });
          throw e;
        }
      }
      if (path === "/api/backup/preview" && req.method === "POST") {
        if (preparing) throw fail("已有备份正在检查，请稍后重试。", 409);
        preparing = true;
        let directory;
        try {
          directory = await stage();
          const staged = await readArchive(req, directory);
          await inspect(staged);
          let imports = [];
          try {
            imports = JSON.parse(await readFile(join(data, "backup-imports.json"), "utf8"));
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
          const alreadyImported = imports.some((entry) => entry.id === staged.id);
          const token = save({ ...staged, kind: "import" });
          return json(res, {
            token,
            scope: staged.manifest.scope,
            alreadyImported,
            createdAt: staged.manifest.createdAt,
            appVersion: staged.manifest.appVersion,
            summary: summaryOf(staged.manifest.snapshot, staged.manifest.files),
          });
        } catch (e) {
          if (directory) await rm(directory, { recursive: true, force: true });
          throw e;
        } finally {
          preparing = false;
        }
      }
      const download = /^\/api\/backup\/download\/([a-f0-9-]{36})$/.exec(path);
      if (download && req.method === "GET") {
        const s = session(download[1], "export");
        if (s.inUse) throw fail("备份正在下载。", 409);
        s.inUse = true;
        const info = await lstat(s.archive);
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": info.size,
          "Content-Disposition": `attachment; filename="shiguang-${s.manifest.scope === "journals" ? "journals" : "all"}-${s.manifest.createdAt.slice(0, 10)}.shiguang-backup"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        try {
          await pipeline(createReadStream(s.archive), res);
        } finally {
          s.inUse = false;
        }
        return;
      }
      const restore = /^\/api\/backup\/restore\/([a-f0-9-]{36})$/.exec(path);
      if (restore && req.method === "POST") {
        const s = session(restore[1], "import");
        if (s.inUse) throw fail("备份正在恢复，请稍后查看结果。", 409);
        s.inUse = true;
        try {
          const input = await body(req);
          const result = await exclusive(async () => {
            const current = await getSnapshot("restore");
            if (input.revision !== current.state.revision)
              throw fail("其他窗口更新了手帐，请刷新后重新确认恢复。", 409);
            if (current.imports.some((entry) => entry.id === s.id))
              return { alreadyImported: true };
            // A prior planning error can leave only temporary files. Rebuild against current data.
            await rm(join(s.directory, "commit"), { recursive: true, force: true });
            const plan = await planRestore({ staged: s, current, data, validateState });
            await commitRestore(data, plan);
            await reload();
            return { alreadyImported: false };
          });
          sessions.delete(restore[1]);
          await rm(s.directory, { recursive: true, force: true });
          return json(res, {
            ...result,
            summary: summaryOf(s.manifest.snapshot, s.manifest.files),
          });
        } finally {
          s.inUse = false;
        }
      }
      const discard = /^\/api\/backup\/session\/([a-f0-9-]{36})$/.exec(path);
      if (discard && req.method === "DELETE") {
        const s = sessions.get(discard[1]);
        if (s?.inUse) throw fail("备份正在使用，请稍后关闭。", 409);
        if (s) {
          sessions.delete(discard[1]);
          await rm(s.directory, { recursive: true, force: true });
        }
        return json(res, { discarded: true });
      }
      throw fail("备份操作不存在。", 404);
    },
  };
}

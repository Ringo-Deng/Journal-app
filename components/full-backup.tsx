"use client";
import { useRef, useState } from "react";
import { Download, FolderOpen, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Summary = {
  books: number;
  photos: number;
  materials: number;
  processing: number;
  fonts: number;
  histories: number;
  trash: number;
  files: number;
  bytes: number;
  titles: string[];
};
type Preview = {
  token: string;
  summary: Summary;
  alreadyImported: boolean;
  createdAt: string;
  appVersion: string;
};
async function result<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Error(value.error || "备份操作未完成，请重试。");
  return value;
}
const size = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
function Counts({ summary }: { summary: Summary }) {
  return (
    <div className="full-backup-counts">
      {(
        [
          ["笔记本", summary.books],
          ["照片原片", summary.photos],
          ["素材", summary.materials],
          ["处理记录", summary.processing],
          ["自定义字体", summary.fonts],
          ["历史备份", summary.histories],
          ["回收站记录", summary.trash],
        ] as const
      ).map(([label, count]) => (
        <span key={label}>
          {label}
          <strong>{count}</strong>
        </span>
      ))}
      <span>
        文件总大小<strong>{size(summary.bytes)}</strong>
      </span>
    </div>
  );
}
export default function FullBackup({
  open,
  onClose,
  onPrepare,
  onRestored,
  onLegacyExport,
  onLegacyImport,
}: {
  open: boolean;
  onClose: () => void;
  onPrepare: () => Promise<number>;
  onRestored: () => Promise<void>;
  onLegacyExport: () => Promise<void>;
  onLegacyImport: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    working = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [download, setDownload] = useState<{ token: string; url: string; summary: Summary } | null>(
      null,
    ),
    [restored, setRestored] = useState(false),
    [refreshNeeded, setRefreshNeeded] = useState(false);
  const discard = (token: string) =>
    fetch("/api/backup/session/" + token, { method: "DELETE" }).catch(() => {});
  async function work(fn: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setMessage("");
    } finally {
      setBusy(false);
      working.current = false;
    }
  }
  function close() {
    if (working.current) return;
    if (preview) void discard(preview.token);
    if (download) void discard(download.token);
    setPreview(null);
    setDownload(null);
    setRestored(false);
    setRefreshNeeded(false);
    setMessage("");
    setError("");
    onClose();
  }
  async function exportAll() {
    await work(async () => {
      setMessage("正在保存手帐并打包全部资料…");
      if (download) await discard(download.token);
      setDownload(null);
      const revision = await onPrepare();
      const value = await result<{ token: string; url: string; summary: Summary }>(
        await fetch("/api/backup/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision }),
        }),
      );
      setDownload(value);
      setMessage("备份已打包并校验，请下载保存。");
    });
  }
  async function inspect(file?: File) {
    if (!file) return;
    await work(async () => {
      setRestored(false);
      if (preview) await discard(preview.token);
      setPreview(null);
      if (download) await discard(download.token);
      setDownload(null);
      setMessage("正在读取备份，检查全部文件和图片引用…");
      const value = await result<Preview>(
        await fetch("/api/backup/preview", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        }),
      );
      setPreview(value);
      setMessage(
        value.alreadyImported
          ? "这份备份已经恢复过，无需重复导入。"
          : "全部文件校验通过。确认后会新增资料，保留已有内容。",
      );
    });
    if (input.current) input.current.value = "";
  }
  async function restore() {
    if (!preview) return;
    await work(async () => {
      setMessage("正在准备资料并恢复，请保持窗口打开…");
      const revision = await onPrepare();
      const value = await result<{ alreadyImported: boolean }>(
        await fetch("/api/backup/restore/" + preview.token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision }),
        }),
      );
      setRestored(true);
      setRefreshNeeded(true);
      await onRestored();
      setRefreshNeeded(false);
      setMessage(
        value.alreadyImported
          ? "这份备份已经恢复过，未重复添加。"
          : "恢复完成，文件校验已通过，原有内容已保留。",
      );
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent className="journal-dialog full-backup-dialog" aria-busy={busy}>
        <DialogTitle>备份与恢复</DialogTitle>
        <DialogDescription>
          一份备份带走笔记、照片原片、素材与分类、处理记录、自定义字体、历史备份和照片回收站。AI
          密钥不包含在内。
        </DialogDescription>
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => void exportAll()}>
            <Download />
            备份全部资料
          </button>
          <button className="outline" disabled={busy} onClick={() => input.current?.click()}>
            <FolderOpen />
            选择完整备份
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".shiguang-backup"
          hidden
          onChange={(e) => void inspect(e.target.files?.[0])}
        />
        {download && (
          <section className="full-backup-preview">
            <Counts summary={download.summary} />
            <a className="primary" href={download.url} download>
              下载完整备份
            </a>
            <p className="microcopy">打包完成后请保存文件；下载链接在 30 分钟后过期。</p>
          </section>
        )}
        {preview && (
          <section className="full-backup-preview">
            <p>
              备份时间：{new Date(preview.createdAt).toLocaleString()} · v{preview.appVersion}
            </p>
            <Counts summary={preview.summary} />
            <p className="full-backup-titles">
              {preview.summary.titles.join(" · ") || "没有笔记本，仍可恢复素材与照片。"}
            </p>
            <button
              className="primary"
              disabled={busy || restored || preview.alreadyImported}
              onClick={() => void restore()}
            >
              {restored
                ? "已恢复"
                : preview.alreadyImported
                  ? "已导入过这份备份"
                  : "确认恢复为新增资料"}
            </button>
          </section>
        )}
        {(busy || message) && (
          <p className="full-backup-status" role="status">
            {busy && <Loader2 className="spinning" />}
            {message}
          </p>
        )}
        {refreshNeeded && !busy && (
          <button
            className="outline"
            onClick={() =>
              void work(async () => {
                await onRestored();
                setRefreshNeeded(false);
                setMessage("资料已恢复，页面已更新。");
              })
            }
          >
            资料已恢复，重新载入页面
          </button>
        )}
        {error && (
          <p role="alert" className="full-backup-error">
            {error}
          </p>
        )}
        <details>
          <summary>旧版手帐备份</summary>
          <p className="microcopy">
            旧版 JSON
            备份包含手帐及其引用图片，不包含完整素材库、照片库和字体。原有导入方式继续可用。
          </p>
          <div className="row">
            <button className="outline" disabled={busy} onClick={() => void work(onLegacyExport)}>
              导出旧版手帐备份
            </button>
            <button
              className="outline"
              disabled={busy}
              onClick={() => {
                close();
                onLegacyImport();
              }}
            >
              导入旧版 JSON
            </button>
          </div>
        </details>
        <div className="row">
          <button className="outline" disabled={busy} onClick={close}>
            关闭
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

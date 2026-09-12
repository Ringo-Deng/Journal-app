'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { fontResponse, refreshUserFonts, type UserFont } from '@/lib/user-fonts';

export default function FontSettings() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [hasError, setHasError] = useState(false);

  async function importFonts(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    setHasError(false);
    setMessage('正在导入字体…');
    const imported: UserFont[] = [];
    const errors: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          if (file.size > 80 * 1024 * 1024) throw Error(`${file.name} 太大，单个字体包不能超过 80 MB。`);
          const response = await fetch(`/api/fonts/import?filename=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'Content-Type': file.name.toLowerCase().endsWith('.zip') ? 'application/zip' : 'application/octet-stream' },
            body: file,
          });
          const data = fontResponse(await response.json());
          if (!response.ok) throw Error(data.error || `${file.name} 导入失败。`);
          imported.push(...data.fonts);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `${file.name} 导入失败。`);
        }
      }
      const count = new Set(imported.map(font => font.id)).size;
      setHasError(errors.length > 0);
      setMessage([
        count ? `已导入 ${count} 个字体，可在文字工具栏的字体列表中选择。` : '',
        ...errors,
        errors.length ? '已保存的字体仍可在字体列表中选择。' : !count ? '没有找到可导入的字体文件。' : '',
      ].filter(Boolean).join(' '));
    } finally {
      // ZIP 导入可能已保存部分字体，再遇到无效文件；失败时也刷新已保存的字体。
      refreshUserFonts();
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return <section className="app-settings-fonts" aria-labelledby="app-settings-fonts-title">
    <div className="app-settings-section-heading">
      <h3 id="app-settings-fonts-title">字体</h3>
      <button type="button" className="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="spinning" aria-hidden="true" /> : <Upload aria-hidden="true" />}
        {busy ? '导入中…' : '导入字体'}
      </button>
    </div>
    <p className="app-settings-hint">支持 TTF、OTF、WOFF、WOFF2 和 ZIP 字体包，导入后可在文字工具栏中选择。</p>
    <input ref={input} hidden type="file" multiple accept=".ttf,.otf,.woff,.woff2,.zip" aria-label="选择要导入的字体文件" onChange={event => void importFonts(event.currentTarget.files)} />
    {!!message && <output className={`app-settings-font-feedback${hasError ? ' is-error' : ''}`} aria-live="polite">{message}</output>}
  </section>;
}

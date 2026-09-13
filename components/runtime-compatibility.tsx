'use client';

import './runtime-compatibility.css';
import { useCallback, useEffect, useState } from 'react';
import { normalizePinterestResolvePayload } from '@/lib/pinterest-resolve-compat';

function isPinterestResolveRequest(input: RequestInfo | URL) {
  const value =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    return new URL(value, window.location.href).pathname === '/api/materials/pinterest/resolve';
  } catch {
    return false;
  }
}

export default function RuntimeCompatibility({ appVersion }: { appVersion: string }) {
  const [runtimeVersion, setRuntimeVersion] = useState<string | null>(null);

  const checkRuntime = useCallback(async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) return;
      const health = (await response.json()) as { ok?: boolean; appVersion?: string };
      if (health.ok !== true) return;
      setRuntimeVersion(
        health.appVersion === appVersion ? null : String(health.appVersion || '旧版'),
      );
    } catch {
      // A brief offline state should not cover the editor. A confirmed version mismatch should.
    }
  }, [appVersion]);

  useEffect(() => {
    const originalFetch = window.fetch;
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (!response.ok || !isPinterestResolveRequest(input)) return response;

      try {
        const raw = (await response.clone().json()) as Record<string, unknown>;
        const existingImages = Array.isArray(raw?.images) ? raw.images : [];
        if (existingImages.length) return response;

        const normalized = normalizePinterestResolvePayload(raw);
        if (!normalized || !normalized.images.length) return response;

        const headers = new Headers(response.headers);
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.delete('Content-Length');
        return new Response(JSON.stringify(normalized), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        return response;
      }
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    void checkRuntime();
    const timer = window.setInterval(() => void checkRuntime(), 3000);
    const visible = () => {
      if (document.visibilityState === 'visible') void checkRuntime();
    };
    window.addEventListener('focus', checkRuntime);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkRuntime);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [checkRuntime]);

  if (!runtimeVersion) return null;
  return (
    <div className="runtime-mismatch" role="alertdialog" aria-modal="true" aria-labelledby="runtime-mismatch-title">
      <section>
        <h2 id="runtime-mismatch-title">拾光需要重新启动</h2>
        <p>
          当前页面是 v{appVersion}，本地后台仍是 v{runtimeVersion}。新旧版本混用可能导致保存失败。
        </p>
        <p>请重新启动拾光手帐；如果正在编辑，不要刷新，本页内容会继续保留。</p>
        <button className="primary" onClick={() => void checkRuntime()}>
          我已重新启动，重新检测
        </button>
      </section>
    </div>
  );
}

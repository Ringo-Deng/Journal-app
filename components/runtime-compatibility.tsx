'use client';

import { useEffect } from 'react';
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

export default function RuntimeCompatibility() {
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

  return null;
}

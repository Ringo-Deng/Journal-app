'use client';

import { useEffect } from 'react';

type ProcessedItem = {
  id: string;
  imported?: boolean;
};

type ProcessedJob = {
  id: string;
  items?: ProcessedItem[];
};

const recoveryKey = 'journal-material-recovery-20260908';

export default function MaterialRecovery() {
  useEffect(() => {
    try {
      if (window.localStorage.getItem(recoveryKey) === 'done') return;
    } catch {
      // Storage can be unavailable in a hardened browser; recovery can still run safely.
    }

    const controller = new AbortController();

    const recover = async () => {
      try {
        const jobsResponse = await fetch('/api/materials/jobs', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!jobsResponse.ok) return;

        const data = (await jobsResponse.json()) as unknown;
        if (!Array.isArray(data)) return;

        const jobs = data as ProcessedJob[];
        let importedAny = false;

        for (const job of jobs) {
          if (!job || typeof job.id !== 'string' || !Array.isArray(job.items)) continue;
          const pendingIds = job.items
            .filter((item) => item && typeof item.id === 'string' && !item.imported)
            .map((item) => item.id);

          for (let index = 0; index < pendingIds.length; index += 100) {
            const itemIds = pendingIds.slice(index, index + 100);
            const importResponse = await fetch('/api/materials/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: job.id,
                itemIds,
                category: '我的素材',
                tags: '本机处理',
              }),
              signal: controller.signal,
            });
            if (!importResponse.ok) return;
            importedAny = true;
          }
        }

        try {
          window.localStorage.setItem(recoveryKey, 'done');
        } catch {
          // A failed marker only means the harmless scan may run again next time.
        }

        if (importedAny && !controller.signal.aborted) window.location.reload();
      } catch (error) {
        if ((error as Error).name !== 'AbortError') return;
      }
    };

    void recover();
    return () => controller.abort();
  }, []);

  return null;
}

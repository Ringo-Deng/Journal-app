'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import MaterialCutEditor, {
  type MaterialCutGuard,
  type MaterialCutOutput,
  type MaterialCutSaveProgress,
} from './material-cut-editor';
import type {
  PageMaterialCutOutput,
  PageMaterialCutPlacement,
  PageMaterialCutTarget,
} from '@/lib/page-material-cut';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

type Props = {
  open: boolean;
  target: PageMaterialCutTarget | null;
  onClose: () => void;
  onBeforeSave: (
    target: PageMaterialCutTarget,
    placements: PageMaterialCutPlacement[],
  ) => void | Promise<void>;
  onApply: (
    target: PageMaterialCutTarget,
    outputs: PageMaterialCutOutput[],
  ) => void | Promise<void>;
};

type UploadResponse = { src?: string; width?: number; height?: number; error?: string };

export default function PageMaterialCutter({
  open,
  target,
  onClose,
  onBeforeSave,
  onApply,
}: Props) {
  const saved = useRef<Map<string, PageMaterialCutOutput>>(new Map());
  const savedByIndex = useRef<PageMaterialCutOutput[]>([]);
  const savingRef = useRef(false);
  const guardRef = useRef<MaterialCutGuard>({ dirty: false, busy: false });
  const [saving, setSaving] = useState(false);
  const [guard, setGuard] = useState<MaterialCutGuard>({ dirty: false, busy: false });

  useEffect(() => {
    saved.current = new Map();
    savedByIndex.current = [];
    savingRef.current = false;
    guardRef.current = { dirty: false, busy: false };
    setSaving(false);
    setGuard({ dirty: false, busy: false });
  }, [open, target?.sessionId]);

  useEffect(() => {
    if (!open || (!guard.dirty && !guard.busy && !saving)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [guard.busy, guard.dirty, open, saving]);

  const updateGuard = useCallback((next: MaterialCutGuard) => {
    guardRef.current = next;
    setGuard((current) =>
      current.dirty === next.dirty && current.busy === next.busy ? current : next,
    );
  }, []);

  function requestClose() {
    if (savingRef.current || guardRef.current.busy) return;
    if (
      guardRef.current.dirty &&
      !window.confirm(
        saved.current.size
          ? '已有裁片暂存在本机，但还没有应用到纸面。确定放弃本次裁切吗？'
          : '本次裁切草稿尚未应用。确定放弃并返回纸面吗？',
      )
    )
      return;
    onClose();
  }

  async function savePiece(output: MaterialCutOutput, progress: MaterialCutSaveProgress) {
    if (!target) throw Error('裁切目标已经关闭，请返回纸面后重试。');
    savingRef.current = true;
    setSaving(true);
    try {
      let stored = saved.current.get(progress.saveId);
      if (!stored) {
        const response = await fetch('/api/material-cuts/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: output.data, saveId: progress.saveId }),
        });
        const result = (await response.json()) as UploadResponse;
        if (!response.ok || !result.src || !result.width || !result.height)
          throw Error(result.error || '裁片保存失败，原素材没有被修改。');
        stored = {
          src: result.src,
          width: result.width,
          height: result.height,
          name: output.name,
          placement: output.placement,
        };
        saved.current.set(progress.saveId, stored);
      }
      savedByIndex.current[progress.index] = stored;
      if (progress.index === progress.total - 1) {
        const outputs = Array.from(
          { length: progress.total },
          (_, index) => savedByIndex.current[index],
        );
        if (outputs.some((item) => !item))
          throw Error('部分裁片尚未保存，裁切草稿已保留，可继续应用。');
        await onApply(target, outputs as PageMaterialCutOutput[]);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && requestClose()}>
      <DialogContent
        className="page-material-cut-dialog material-cut-host"
        showCloseButton={!saving && !guard.busy}
      >
        <DialogTitle>自由裁切 · {target?.name || '素材'}</DialogTitle>
        <DialogDescription>
          只修改当前纸面上的这一个素材；裁切区按原图方向显示，放回后保留纸面的旋转、翻转和拉伸。素材库原图保持不变，可用一次撤销完整恢复。
        </DialogDescription>
        {target && (
          <MaterialCutEditor
            key={target.sessionId}
            src={target.sourceSrc}
            name={target.name}
            saving={saving}
            onCancel={requestClose}
            cancelLabel="返回纸面"
            actionLabel="应用到纸面"
            onBeforeSave={(placements) => onBeforeSave(target, placements)}
            onSavePiece={savePiece}
            onGuardChange={updateGuard}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

'use client';
import { useState, useRef } from 'react';
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Copy,
  Scissors,
  Trash2,
  Check,
  Link,
  Unlink,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  Type,
  Maximize2,
  Layers3,
  Move,
} from 'lucide-react';
import type { Piece } from '@/lib/journal';
import ToolbarPopover from './toolbar-popover';

export function NumberControl({
  label,
  value,
  min,
  max,
  unit = '',
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 10) / 10));
  const [focused, setFocused] = useState(false);
  const edited = useRef(false);
  function commit() {
    const n = Number(draft);
    if (edited.current && draft.trim() && Number.isFinite(n) && n !== value)
      onCommit(Math.max(min, Math.min(max, n)));
    setFocused(false);
    setDraft(String(Math.round(value * 10) / 10));
  }
  return (
    <label className="tool-number">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step="0.5"
        value={focused ? draft : String(Math.round(value * 10) / 10)}
        onFocus={() => {
          edited.current = false;
          setDraft(String(Math.round(value * 10) / 10));
          setFocused(true);
        }}
        onChange={(e) => {
          edited.current = true;
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            edited.current = false;
            e.currentTarget.blur();
          }
        }}
      />
      {unit && <small>{unit}</small>}
    </label>
  );
}

export default function ElementControls({
  piece: p,
  height,
  proportional,
  onProportional,
  onPatch,
  onSize,
  onLayer,
  onCopy,
  onCut,
  onDelete,
  onFinish,
  onEdit,
  onReplace,
  onReset,
}: {
  piece: Piece;
  height: number;
  proportional: boolean;
  onProportional: () => void;
  onPatch: (patch: Partial<Piece>) => void;
  onSize: (axis: 'w' | 'h', value: number) => void;
  onLayer: (action: 'top' | 'bottom' | 'up' | 'down') => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onFinish: () => void;
  onEdit: () => void;
  onReplace: () => void;
  onReset: () => void;
}) {
  const maxX = Math.max(0, 100 - p.w);
  const maxY = Math.max(0, 100 - height);
  const centerX = maxX / 2;
  const centerY = maxY / 2;

  return (
    <fieldset className="element-controls element-controls-compact" aria-label="素材调整">
      <span className="tool-kind">
        {p.kind === 'text'
          ? '文字'
          : p.kind === 'photo'
            ? '照片'
            : p.kind === 'doodle'
              ? '手绘'
              : '素材'}
      </span>

      {p.kind === 'text' && (
        <>
          <button className="quiet compact-edit-text" onClick={onEdit}>
            <Type />
            <span>编辑文字</span>
          </button>
          <div className="compact-font-size">
            <NumberControl
              label="字号"
              value={p.fontSize || 18}
              min={12}
              max={100}
              onCommit={(v) => onPatch({ fontSize: v })}
            />
          </div>
          <label className="tool-color compact-color-control" title="文字颜色">
            <span>颜色</span>
            <input
              type="color"
              aria-label="纸面文字颜色"
              value={p.color || '#343b34'}
              onChange={(e) => onPatch({ color: e.target.value })}
            />
          </label>
        </>
      )}

      {p.kind === 'photo' && (
        <button className="quiet compact-photo-replace" onClick={onReplace}>
          换照片
        </button>
      )}

      <ToolbarPopover label="尺寸" icon={<Maximize2 />} align="center" className="compact-size-popover">
        <div className="toolbar-popover-title">尺寸与旋转</div>
        <div className="toolbar-popover-grid">
          <NumberControl
            label="宽度"
            value={p.w}
            min={1}
            max={100}
            unit="%"
            onCommit={(v) => onSize('w', v)}
          />
          <NumberControl
            label="高度"
            value={height}
            min={1}
            max={100}
            unit="%"
            onCommit={(v) => onSize('h', v)}
          />
          <NumberControl
            label="旋转"
            value={p.rotation}
            min={-180}
            max={180}
            unit="°"
            onCommit={(v) => onPatch({ rotation: v })}
          />
        </div>
        <div className="toolbar-popover-actions">
          <button className="quiet" aria-pressed={proportional} onClick={onProportional}>
            {proportional ? <Link /> : <Unlink />}
            {proportional ? '比例已锁' : '锁定比例'}
          </button>
          <button className="quiet" onClick={() => onPatch({ rotation: 0 })}>
            <RotateCcw />旋转归零
          </button>
        </div>
        {p.kind !== 'text' && (
          <div className="toolbar-popover-actions">
            <button className="quiet" onClick={() => onPatch({ flipX: !p.flipX })}>
              <FlipHorizontal2 />水平翻转
            </button>
            <button className="quiet" onClick={() => onPatch({ flipY: !p.flipY })}>
              <FlipVertical2 />垂直翻转
            </button>
            <button className="quiet" onClick={onReset}>恢复比例</button>
          </div>
        )}
      </ToolbarPopover>

      <ToolbarPopover label="位置" icon={<Move />} align="center" className="compact-position-popover">
        <div className="toolbar-popover-title">位置与透明度</div>
        <div className="toolbar-popover-grid">
          <NumberControl
            label="横向"
            value={p.x}
            min={0}
            max={maxX}
            unit="%"
            onCommit={(x) => onPatch({ x })}
          />
          <NumberControl
            label="纵向"
            value={p.y}
            min={0}
            max={maxY}
            unit="%"
            onCommit={(y) => onPatch({ y })}
          />
          <NumberControl
            label="透明度"
            value={(p.opacity ?? 1) * 100}
            min={0}
            max={100}
            unit="%"
            onCommit={(opacity) => onPatch({ opacity: opacity / 100 })}
          />
        </div>
        <div className="toolbar-popover-section">
          <span className="toolbar-popover-subtitle">页面对齐</span>
          <div className="toolbar-layer-grid">
            <button className="quiet" onClick={() => onPatch({ x: 0 })}>左对齐</button>
            <button className="quiet" onClick={() => onPatch({ x: centerX })}>水平居中</button>
            <button className="quiet" onClick={() => onPatch({ x: maxX })}>右对齐</button>
            <button className="quiet" onClick={() => onPatch({ y: 0 })}>顶部对齐</button>
            <button className="quiet" onClick={() => onPatch({ y: centerY })}>垂直居中</button>
            <button className="quiet" onClick={() => onPatch({ y: maxY })}>底部对齐</button>
          </div>
        </div>
      </ToolbarPopover>

      <ToolbarPopover label="图层" icon={<Layers3 />} align="center" className="compact-layer-popover">
        <div className="toolbar-popover-title">图层顺序</div>
        <div className="toolbar-layer-grid">
          <button className="quiet" onClick={() => onLayer('top')}><ArrowUpToLine />置顶</button>
          <button className="quiet" onClick={() => onLayer('up')}><ArrowUp />上一层</button>
          <button className="quiet" onClick={() => onLayer('down')}><ArrowDown />下一层</button>
          <button className="quiet" onClick={() => onLayer('bottom')}><ArrowDownToLine />置底</button>
        </div>
      </ToolbarPopover>

      <button
        className="quiet tool-icon compact-copy"
        aria-label="复制素材"
        title="复制 · ⌘D"
        onClick={onCopy}
      >
        <Copy />
      </button>
      <button
        className="quiet tool-icon compact-cut"
        aria-label="剪切素材"
        title="剪切 · ⌘X"
        onClick={onCut}
      >
        <Scissors />
      </button>
      <button
        className="quiet tool-icon compact-delete"
        aria-label="删除选中元素"
        title="删除 · Delete"
        onClick={onDelete}
      >
        <Trash2 />
      </button>
      <button className="quiet tool-finish-button" aria-label="完成编辑" onClick={onFinish}>
        <Check /><span>完成</span>
      </button>
    </fieldset>
  );
}

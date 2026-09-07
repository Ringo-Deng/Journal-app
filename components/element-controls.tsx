'use client';
import { useState, useRef } from 'react';
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Check,
  Link,
  Unlink,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  Type,
} from 'lucide-react';
import type { Piece } from '@/lib/journal';
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
  onDelete,
  onFinish,
  onEdit,
  onMore,
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
  onDelete: () => void;
  onFinish: () => void;
  onEdit: () => void;
  onMore: () => void;
  onReplace: () => void;
  onReset: () => void;
}) {
  return (
    <fieldset className="element-controls" aria-label="素材调整">
      <div className="tool-group">
        <span className="tool-kind">
          {p.kind === 'text'
            ? '文字'
            : p.kind === 'photo'
              ? '照片'
              : p.kind === 'doodle'
                ? '手绘'
                : '素材'}
        </span>
        <NumberControl
          label="宽度"
          value={p.w}
          min={1}
          max={100}
          unit="%"
          onCommit={(v) => onSize('w', v)}
        />
        <button
          className="quiet tool-icon"
          aria-label="锁定缩放比例"
          aria-pressed={proportional}
          title="锁定宽高比例，也可按住 Shift 缩放"
          onClick={onProportional}
        >
          {proportional ? <Link /> : <Unlink />}
        </button>
        <NumberControl
          label="高度"
          value={height}
          min={1}
          max={100}
          unit="%"
          onCommit={(v) => onSize('h', v)}
        />
        <NumberControl
          label="旋转角度"
          value={p.rotation}
          min={-180}
          max={180}
          unit="°"
          onCommit={(v) => onPatch({ rotation: v })}
        />
        <button
          className="quiet tool-icon"
          aria-label="旋转归零"
          title="旋转归零"
          onClick={() => onPatch({ rotation: 0 })}
        >
          <RotateCcw />
        </button>
      </div>
      <div className="tool-group">
        <button
          className="quiet"
          aria-label="置于顶层"
          title="置于顶层"
          onClick={() => onLayer('top')}
        >
          <ArrowUpToLine />
          <span>置顶</span>
        </button>
        <button
          className="quiet"
          aria-label="置于底层"
          title="置于底层"
          onClick={() => onLayer('bottom')}
        >
          <ArrowDownToLine />
          <span>置底</span>
        </button>
        <button
          className="quiet tool-icon"
          aria-label="上移一层"
          title="上移一层"
          onClick={() => onLayer('up')}
        >
          <ArrowUp />
        </button>
        <button
          className="quiet tool-icon"
          aria-label="下移一层"
          title="下移一层"
          onClick={() => onLayer('down')}
        >
          <ArrowDown />
        </button>
        <button
          className="quiet tool-icon"
          aria-label="复制素材"
          title="复制 · ⌘D"
          onClick={onCopy}
        >
          <Copy />
        </button>
        {p.kind !== 'text' && (
          <>
            <button
              className="quiet tool-icon"
              aria-label="水平翻转"
              title="水平翻转"
              onClick={() => onPatch({ flipX: !p.flipX })}
            >
              <FlipHorizontal2 />
            </button>
            <button
              className="quiet tool-icon"
              aria-label="垂直翻转"
              title="垂直翻转"
              onClick={() => onPatch({ flipY: !p.flipY })}
            >
              <FlipVertical2 />
            </button>
            <button className="quiet" onClick={onReset}>
              恢复比例
            </button>
          </>
        )}
        <button
          className="quiet tool-icon"
          aria-label="删除选中元素"
          title="删除 · Delete"
          onClick={onDelete}
        >
          <Trash2 />
        </button>
      </div>
      {p.kind === 'text' && (
        <div className="tool-group">
          <button className="quiet" onClick={onEdit}>
            <Type />
            编辑文字
          </button>
          <NumberControl
            label="字号"
            value={p.fontSize || 18}
            min={12}
            max={100}
            onCommit={(v) => onPatch({ fontSize: v })}
          />
          <label className="tool-color">
            颜色
            <input
              type="color"
              aria-label="纸面文字颜色"
              value={p.color || '#343b34'}
              onChange={(e) => onPatch({ color: e.target.value })}
            />
          </label>
          <select
            aria-label="文本框样式"
            value={p.frame || 'plain'}
            onChange={(e) => onPatch({ frame: e.target.value })}
          >
            {[
              ['plain', '无边框'],
              ['note', '便签'],
              ['collage', '拼贴便签'],
              ['outline', '手绘边框'],
              ['torn', '撕纸'],
              ['underline', '下划线'],
              ['ticket', '票据'],
              ['postcard', '明信片'],
              ['vellum', '半透明纸'],
              ['label', '标签'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="tool-group tool-finish">
        {p.kind === 'photo' && (
          <button className="quiet" onClick={onReplace}>
            换照片
          </button>
        )}
        <button className="quiet" onClick={onMore}>
          更多
        </button>
        <button className="quiet" aria-label="完成编辑" onClick={onFinish}>
          <Check />
          完成
        </button>
      </div>
      <p className="tool-tip">
        拖边框拉伸 · Shift 保持比例 / 15° 旋转 · 方向键微调 · 点击空白处完成
      </p>
    </fieldset>
  );
}

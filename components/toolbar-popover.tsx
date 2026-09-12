'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const COMPACT_TOOLBAR_CSS = String.raw`
/* compact contextual toolbar */
.fixed-element-tools{overflow:visible!important;overflow-x:visible!important;overflow-y:visible!important;white-space:normal;z-index:260}
.fixed-element-tools .single-piece-tools{display:flex;align-items:center;gap:6px;width:100%;min-width:0;max-width:100%;height:100%;flex-wrap:nowrap;overflow:visible}
.fixed-element-tools .element-controls.element-controls-compact,.fixed-element-tools .compact-context-tools{display:contents}
.fixed-element-tools .tool-kind{flex:none;font-weight:700;color:#53604d;padding-right:2px;order:0}
.fixed-element-tools .compact-edit-text{order:10}.fixed-element-tools .compact-font-control{order:20}.fixed-element-tools .compact-font-size{order:30}.fixed-element-tools .compact-color-control{order:40}.fixed-element-tools .compact-primary-style{order:50}.fixed-element-tools .compact-size-popover{order:60}.fixed-element-tools .compact-layer-popover{order:70}.fixed-element-tools .compact-material-cut{order:80}.fixed-element-tools .compact-delete{order:90}.fixed-element-tools .tool-finish-button{order:100}
.fixed-element-tools .compact-photo-replace{order:10}.fixed-element-tools .compact-photo-frame{order:20}.fixed-element-tools .compact-photo-crop{order:30}.fixed-element-tools .compact-photo-detail{order:40}.fixed-element-tools .compact-material-style{order:40}
.fixed-element-tools .element-controls-compact>.quiet,.fixed-element-tools .element-controls-compact>.tool-number,.fixed-element-tools .element-controls-compact>.tool-color,.fixed-element-tools .element-controls-compact>.toolbar-popover,.fixed-element-tools .compact-context-tools>.quiet,.fixed-element-tools .compact-context-tools>.compact-select-control,.fixed-element-tools .compact-context-tools>.toolbar-popover{flex:none}
.fixed-element-tools .element-controls-compact .quiet{padding:4px 7px}.fixed-element-tools .element-controls-compact .quiet svg{width:14px;height:14px}.fixed-element-tools .element-controls-compact>.tool-number span{font-size:10px}
.compact-color-control{display:flex;align-items:center;gap:4px;font-size:11px}.compact-color-control input[type=color]{width:24px;height:24px;padding:1px;border:1px solid #d4d8c8;border-radius:5px;background:#fffdf7}
.compact-select-control{display:flex!important;align-items:center;gap:4px!important;font-size:11px;color:#66705f}.compact-select-control select{max-width:112px;height:27px;padding:2px 5px;font-size:11px}
.tool-finish-button{background:#e4eadc!important;color:#40513c!important;font-weight:600}
.toolbar-popover{position:relative;display:inline-flex;align-items:center;flex:none;overflow:visible}.toolbar-popover-trigger{display:inline-flex!important;align-items:center;gap:4px!important;white-space:nowrap}.toolbar-popover-trigger[aria-expanded=true]{background:#e8ecdf!important;color:#41513d!important}.toolbar-popover-trigger>svg:first-child{width:14px;height:14px}.toolbar-popover-chevron{width:11px!important;height:11px!important;opacity:.58}
.toolbar-popover-panel{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:400;width:280px;max-width:min(320px,calc(100vw - 28px));box-sizing:border-box;display:flex;flex-direction:column;gap:9px;padding:11px;border:1px solid #d5dacd;border-radius:10px;background:#fffdf7;color:#50584c;box-shadow:0 12px 32px #3d453328,0 2px 8px #3d45331a;white-space:normal}.toolbar-popover-start .toolbar-popover-panel{left:0;transform:none}.toolbar-popover-end .toolbar-popover-panel{left:auto;right:0;transform:none}
.toolbar-popover-title{font:600 12px/1.2 'PingFang SC',sans-serif;color:#4c5947;padding-bottom:2px}.toolbar-popover-subtitle{font-size:10px;font-weight:600;color:#7a8274}.toolbar-popover-section{display:flex;flex-direction:column;gap:7px;padding-top:8px;border-top:1px solid #e2e5dc}.toolbar-popover-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.toolbar-popover-grid .tool-number{width:100%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:4px}.toolbar-popover-grid .tool-number input{width:100%!important;min-width:0;box-sizing:border-box}.toolbar-popover-row,.toolbar-popover-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.toolbar-popover-row label,.toolbar-popover-panel>label,.toolbar-popover-section label{display:flex;align-items:center;justify-content:space-between;gap:7px;font-size:11px}.toolbar-popover-panel select,.toolbar-popover-panel input:not([type=color]){min-width:0;padding:4px 6px;border:1px solid #d4d8c8;border-radius:5px;background:#fff;font-size:11px}.toolbar-popover-actions .quiet,.toolbar-layer-grid .quiet{border:1px solid #dde1d7;background:#faf9f3}.toolbar-layer-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.toolbar-layer-grid .quiet{justify-content:flex-start}.text-style-popover{width:310px}.photo-detail-popover{width:300px}.material-style-popover{width:250px}.font-import-status{display:block;line-height:1.5;white-space:normal}
.fixed-element-tools .cluster-tools{max-width:100%;min-width:0;overflow:visible}.fixed-element-tools .cluster-tools:has(+ .single-piece-tools)>span:first-child{display:none}.fixed-element-tools .cluster-tools:has(+ .single-piece-tools){width:auto;min-width:0;flex:none}.fixed-element-tools .cluster-tools:has(+ .single-piece-tools) button{white-space:nowrap}.fixed-element-tools .cluster-tools:has(+ .single-piece-tools)+.single-piece-tools{flex:1 1 auto;width:auto}
@media(max-width:900px){.fixed-element-tools{height:auto;min-height:46px;max-height:none;align-items:flex-start;padding-top:6px;padding-bottom:6px}.fixed-element-tools .single-piece-tools,.fixed-element-tools .cluster-tools{flex-wrap:wrap;height:auto}.toolbar-popover-panel{top:calc(100% + 5px)}}
`;

function ensureCompactToolbarStyles() {
  if (typeof document === 'undefined' || document.getElementById('shiguang-v0121-toolbar-styles')) return;
  const style = document.createElement('style');
  style.id = 'shiguang-v0121-toolbar-styles';
  style.textContent = COMPACT_TOOLBAR_CSS;
  document.head.appendChild(style);
}

export default function ToolbarPopover({
  label,
  icon,
  children,
  align = 'center',
  className = '',
  panelClassName = '',
  disabled = false,
  closeOnAction = false,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  panelClassName?: string;
  disabled?: boolean;
  closeOnAction?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureCompactToolbarStyles();
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={root} className={`toolbar-popover toolbar-popover-${align} ${className}`.trim()}>
      <button
        type="button"
        className="quiet toolbar-popover-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown className="toolbar-popover-chevron" />
      </button>
      {open && (
        <div
          className={`toolbar-popover-panel ${panelClassName}`.trim()}
          role="dialog"
          aria-label={label}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            if (closeOnAction && (event.target as Element).closest('button')) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

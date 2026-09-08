"use client";

import { useState } from "react";
import Book3DView from "./Book3DView";

type CompareMode = "before" | "after";

export default function Book3DTest({ appVersion }: { appVersion?: string }) {
  const [mode, setMode] = useState<CompareMode>("after");
  const paperStyle = mode === "before" ? "original" : "bound";

  return (
    <div className="book3d-compare-shell">
      <Book3DView
        key={mode}
        appVersion={appVersion}
        experiment
        initialPaperStyle={paperStyle}
      />
      <button
        type="button"
        className="book3d-compare-toggle"
        onClick={() => setMode((current) => (current === "after" ? "before" : "after"))}
        aria-label={mode === "after" ? "查看改动前的3D翻页效果" : "查看改动后的3D翻页效果"}
      >
        {mode === "after"
          ? "改动后（当前） · 查看改动前"
          : "改动前（3D原版） · 查看改动后"}
      </button>
      <style>{`
        .book3d-compare-shell .book3d-material-controls[aria-label="翻页效果对比"] {
          display: none;
        }
        .book3d-compare-toggle {
          position: fixed;
          top: 18px;
          right: 18px;
          z-index: 10000;
          border: 1px solid rgba(88, 72, 58, .18);
          border-radius: 999px;
          padding: 10px 16px;
          background: rgba(255, 252, 247, .92);
          box-shadow: 0 8px 28px rgba(57, 44, 33, .14);
          backdrop-filter: blur(12px);
          color: #443b33;
          font: 650 13px/1.2 PingFang SC, -apple-system, BlinkMacSystemFont, sans-serif;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

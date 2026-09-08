"use client";
import { useEffect, useRef, useState } from "react";
import { getReadingJpg } from "@/lib/reading-jpg";
import type { Book, Asset } from "@/lib/journal";
export default function ReadingJpgImage({
  book,
  assets,
  index,
  alt,
}: {
  book: Book;
  assets: Asset[];
  index: number | null;
  alt: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let objectURL = "";
    setUrl("");
    setFailed(false);
    getReadingJpg(book, assets, index).then(
      (blob) => {
        if (cancelled) return;
        objectURL = URL.createObjectURL(blob);
        setUrl(objectURL);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [book, assets, index, visible]);
  return (
    <div ref={host} style={{ width: "100%", height: "100%" }}>
      {url ? (
        <img
          src={url}
          alt={alt}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      ) : (
        <span role="status">{failed ? "页面图片生成失败，请返回编辑后重试" : "正在准备 JPG…"}</span>
      )}
    </div>
  );
}

"use client";
import Book3DView from "./Book3DView";
export default function Book3DTest({ appVersion }: { appVersion?: string }) {
  return <Book3DView appVersion={appVersion} experiment />;
}

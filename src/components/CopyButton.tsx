"use client";

import { useState } from "react";

/** Copies text for pasting into Instagram, Facebook, TikTok or Google. Falls back to selecting it. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      onClick={async e => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          const pre = (e.currentTarget.closest("[data-copy]") as HTMLElement | null)?.querySelector("[data-copy-text]");
          if (pre) window.getSelection()?.selectAllChildren(pre);
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

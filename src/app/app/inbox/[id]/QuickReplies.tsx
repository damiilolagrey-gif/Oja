"use client";

/** Tapping a chip fills the reply box so the rep can check it before sending. */
export function QuickReplies({ options }: { options: string[] }) {
  return (
    <div className="chips">
      {options.map(o => (
        <button key={o} type="button" className="btn" onClick={() => {
          const box = document.getElementById("reply-text") as HTMLInputElement | null;
          if (box) { box.value = o; box.focus(); }
        }}>
          {o.length > 34 ? o.slice(0, 32) + "…" : o}
        </button>
      ))}
    </div>
  );
}

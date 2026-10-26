"use client";

import { useState, useTransition } from "react";
import { draftWithAi } from "@/app/actions/inbox";

/** Fills the reply box with an AI draft. The rep reads and edits it before pressing Send. */
export function AiDraft({ conversationId, followUp }: { conversationId: string; followUp: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn ai" disabled={pending} onClick={() => start(async () => {
        setError(null);
        const r = await draftWithAi(conversationId, followUp ? "follow_up" : "reply");
        if ("error" in r) { setError(r.error); return; }
        const box = document.getElementById("reply-text") as HTMLInputElement | null;
        if (box) { box.value = r.text; box.focus(); }
      })}>
        {pending ? "Drafting…" : followUp ? "Draft follow-up with AI" : "Draft reply with AI"}
      </button>
      {error && <p className="error small" role="alert">{error}</p>}
    </>
  );
}

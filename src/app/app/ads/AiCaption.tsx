"use client";

import { useState, useTransition } from "react";
import { draftAd } from "@/app/actions/ads";

/** Fills the ad text from the chosen product and area. The shop reads and edits it before launching. */
export function AiCaption({ ai }: { ai: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn ai" disabled={pending} onClick={e => start(async () => {
        setError(null);
        const form = e.currentTarget.form!;
        const r = await draftAd(String(new FormData(form).get("productId") ?? ""), String(new FormData(form).get("area") ?? "Lagos"));
        if ("error" in r) { setError(r.error); return; }
        const box = form.elements.namedItem("message") as HTMLTextAreaElement | null;
        if (box) { box.value = r.text; box.focus(); }
      })}>
        {pending ? "Writing…" : ai ? "Write with AI" : "Fill in a starter"}
      </button>
      {error && <p className="error small" role="alert">{error}</p>}
    </>
  );
}

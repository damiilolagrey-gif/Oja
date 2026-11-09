"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { makeAds } from "@/app/actions/studio";

const IDEAS = [
  "Owambe ad, rich gold vibe",
  "New arrival, clean and classy",
  "Detty December, bright and fun",
  "Perfect gift for mum",
  "Back in stock, few pieces left",
];

/** The studio's front door: describe the ad, pick what it's for, get three finished ads. */
export function PromptForm({ products, start }: { products: { id: string; name: string }[]; start: string }) {
  const [state, action, pending] = useActionState(makeAds, undefined);
  const [productId, setProductId] = useState(start);
  const text = useRef<HTMLTextAreaElement>(null);
  return (
    <form
      className="panel panel-b prompt-box"
      onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <label className="field">
        <b>What ad do you want?</b>
        <textarea ref={text} className="input" name="prompt" required maxLength={300} placeholder="Owambe ad for my adire, gold vibe. For women 25 to 40 in Lagos." />
      </label>
      <div className="ideas" aria-label="Ideas to start from">
        {IDEAS.map(i => (
          <button key={i} type="button" onClick={() => { if (text.current) { text.current.value = i; text.current.focus(); } }}>{i}</button>
        ))}
      </div>
      <label className="field">What is it for?
        <select className="input" name="productId" value={productId} onChange={e => setProductId(e.target.value)}>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">Something not in my shop yet</option>
        </select>
      </label>
      {!productId && (
        <div className="row">
          <label className="field" style={{ flex: 2 }}>Item<input className="input" name="itemName" maxLength={80} placeholder="Adire two-piece" required /></label>
          <label className="field" style={{ flex: 1 }}>Price (₦)<input className="input num" name="itemPrice" inputMode="numeric" placeholder="25000" required /></label>
        </div>
      )}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn primary block" disabled={pending}>{pending ? "Designing your ads…" : "Make my ads"}</button>
    </form>
  );
}

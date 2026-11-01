"use client";

import { startTransition, useActionState, useState } from "react";
import { createCampaign } from "@/app/actions/ads";
import { AGES, BUDGET, DAYS, NG_STATES, PLATFORMS, PLATFORM_KEYS, type Platform } from "@/lib/ads";
import { naira, toKobo } from "@/lib/format";

type Props = {
  products: { id: string; name: string; stock: number }[];
  creatives: { id: string; productId: string | null; angle: string; source: string }[];
  startProduct: string;
  startCreative: string;
};

const POPULAR = ["Lagos", "FCT Abuja", "Rivers", "Oyo", "Ogun"];
const OTHERS = NG_STATES.filter(s => !POPULAR.includes(s));

export function CampaignForm({ products, creatives, startProduct, startCreative }: Props) {
  const [state, action, pending] = useActionState(createCampaign, undefined);
  const [platform, setPlatform] = useState<Platform>("META");
  const [productId, setProductId] = useState(startProduct);
  const [creativeId, setCreativeId] = useState(startCreative);
  const [daily, setDaily] = useState("3000");
  const [days, setDays] = useState("7");
  const mine = creatives.filter(c => c.productId === productId);
  const product = products.find(p => p.id === productId);
  const dailyKobo = toKobo(daily);
  const total = Number.isFinite(dailyKobo) && Number(days) > 0 ? dailyKobo * Number(days) : null;

  return (
    <form
      className="stack"
      // Submitted by hand so React doesn't reset the form after an error and lose the owner's choices.
      onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <section className="panel panel-b">
        <h2>Where should it run?</h2>
        <div className="choice">
          {PLATFORM_KEYS.map(k => (
            <label key={k}>
              <input type="radio" name="platform" value={k} checked={platform === k} onChange={() => setPlatform(k)} />
              <b>{PLATFORMS[k].label}</b>
              <span className="hint">{PLATFORMS[k].places}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel panel-b">
        <h2>What are you advertising?</h2>
        <label className="field">Product
          <select className="input" name="productId" value={productId} onChange={e => { setProductId(e.target.value); setCreativeId(""); }}>
            <option value="">The whole shop</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.stock ? "" : " (sold out)"}</option>)}
          </select>
          {product && !product.stock && <span className="hint">This is sold out. Chats from the ad will be offered the restock list.</span>}
        </label>
        {productId && (
          <label className="field">Ad copy
            <select className="input" name="creativeId" value={creativeId} onChange={e => setCreativeId(e.target.value)}>
              <option value="">{mine.length ? "Choose later" : "None yet: write some in Make ads"}</option>
              {mine.map(c => <option key={c.id} value={c.id}>{c.angle} ({c.source === "ai" ? "AI" : "template"})</option>)}
            </select>
          </label>
        )}
        <label className="field">Campaign name
          <input className="input" name="name" required maxLength={80} defaultValue={product ? `${product.name}: ${new Date().toLocaleString("en-NG", { month: "long" })}` : ""} key={productId} placeholder="Owambe season" />
        </label>
      </section>

      <section className="panel panel-b">
        <h2>Budget</h2>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>Each day (₦)
            <input className="input num" name="dailyBudget" inputMode="numeric" value={daily} onChange={e => setDaily(e.target.value)} required />
          </label>
          <label className="field" style={{ width: 120 }}>Days
            <input className="input num" name="days" type="number" min={DAYS.min} max={DAYS.max} value={days} onChange={e => setDays(e.target.value)} required />
          </label>
        </div>
        <div className="chips" role="group" aria-label="Quick budgets">
          {[2000, 3000, 5000, 10000].map(n => (
            <button key={n} type="button" className={`btn small ${toKobo(daily) === n * 100 ? "primary" : ""}`} onClick={() => setDaily(String(n))}>{naira(n * 100)}</button>
          ))}
        </div>
        <p className="small num">
          {total !== null ? <>Up to <b>{naira(total)}</b> in total, paid by you to {PLATFORMS[platform].short} with your own card.</> : "Enter a daily amount and number of days."}
          {Number.isFinite(dailyKobo) && dailyKobo < BUDGET.minKobo && <span className="error"> The minimum is {naira(BUDGET.minKobo)} a day.</span>}
        </p>
      </section>

      <section className="panel panel-b">
        <h2>Who should see it?</h2>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 6 }}>Where they live (leave empty for all of Nigeria)</legend>
          <div className="chips">
            {POPULAR.map(s => <label key={s}><input type="checkbox" name="locations" value={s} />{s}</label>)}
          </div>
          <details style={{ marginTop: 8 }}>
            <summary className="small" style={{ cursor: "pointer" }}>More states</summary>
            <div className="chips" style={{ marginTop: 8 }}>
              {OTHERS.map(s => <label key={s}><input type="checkbox" name="locations" value={s} />{s}</label>)}
            </div>
          </details>
        </fieldset>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>Youngest
            <input className="input num" name="ageMin" type="number" min={AGES.min} max={AGES.max} defaultValue={18} required />
          </label>
          <label className="field" style={{ flex: 1 }}>Oldest
            <input className="input num" name="ageMax" type="number" min={AGES.min} max={AGES.max} defaultValue={45} required />
          </label>
        </div>
      </section>

      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn primary block" disabled={pending}>{pending ? "Setting up…" : "Save campaign"}</button>
      <p className="hint">Saved as a draft. You get its tracked link straight away and start it when you&apos;re ready.</p>
    </form>
  );
}

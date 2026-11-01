"use client";

import { useEffect, useRef, useState } from "react";
import { SIZES, textOn, type SizeKey } from "@/lib/creative";

type Props = {
  productId: string;
  hasPhoto: boolean;
  name: string;
  price: string;
  shopName: string;
  stock: number;
  brandColor: string;
  headlines: string[]; // suggestions from the saved copy
};

const LAYOUTS = { bold: "Brand colour", photo: "Full photo", few: "Few left" } as const;
type Layout = keyof typeof LAYOUTS;

/** Draws an ad image on a canvas from the product photo, price and a WhatsApp call to action, and saves it as a PNG. */
export function AdImage(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<SizeKey>("square");
  const [layout, setLayout] = useState<Layout>(p.stock > 0 && p.stock <= 5 ? "few" : "bold");
  const [headline, setHeadline] = useState(p.headlines[0] ?? p.name);
  const [cta, setCta] = useState("Order on WhatsApp");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    if (!p.hasPhoto) return;
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setPhotoError(true);
    i.src = `/app/studio/photo/${p.productId}`;
  }, [p.productId, p.hasPhoto]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const { w, h } = SIZES[size];
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    draw(g, w, h, { ...p, layout, headline, cta, img });
  }, [size, layout, headline, cta, img, p]);

  const save = () => {
    canvas.current?.toBlob(b => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${p.name.replace(/[^\w-]+/g, "-").toLowerCase()}-${size}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };

  return (
    <div className="stack">
      <div className="studio-canvas">
        <canvas ref={canvas} aria-label={`Ad image preview for ${p.name}`} />
      </div>
      {photoError && <p className="notice small">We couldn&apos;t load this product&apos;s photo, so the image uses its first letter. Check the photo link on the product.</p>}
      {!p.hasPhoto && <p className="small muted">Add a photo link to the product for a better ad.</p>}
      <div className="row">
        {(Object.keys(SIZES) as SizeKey[]).map(k => (
          <button key={k} type="button" className={`btn ${size === k ? "primary" : ""}`} onClick={() => setSize(k)} aria-pressed={size === k}>
            {SIZES[k].label.split(":")[0]}
          </button>
        ))}
      </div>
      <p className="hint">{SIZES[size].label}</p>
      <div className="row">
        {(Object.keys(LAYOUTS) as Layout[]).map(k => (
          <button key={k} type="button" className={`btn ${layout === k ? "primary" : ""}`} onClick={() => setLayout(k)} aria-pressed={layout === k} disabled={k === "few" && !(p.stock > 0 && p.stock <= 5)}>
            {LAYOUTS[k]}
          </button>
        ))}
      </div>
      <label className="field">Headline on the image
        <input className="input" value={headline} maxLength={60} onChange={e => setHeadline(e.target.value)} list="studio-headlines" />
        <datalist id="studio-headlines">{p.headlines.map(h => <option key={h} value={h} />)}</datalist>
      </label>
      <label className="field">Button text
        <input className="input" value={cta} maxLength={28} onChange={e => setCta(e.target.value)} />
      </label>
      <button type="button" className="btn primary" onClick={save}>Download image</button>
    </div>
  );
}

type DrawInput = Props & { layout: Layout; headline: string; cta: string; img: HTMLImageElement | null };

function draw(g: CanvasRenderingContext2D, w: number, h: number, d: DrawInput) {
  const brand = d.brandColor;
  const ink = textOn(brand);
  const u = Math.min(w, h) / 100; // one unit = 1% of the short side
  const font = (px: number, weight = 800) => `${weight} ${Math.round(px)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.clearRect(0, 0, w, h);

  // Photo area
  const full = d.layout === "photo";
  const landscape = w > h;
  const photo = full
    ? { x: 0, y: 0, w, h }
    : landscape
      ? { x: 0, y: 0, w: w * 0.5, h }
      : { x: 6 * u, y: 6 * u, w: w - 12 * u, h: h * (h > w * 1.4 ? 0.55 : 0.58) - 6 * u };

  g.fillStyle = full ? "#111" : brand;
  g.fillRect(0, 0, w, h);
  g.save();
  roundRect(g, photo.x, photo.y, photo.w, photo.h, full || landscape ? 0 : 4 * u);
  g.clip();
  if (d.img) cover(g, d.img, photo.x, photo.y, photo.w, photo.h);
  else {
    g.fillStyle = shade(brand, ink === "#ffffff" ? 0.18 : -0.12);
    g.fillRect(photo.x, photo.y, photo.w, photo.h);
    g.fillStyle = ink;
    g.font = font(photo.h * 0.45);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(d.name[0]?.toUpperCase() ?? "", photo.x + photo.w / 2, photo.y + photo.h / 2);
  }
  g.restore();

  // Text area
  const pad = 6 * u;
  const area = full
    ? { x: pad, y: h * 0.58, w: w - 2 * pad, bottom: h - pad }
    : landscape
      ? { x: w * 0.5 + pad, y: pad * 1.5, w: w * 0.5 - 2 * pad, bottom: h - pad }
      : { x: pad, y: photo.y + photo.h + 5 * u, w: w - 2 * pad, bottom: h - pad };
  const textColor = full ? "#ffffff" : ink;
  if (full) {
    const grad = g.createLinearGradient(0, h * 0.4, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.78)");
    g.fillStyle = grad;
    g.fillRect(0, h * 0.4, w, h * 0.6);
  }

  g.textAlign = "left";
  g.textBaseline = "top";
  g.fillStyle = textColor;
  g.globalAlpha = 0.8;
  g.font = font(3.6 * u, 600);
  g.fillText(d.shopName.toUpperCase(), area.x, area.y);
  g.globalAlpha = 1;

  let y = area.y + 6 * u;
  g.font = font(7.5 * u);
  for (const line of wrap(g, d.headline || d.name, area.w).slice(0, 3)) {
    g.fillText(line, area.x, y);
    y += 8.6 * u;
  }

  // Price pill
  y += 1.5 * u;
  g.font = font(6 * u);
  const priceW = g.measureText(d.price).width + 6 * u;
  g.fillStyle = full ? brand : textColor;
  roundRect(g, area.x, y, priceW, 9 * u, 4.5 * u);
  g.fill();
  g.fillStyle = full ? ink : brand;
  g.textBaseline = "middle";
  g.fillText(d.price, area.x + 3 * u, y + 4.7 * u);

  if (d.layout === "few" && d.stock > 0) {
    g.font = font(4.2 * u, 700);
    g.fillStyle = textColor;
    g.fillText(`Only ${d.stock} left`, area.x + priceW + 3 * u, y + 4.7 * u);
  }

  // WhatsApp button at the bottom
  const btnH = 10 * u;
  const by = Math.max(y + 13 * u, area.bottom - btnH);
  g.fillStyle = "#1fa855";
  roundRect(g, area.x, by, area.w, btnH, btnH / 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = font(4.8 * u, 700);
  g.textAlign = "center";
  g.fillText(d.cta || "Order on WhatsApp", area.x + area.w / 2, by + btnH / 2 + 0.3 * u);
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > max && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Lightens (amount > 0) or darkens (< 0) a hex colour. */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v: number) => Math.round(Math.min(255, Math.max(0, amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

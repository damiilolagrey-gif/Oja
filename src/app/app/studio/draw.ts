import type { Design } from "@/lib/concepts";

export type Item = { name: string; price: string; shopName: string };

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const font = (px: number, weight = 800) => `${weight} ${Math.round(px)}px ${FONT}`;
const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/**
 * Draws one ad. `t` runs from 0 to 1 over a short video; a still image uses t = 1, where everything is in
 * place. Before its moment each element is hidden, then it fades and slides in.
 */
export function drawAd(g: CanvasRenderingContext2D, w: number, h: number, d: Design, item: Item, img: HTMLImageElement | null, t = 1) {
  const u = Math.min(w, h) / 100;
  const landscape = w > h * 1.2;
  const at = (start: number, len = 0.12) => ease((t - start) / len); // 0 → 1 between start and start+len
  g.save();
  g.clearRect(0, 0, w, h);
  g.globalAlpha = 1;

  // Background
  g.fillStyle = d.style === "photo" ? "#111" : d.bg;
  g.fillRect(0, 0, w, h);
  if (d.style === "festive") {
    // A soft frame and scattered sparkles in the accent colour.
    g.strokeStyle = d.accent;
    g.lineWidth = 1.2 * u;
    g.strokeRect(3 * u, 3 * u, w - 6 * u, h - 6 * u);
    g.fillStyle = d.accent;
    for (let i = 0; i < 18; i++) {
      const x = ((i * 37) % 100) / 100 * w;
      const y = ((i * 61) % 100) / 100 * h;
      g.globalAlpha = 0.18 + 0.12 * Math.sin(t * 6 + i);
      star(g, x, y, (0.8 + (i % 3) * 0.5) * u);
    }
    g.globalAlpha = 1;
  }

  // Photo area
  const photo =
    d.style === "photo"
      ? { x: 0, y: 0, w, h, r: 0 }
      : d.style === "split" || landscape
        ? { x: 0, y: 0, w: w * 0.5, h, r: 0 }
        : d.style === "minimal"
          ? { x: 10 * u, y: 10 * u, w: w - 20 * u, h: h * 0.5, r: 2 * u }
          : { x: 6 * u, y: 6 * u, w: w - 12 * u, h: h * (h > w * 1.4 ? 0.52 : 0.55) - 6 * u, r: 4 * u };
  g.save();
  g.beginPath();
  g.roundRect(photo.x, photo.y, photo.w, photo.h, photo.r);
  g.clip();
  const zoom = 1.08 - 0.08 * ease(t); // slow push in during a video
  if (img) cover(g, img, photo.x, photo.y, photo.w, photo.h, zoom);
  else {
    g.fillStyle = mix(d.bg, d.accent, 0.25);
    g.fillRect(photo.x, photo.y, photo.w, photo.h);
    g.fillStyle = d.ink;
    g.globalAlpha = 0.85;
    g.font = font(Math.min(photo.h * 0.42, photo.w * 0.6));
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(item.name[0]?.toUpperCase() ?? "", photo.x + photo.w / 2, photo.y + photo.h / 2);
    g.globalAlpha = 1;
  }
  g.restore();
  if (d.style === "photo") {
    const grad = g.createLinearGradient(0, h * 0.35, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.82)");
    g.fillStyle = grad;
    g.fillRect(0, h * 0.35, w, h * 0.65);
  }

  // Text area
  const pad = 6 * u;
  const area =
    d.style === "photo"
      ? { x: pad, y: h * (h > w * 1.4 ? 0.56 : 0.5), w: w - 2 * pad, bottom: h - pad }
      : d.style === "split" || landscape
        ? { x: w * 0.5 + pad, y: pad * 1.5, w: w * 0.5 - 2 * pad, bottom: h - pad }
        : d.style === "minimal"
          ? { x: 10 * u, y: photo.y + photo.h + 6 * u, w: w - 20 * u, bottom: h - 8 * u }
          : { x: pad, y: photo.y + photo.h + 5 * u, w: w - 2 * pad, bottom: h - pad };
  const ink = d.style === "photo" ? "#ffffff" : d.ink;
  g.textAlign = "left";
  g.textBaseline = "top";

  // Shop name
  g.globalAlpha = 0.75 * at(0.05);
  g.fillStyle = ink;
  g.font = font(3.4 * u, 600);
  g.fillText(item.shopName.toUpperCase(), area.x, area.y);

  // Headline, up to 3 lines
  let y = area.y + 5.5 * u;
  const hl = at(0.12, 0.15);
  g.globalAlpha = hl;
  g.font = font((d.style === "minimal" ? 6.6 : 7.6) * u, d.style === "minimal" ? 700 : 800);
  for (const line of wrap(g, d.headline, area.w).slice(0, 3)) {
    g.fillText(line, area.x + (1 - hl) * 4 * u, y);
    y += 8.6 * u;
  }

  // Subline
  if (d.subline) {
    g.globalAlpha = 0.9 * at(0.25);
    g.font = font(4 * u, 500);
    for (const line of wrap(g, d.subline, area.w).slice(0, 2)) {
      g.fillText(line, area.x, y + 0.5 * u);
      y += 5.4 * u;
    }
  }

  // Price pill
  y += 2 * u;
  const pr = at(0.35);
  g.globalAlpha = pr;
  g.font = font(5.6 * u);
  const priceW = g.measureText(item.price).width + 6 * u;
  g.fillStyle = d.accent;
  g.beginPath();
  g.roundRect(area.x, y, priceW, 8.6 * u, 4.3 * u);
  g.fill();
  g.fillStyle = contrastInk(d.accent);
  g.textBaseline = "middle";
  g.fillText(item.price, area.x + 3 * u, y + 4.5 * u);

  // WhatsApp button, with a pulse in the video
  const btnH = 10 * u;
  const by = Math.max(y + 12 * u, area.bottom - btnH);
  const pulse = t < 1 ? 1 + 0.04 * Math.sin(t * 40) * at(0.5) : 1;
  g.globalAlpha = at(0.48);
  g.save();
  g.translate(area.x + area.w / 2, by + btnH / 2);
  g.scale(pulse, pulse);
  g.fillStyle = "#1fa855";
  g.beginPath();
  g.roundRect(-area.w / 2, -btnH / 2, area.w, btnH, btnH / 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = font(4.6 * u, 700);
  g.textAlign = "center";
  g.fillText(d.cta, 0, 0.3 * u);
  g.restore();

  // Badge in the top corner
  if (d.badge) {
    const bd = at(0.6);
    g.globalAlpha = bd;
    g.font = font(3.8 * u, 800);
    g.textAlign = "center";
    const bw = g.measureText(d.badge).width + 6 * u;
    const bx = w - bw - 4 * u;
    const byy = 4 * u;
    g.save();
    g.translate(bx + bw / 2, byy + 4 * u);
    g.rotate(-0.05);
    g.scale(0.8 + 0.2 * bd, 0.8 + 0.2 * bd);
    g.fillStyle = d.accent;
    g.beginPath();
    g.roundRect(-bw / 2, -4 * u, bw, 8 * u, 4 * u);
    g.fill();
    g.fillStyle = contrastInk(d.accent);
    g.fillText(d.badge, 0, 0.3 * u);
    g.restore();
  }
  g.restore();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.35 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > max && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, zoom: number) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const iw = img.width * s;
  const ih = img.height * s;
  g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function mix(a: string, b: string, k: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(",")})`;
}

function contrastInk(hex: string) {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff";
}

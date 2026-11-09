"use client";

import { useEffect, useRef, useState } from "react";
import { SIZES, type SizeKey } from "@/lib/creative";
import { LIMIT, STYLES, STYLE_LABEL, type Design } from "@/lib/concepts";
import { drawAd, type Item } from "./draw";
import { usePhoto } from "./AdThumb";

const VIDEO_SECONDS = 6;

/** The full editor for one ad: pick a size, change the words and colours, download an image or a short video. */
export function AdMaker({ id, design: start, item, photo, save }: { id: string; design: Design; item: Item; photo: string | null; save: (data: FormData) => Promise<void> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [d, setD] = useState<Design>(start);
  const [size, setSize] = useState<SizeKey>("square");
  const [recording, setRecording] = useState<null | number>(null);
  const [note, setNote] = useState<string | null>(null);
  const img = usePhoto(photo);
  const set = <K extends keyof Design>(k: K, v: Design[K]) => setD(x => ({ ...x, [k]: v }));
  const filename = `${item.name.replace(/[^\w-]+/g, "-").toLowerCase()}-${size}`;

  useEffect(() => {
    const c = canvas.current;
    if (!c || recording !== null) return;
    const { w, h } = SIZES[size];
    c.width = w;
    c.height = h;
    drawAd(c.getContext("2d")!, w, h, d, item, img);
  }, [d, size, img, item, recording]);

  const download = (blob: Blob, ext: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const image = () => canvas.current?.toBlob(b => b && download(b, "png"), "image/png");

  // Records the canvas while the ad animates in, using the browser's own video encoder.
  const video = () => {
    const c = canvas.current;
    if (!c || typeof MediaRecorder === "undefined" || !c.captureStream) return setNote("This browser can't make videos. Try Chrome on Android or a computer.");
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
    if (!type) return setNote("This browser can't make videos. Try Chrome on Android or a computer.");
    const { w, h } = SIZES[size];
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    rec.onstop = () => {
      setRecording(null);
      download(new Blob(parts, { type }), type.includes("mp4") ? "mp4" : "webm");
      setNote(type.includes("mp4") ? null : "Saved as a WebM video. Instagram and TikTok prefer MP4: open it in CapCut or your gallery's editor and save again to convert.");
    };
    const t0 = performance.now();
    setRecording(0);
    rec.start();
    const frame = () => {
      const t = (performance.now() - t0) / 1000 / VIDEO_SECONDS;
      // The ad builds in over the first 70%, then holds so people can read it.
      drawAd(g, w, h, d, item, img, Math.min(1, t / 0.7));
      setRecording(Math.min(100, Math.round(t * 100)));
      if (t < 1) requestAnimationFrame(frame);
      else rec.stop();
    };
    requestAnimationFrame(frame);
  };

  return (
    <div className="maker">
      <div className="stack">
        <div className="studio-canvas"><canvas ref={canvas} aria-label={`Ad: ${d.headline}`} /></div>
        <div className="row">
          {(Object.keys(SIZES) as SizeKey[]).map(k => (
            <button key={k} type="button" className={`btn small ${size === k ? "primary" : ""}`} aria-pressed={size === k} onClick={() => setSize(k)} disabled={recording !== null}>
              {SIZES[k].label.split(":")[0]}
            </button>
          ))}
        </div>
        <p className="hint">{SIZES[size].label}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={image} disabled={recording !== null}>Download image</button>
          <button type="button" className="btn" onClick={video} disabled={recording !== null}>
            {recording !== null ? `Making video… ${recording}%` : `Download ${VIDEO_SECONDS}-second video`}
          </button>
        </div>
        {note && <p className="notice small">{note}</p>}
      </div>

      <form action={save} className="stack">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="design" value={JSON.stringify(d)} />
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 6 }}>Look</legend>
          <div className="row">
            {STYLES.map(s => (
              <button key={s} type="button" className={`btn small ${d.style === s ? "primary" : ""}`} aria-pressed={d.style === s} onClick={() => set("style", s)}>{STYLE_LABEL[s]}</button>
            ))}
          </div>
        </fieldset>
        <label className="field">Headline<input className="input" value={d.headline} maxLength={LIMIT.headline} onChange={e => set("headline", e.target.value)} /></label>
        <label className="field">Second line<input className="input" value={d.subline} maxLength={LIMIT.subline} onChange={e => set("subline", e.target.value)} /></label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>Button<input className="input" value={d.cta} maxLength={LIMIT.cta} onChange={e => set("cta", e.target.value)} /></label>
          <label className="field" style={{ flex: 1 }}>Sticker<input className="input" value={d.badge ?? ""} maxLength={LIMIT.badge} placeholder="None" onChange={e => set("badge", e.target.value || null)} /></label>
        </div>
        <div className="row">
          <label className="field">Background<input className="input swatch" type="color" value={d.bg} onChange={e => set("bg", e.target.value)} /></label>
          <label className="field">Text<input className="input swatch" type="color" value={d.ink} onChange={e => set("ink", e.target.value)} /></label>
          <label className="field">Highlight<input className="input swatch" type="color" value={d.accent} onChange={e => set("accent", e.target.value)} /></label>
        </div>
        <button className="btn">Save changes</button>
        <p className="hint">Hard-to-read colours and stickers that promise offers you didn&apos;t make are fixed when you save.</p>
      </form>
    </div>
  );
}

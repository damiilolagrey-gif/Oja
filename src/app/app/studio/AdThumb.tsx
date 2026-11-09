"use client";

import { useEffect, useRef, useState } from "react";
import type { Design } from "@/lib/concepts";
import { drawAd, type Item } from "./draw";

/** A small square preview of an ad, drawn in the browser. */
export function AdThumb({ design, item, photo, label }: { design: Design; item: Item; photo: string | null; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = usePhoto(photo);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.height = 540;
    drawAd(c.getContext("2d")!, 540, 540, design, item, img);
  }, [design, item, img]);
  return <canvas ref={ref} className="ad-thumb" role="img" aria-label={label} />;
}

/** Loads a photo for the canvas, or null while loading or if it fails. */
export function usePhoto(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return img;
}

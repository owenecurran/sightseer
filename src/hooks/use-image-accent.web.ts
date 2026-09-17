import { useEffect, useState } from 'react';

import {
  ACCENT_SAMPLE_SIZE,
  accentFromPixels,
  type ImageAccent,
} from '@/lib/image-accent';

// The same answer as the native hook, got without Skia.
//
// The native one decodes with Skia and reads an offscreen surface back. On web
// that is not merely slower, it is a crash: react-native-skia's web target
// loads CanvasKit asynchronously and every Skia call before that finishes
// throws — and an uncaught throw there takes the whole page down rather than
// one card, which this app has already been bitten by once (see
// liquid-glass-track-gated.web.tsx). Gating a hook behind CanvasKit's loader
// is not something a hook can do.
//
// A browser already has everything needed: an <img>, a canvas, and
// getImageData. So web does it that way and never touches Skia at all.

const cache = new Map<string, ImageAccent | null>();

// Crossing an origin without CORS taints the canvas, and getImageData on a
// tainted canvas throws a SecurityError. The photographs come from R2 on
// another origin, so the request has to be made anonymously for the pixels to
// be readable at all — and it still fails if the bucket sends no CORS header,
// which is why the read below is wrapped.
function sample(url: string): Promise<ImageAccent | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = ACCENT_SAMPLE_SIZE;
        canvas.height = ACCENT_SAMPLE_SIZE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context == null) return resolve(null);

        context.drawImage(image, 0, 0, ACCENT_SAMPLE_SIZE, ACCENT_SAMPLE_SIZE);
        const { data } = context.getImageData(0, 0, ACCENT_SAMPLE_SIZE, ACCENT_SAMPLE_SIZE);
        resolve(accentFromPixels(data));
      } catch {
        // A tainted canvas, or a browser that refused the read. The caller
        // falls back to the face's own colour, which is a worse card but a
        // working one.
        resolve(null);
      }
    };
    image.src = url;
  });
}

export function useImageAccent(url: string | undefined): ImageAccent | null {
  const cached = url != null ? cache.get(url) : undefined;
  const [accent, setAccent] = useState<ImageAccent | null>(cached ?? null);

  useEffect(() => {
    if (url == null || cached !== undefined) return;

    // The decode is asynchronous here, unlike native, so this genuinely does
    // need state — and a cancelled flag, because a feed row can recycle onto a
    // different photograph long before this resolves.
    let cancelled = false;
    void sample(url).then((result) => {
      cache.set(url, result);
      if (!cancelled) setAccent(result);
    });
    return () => {
      cancelled = true;
    };
  }, [url, cached]);

  return cached ?? accent;
}

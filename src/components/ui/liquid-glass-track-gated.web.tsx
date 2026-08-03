import type { ComponentProps } from 'react';
import { View } from 'react-native';
// Deep import: this package has no root-level web re-export and no package.json
// "exports" map restricting subpaths, so Metro resolves this against the
// package's real ESM output location (confirmed via its own package.json
// "module" field, "lib/module/index.js") — @shopify/react-native-skia/web
// alone does NOT resolve, it has to be the actual lib path.
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

import type { LiquidGlassTrack } from '@/components/ui/liquid-glass-track';

type Props = ComponentProps<typeof LiquidGlassTrack>;

// Web-only: react-native-skia's web target loads a CanvasKit WASM engine
// asynchronously — calling any Skia API (Skia.Path, Skia.Surface, etc.,
// all used inside liquid-glass-track.tsx) before that finishes throws.
// WithSkiaWeb is the library's own documented gate for exactly this: it
// dynamic-imports the real component and only renders it once CanvasKit is
// ready, showing `fallback` until then.
export function LiquidGlassTrackGated(props: Props) {
  return (
    <WithSkiaWeb
      getComponent={() => import('@/components/ui/liquid-glass-track')}
      componentProps={props}
      fallback={<View style={{ width: props.width, height: props.height }} />}
      opts={{
        // Metro doesn't serve node_modules' canvaskit.wasm binary at any
        // predictable URL on its own — confirmed live: without this, the
        // wasm fetch 404s and CanvasKit's init throws uncaught, which took
        // down the entire page render, not just this component. Loading it
        // from the CDN instead is react-native-skia's own documented fix
        // for exactly this. Version pinned to match the installed
        // canvaskit-wasm package (node_modules/canvaskit-wasm/package.json).
        locateFile: (file: string) => `https://unpkg.com/canvaskit-wasm@0.41.0/bin/full/${file}`,
      }}
    />
  );
}

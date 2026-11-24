import { ImageLoadingIcon } from '@/components/ui/image-loading-icon';

// Web keeps the walking mark. The road is drawn with Skia, which on the web
// has to download its CanvasKit engine before it can draw anything (see
// liquid-glass-track-gated.web.tsx), and a loader that has to load first is
// no use as a loader.
export function RoadLoader() {
  return <ImageLoadingIcon />;
}

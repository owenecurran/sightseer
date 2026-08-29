const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Base64 for ASCII input, written out rather than reaching for a platform
// encoder: `btoa` is web-only and `Buffer` is Node-only, so either branch
// would be a per-platform special case in otherwise shared code.
//
// Used to build `data:` URIs for the app's SVG artwork. Base64 specifically,
// not percent-encoding: Android's Glide only decodes base64 data URIs, so
// the raw-markup form that works in a browser fails silently on native.
//
// The inputs are all generated markup — path data, hex colours, numbers —
// so the single-byte assumption holds.
export function toBase64(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)];
    out += Number.isNaN(b) ? '=' : ALPHABET[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)];
    out += Number.isNaN(c) ? '=' : ALPHABET[c & 63];
  }
  return out;
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

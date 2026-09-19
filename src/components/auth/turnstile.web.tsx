import { useEffect, useRef, useState } from 'react';

import { ThemedText } from '@/components/themed-text';

// Cloudflare Turnstile on the web, rendered straight into the page.
//
// The native file beside this one runs the widget inside a WebView, because
// Turnstile is a browser script with no native SDK. That file also treats a
// missing WebView module as "captcha not configured" — and on web the module
// is deliberately never loaded, so `isTurnstileConfigured` came out false,
// no widget rendered, and sign-in sent no token at all.
//
// Which would be fine if the project did not require one. It does: captcha is
// enabled on the Supabase project, GoTrue rejects any password grant arriving
// without a token, and the app reports that as "the security check did not go
// through". Web sign-in could not succeed, with correct credentials, for
// anybody.
//
// On web none of the WebView machinery is needed. The script runs in the page
// it is already in, and the origin Cloudflare checks is the real one rather
// than the `baseUrl` the native side has to fake — which is why EXPO_PUBLIC_
// APP_ORIGIN is not consulted here.
//
// NOTE: the site key's allowed-hostnames list in Cloudflare has to include
// whatever host the page is served from. A key registered only for the
// production domain renders nothing on localhost, and the widget's own error
// callback is the only sign of it.

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

export const isTurnstileConfigured = Boolean(SITE_KEY);

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: 'light' | 'dark' | 'auto';
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// One load for the whole page, shared by every mount. Resolved rather than
// re-appended, because a second <script> for the same src re-runs the API and
// orphans any widget already on the page.
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.turnstile) return resolve();

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile')));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

type TurnstileProps = {
  onToken: (token: string | null) => void;
  action?: string;
  resetSignal?: number;
};

export function Turnstile({ onToken, action = 'signup', resetSignal = 0 }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  // The callback is held in a ref so re-rendering the parent never re-renders
  // the widget: Turnstile issues a token once per render, and tearing the
  // widget down mid-challenge loses it.
  //
  // Kept current from an effect rather than assigned during render, which
  // React's own lint forbids — a ref written while rendering is not a thing
  // the renderer can see or replay.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    void loadScript()
      .then(() => {
        if (cancelled || containerRef.current == null || window.turnstile == null) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action,
          theme: 'dark',
          callback: (token) => onTokenRef.current(token),
          // Expiry and error both clear the token rather than leaving a stale
          // one, which would fail verification server-side with a far more
          // confusing message than an empty widget.
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            onTokenRef.current(null);
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // `action` only ever comes from a literal at the call sites, so this
    // mounts once per screen.
  }, [action]);

  // Tokens are single use: once Supabase has verified one the same token is
  // rejected on a retry, and the widget will not issue another by itself.
  const lastReset = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastReset.current) return;
    lastReset.current = resetSignal;
    if (widgetIdRef.current != null) {
      window.turnstile?.reset(widgetIdRef.current);
      onTokenRef.current(null);
    }
  }, [resetSignal]);

  if (!SITE_KEY) return null;

  if (failed) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Could not load the security check. Check your connection and try again.
      </ThemedText>
    );
  }

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />;
}

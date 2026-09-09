import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

// Cloudflare Turnstile, which Supabase verifies server-side.
//
// It has to run in a WebView: Turnstile is a browser script with no native
// SDK, and Supabase's captcha support expects the token that script
// produces. The widget is tiny and appears once per signup, so the cost of
// a WebView here is a page nobody stays on rather than something in a feed.
//
// The site key is PUBLIC by design — it identifies the widget to
// Cloudflare and is meant to ship in a client. The matching secret goes in
// the Supabase dashboard (Auth → Attack Protection → Captcha) and is what
// actually validates the token; nothing here can be trusted on its own.

// Required, not imported.
//
// react-native-webview is a NATIVE module, and a static import of it
// evaluates at module load — which throws
// "RNCWebViewModule could not be found" on any binary built before it was
// added, taking the whole app down with it. That is not hypothetical: it
// happened here, and the same thing happened earlier with
// expo-notifications. A dev client is always older than the dependency you
// just installed, so this has to survive the module being absent.
//
// Guarded like this, the app runs today and Turnstile simply does not
// render; after the next native build it appears with no further change.
type WebViewModule = typeof import('react-native-webview');
// The instance type only, pulled from the module type — a value import
// here would defeat the guarded require below.
type WebViewInstance = InstanceType<WebViewModule['WebView']>;

const webViewModule: WebViewModule | null = (() => {
  if (Platform.OS === 'web') return null;
  try {
    return require('react-native-webview') as WebViewModule;
  } catch {
    return null;
  }
})();

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

// The origin the widget claims to be served from.
//
// Turnstile checks this against the hostnames registered on the site key
// and refuses to render if it does not match, so it is not decorative — it
// has to be a domain you actually listed in Cloudflare. Configured rather
// than hardcoded because the app's domain is a decision that outlives this
// file, and a wrong guess here fails at runtime with an unhelpful widget
// that simply never appears.
const ORIGIN = process.env.EXPO_PUBLIC_APP_ORIGIN;

// Configured AND loadable. Sign-up still works when either is false — it
// simply sends no token — so this degrades to the behaviour from before
// captcha existed rather than blocking signup on a binary that cannot
// render the widget.
export const isTurnstileConfigured =
  Boolean(SITE_KEY) && Boolean(ORIGIN) && webViewModule !== null;

// Height of Turnstile's own widget, plus a little. The managed widget is
// 65px tall at its default size; the WebView cannot size itself to its
// content, so this has to be stated.
const WIDGET_HEIGHT = 78;

type TurnstileProps = {
  // Fires with the token once Cloudflare is satisfied, and with null when
  // it expires or errors — so a caller can disable submit until it is held
  // a valid token.
  onToken: (token: string | null) => void;
  // Which protected surface this widget guards. Cloudflare records it
  // against the challenge, which is what makes the analytics per-surface
  // rather than one undifferentiated total.
  action?: string;
  // Bumped by the caller after a failed submit. Turnstile tokens are
  // SINGLE USE: once Supabase has verified one, the same token is rejected
  // on a retry, and the widget will not issue another by itself while the
  // page stays mounted. Without this a failed signup could never be
  // retried — the second attempt would always fail verification.
  resetSignal?: number;
};

// Rendered from the page itself rather than loaded from a URL, so there is
// no server involved and nothing to host. The baseUrl still matters: with
// `about:blank` Turnstile's domain check fails, which is why ORIGIN has to
// be a hostname registered on the site key.
function widgetHtml(siteKey: string, action: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
    <style>
      html, body { margin: 0; padding: 0; background: ${BrandColors.background}; }
      #widget { display: flex; justify-content: center; padding-top: 4px; }
    </style>
  </head>
  <body>
    <div id="widget"></div>
    <script>
      function post(type, token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, token: token || null }));
      }
      // Held so resetWidget() below can target it. turnstile.reset() with no
      // argument only works when there is exactly one widget on the page;
      // passing the id is what keeps this correct regardless.
      var widgetId = null;
      window.onloadTurnstileCallback = function () {
        widgetId = turnstile.render('#widget', {
          sitekey: '${siteKey}',
          action: '${action}',
          theme: 'dark',
          callback: function (token) { post('token', token); },
          'expired-callback': function () { post('expired'); },
          'error-callback': function () { post('error'); },
        });
      };
      // Called from the app after a failed submit, to issue a fresh token.
      window.resetWidget = function () {
        if (window.turnstile && widgetId !== null) {
          turnstile.reset(widgetId);
          post('reset');
        }
      };
      // The script may already have run by the time this executes.
      if (window.turnstile) { window.onloadTurnstileCallback(); }
      else { window.addEventListener('load', function () {
        if (window.turnstile) window.onloadTurnstileCallback();
      }); }
    </script>
  </body>
</html>`;
}

export function Turnstile({ onToken, action = 'signup', resetSignal = 0 }: TurnstileProps) {
  const [failed, setFailed] = useState(false);
  const webRef = useRef<WebViewInstance>(null);

  // Skipped on the first render: resetSignal starts at 0 and there is no
  // stale token to clear before anyone has submitted anything.
  const lastReset = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastReset.current) return;
    lastReset.current = resetSignal;
    webRef.current?.injectJavaScript('window.resetWidget && window.resetWidget(); true;');
  }, [resetSignal]);

  if (!isTurnstileConfigured || !SITE_KEY || !ORIGIN || !webViewModule) return null;
  const { WebView } = webViewModule;

  if (failed) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Could not load the security check. Check your connection and try again.
      </ThemedText>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webRef}
        source={{ html: widgetHtml(SITE_KEY, action), baseUrl: ORIGIN }}
        style={styles.web}
        // The widget is decoration around a token; nothing here should be
        // scrollable or selectable.
        scrollEnabled={false}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data) as {
              type: string;
              token: string | null;
            };
            // Expiry, error and reset all clear the token rather than
            // leaving a stale one that would fail verification server-side
            // with a confusing message.
            onToken(payload.type === 'token' ? payload.token : null);
          } catch {
            onToken(null);
          }
        }}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: WIDGET_HEIGHT,
    overflow: 'hidden',
  },
  web: {
    flex: 1,
    backgroundColor: BrandColors.background,
    marginHorizontal: -Spacing.one,
  },
});

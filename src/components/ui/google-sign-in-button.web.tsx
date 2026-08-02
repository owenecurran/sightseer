import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

type GoogleSignInButtonProps = {
  onError: (message: string) => void;
};

// Google Identity Services (GIS) — loaded at runtime, not an npm dependency.
// @react-native-google-signin/google-signin is native-only, so web gets
// Google's own official button + JS SDK instead: renders a real button and
// hands back an ID token JWT with no server-side redirect/popup-blocker
// concerns, the standard low-complexity way to get a credential in-browser.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme: string; size: string; width?: number; shape: string }
          ) => void;
        };
      };
    };
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_ID = 'google-identity-services';

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google) resolve();
      else existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Identity Services.'));
    document.head.appendChild(script);
  });
}

export function GoogleSignInButton({ onError }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!clientId) {
      onError('Google sign-in is not configured yet.');
      return;
    }

    loadGisScript()
      .then(() => {
        if (!isMounted || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
            });
            if (error) onError(error.message);
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'rectangular',
          width: Math.min(containerRef.current.clientWidth, 400) || undefined,
        });
      })
      .catch((err) => {
        if (isMounted) onError(err instanceof Error ? err.message : 'Could not load Google sign-in.');
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />;
}

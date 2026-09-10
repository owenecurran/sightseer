import { WebLanding } from '@/components/web-landing';

// The signed-out entry point on web.
//
// The native welcome screen is a single animated sheet that doubles as the
// sign-up form — the right shape for someone who already chose to install
// the app. On the web this is a page someone was linked to, often by a
// person rather than by intent, so it has to explain what Sightseer is
// before it asks for an account. Same route, same redirect from the root
// layout, different medium.
//
// Everything is in WebLanding because '/i/[code]' renders exactly this page
// with an invite band on top.
export default function WelcomeWebScreen() {
  return <WebLanding />;
}

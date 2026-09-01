// The terms a user must accept before using the app.
//
// ⚠️ PLACEHOLDER TEXT — NOT LEGAL ADVICE, AND NOT READY TO SHIP.
// The sections below are a structural skeleton covering what this app
// actually does (user-generated reviews and photos, precise location, third
// parties it sends data to). It has not been written or reviewed by a
// lawyer, names no jurisdiction, and omits things a real agreement needs.
// Replace the body text before any public release; the gate, the versioning
// and the acceptance record around it are all real and will keep working.

// Bump this whenever the terms materially change. Acceptance is recorded
// against the version, so raising it re-gates everyone who accepted an
// older one — which is the entire reason this is a version rather than a
// boolean.
export const TERMS_VERSION = '2026-08-29';

export type TermsSection = { heading: string; body: string };

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: 'What this app is',
    body: 'Sightseer is a place to record where you have been, rate it, and share that with people you choose. Reviews, photos, boards and travel books you create are yours.',
  },
  {
    heading: 'Your content',
    body: 'You keep ownership of everything you post. By posting it you allow us to store it and show it to the people your privacy settings allow. You are responsible for having the right to post what you upload, including photos of other people.',
  },
  {
    heading: 'What is not allowed',
    body: 'No illegal content, harassment, impersonation, or content you do not have the right to share. Reviews should reflect somewhere you actually went. Accounts that break these rules may be suspended.',
  },
  {
    heading: 'Location',
    body: 'Reviews are tied to places, and with your permission the app uses your device location to help you find nearby ones. Location attached to a review is shown to whoever can see that review. You can review your home locations and privacy settings at any time in Settings.',
  },
  {
    heading: 'Other people on the app',
    body: 'Tagging someone in a review makes that review visible to them and notifies them. Do not tag people in content they would not want to be associated with. Anyone can untag themselves.',
  },
  {
    heading: 'Services we rely on',
    body: 'The app stores data and photos with third-party providers and uses mapping and place-search services to identify locations. Using the app means your content passes through those services.',
  },
  {
    heading: 'Ending your use',
    body: 'You can stop using the app at any time and request deletion of your account. Some content may persist in backups for a period after deletion.',
  },
  {
    heading: 'Changes to these terms',
    body: 'If these terms change materially you will be asked to accept the new version before continuing to use the app.',
  },
];

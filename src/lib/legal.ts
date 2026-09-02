// Where the app points people for the things a store review looks for.
//
// ⚠️ PLACEHOLDERS — set these before submitting to either store.
//
// The privacy policy is the one that actually blocks submission: Apple and
// Google both require a reachable URL at review time, and it has to describe
// what this app really collects (email, name, birthdate, hashed phone
// numbers, precise location, photos, contacts) and the third parties it
// passes data to. A URL that 404s is a rejection.
//
// The support address matters for a different reason: App Store rule 1.2
// expects an app hosting user-generated content to publish a way to reach
// its operator about that content. Reporting and blocking are already built;
// this is the missing third piece.
//
// Left empty rather than pointed at a guess, so the links below simply do not
// render until they are real — a dead link is worse than an absent one.
export const PRIVACY_POLICY_URL = '';
export const SUPPORT_EMAIL = '';

export const hasPrivacyPolicy = PRIVACY_POLICY_URL.length > 0;
export const hasSupportEmail = SUPPORT_EMAIL.length > 0;

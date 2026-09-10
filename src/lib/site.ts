// Where the web build is served from.
//
// Invite links are built against this and are pasted into other people's
// messages, so it has to be the public domain rather than whatever origin
// the current build happens to be running on — a link generated from a
// preview deploy or from localhost that then went out to a friend would be
// dead on arrival.
//
// Overridable by env so a preview deployment can generate links that point
// at itself while testing, without that becoming the default anyone ships.
export const SITE_ORIGIN = process.env.EXPO_PUBLIC_SITE_ORIGIN ?? 'https://sightseer.world';

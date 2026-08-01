// The 5 main tabs, in nav-bar/pager order — shared by floating-nav-bar.tsx
// (icon row + tap targets), (tabs)/_layout.native.tsx (PagerView page order),
// and each tab screen (to know its own index for usePagerFocusEffect/
// useTabFocusEffect). One shared source rather than hand-copying this order
// in multiple places, where it could silently drift out of sync — a pager
// page order that doesn't match the nav bar's icon order would make tapping
// a tab visibly slide to the wrong page.
export const TAB_ROUTES = ['/', '/explore', '/review', '/boards', '/profile'] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

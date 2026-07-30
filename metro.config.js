const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @rnmapbox/maps' package.json "exports" map only lists its root entry
// point, but its own internal files (e.g. Mapbox.native.js) import sibling
// files via plain relative paths (e.g. "./components/SymbolLayer.js") that
// aren't themselves listed in that map. Metro's newer strict package-exports
// resolution (on by default here — confirmed via node_modules/metro-config's
// own default of unstable_enablePackageExports: true) enforces the exports
// map even for those internal relative imports, so it fails to resolve a
// file that demonstrably exists on disk (confirmed directly). Disabling this
// flag reverts to pre-exports-map Node resolution behavior, the standard fix
// for this class of "package ships exports map but hasn't fully accounted
// for its own relative imports" issue.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;

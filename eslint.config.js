// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// No em dashes in anything a person reads: string literals, template text
// and JSX text. Taken out of the whole app by request, and this is what
// keeps new copy from bringing them back. Comments are not checked; nobody
// sees those. En dashes (U+2013) are allowed, since they are right in a
// range like "Nov 2 – Nov 5" or "A–Z".
const EM_DASH_MESSAGE =
  'No em dashes in visible copy. Use a full stop, a colon or a comma instead.';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'supabase/functions/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/—/]', message: EM_DASH_MESSAGE },
        { selector: 'TemplateElement[value.raw=/—/]', message: EM_DASH_MESSAGE },
        { selector: 'JSXText[value=/—/]', message: EM_DASH_MESSAGE },
      ],
    },
  },
]);

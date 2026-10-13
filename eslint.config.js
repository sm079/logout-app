import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/build/',
      '**/.svelte-kit/',
      '**/.wrangler/',
      '**/coverage/',
      '**/test/legacy/',
      'apps/web/static/',
      'supabase/.temp/'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    // Plus the version the web build fills in (apps/web/vite.config.ts)
    languageOptions: { globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly', __APP_COMMIT__: 'readonly' } }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    rules: {
      // Every {@html} renders text through markup(), which escapes it, or a fixed icon path
      'svelte/no-at-html-tags': 'off',
      // Maps, Sets and URLs here are working values, not state the page reacts to
      'svelte/prefer-svelte-reactivity': 'off',
      // svelte-check decides which compiler warnings need ignoring
      'svelte/no-unused-svelte-ignore': 'off'
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-control-regex': 'off'
    }
  }
);

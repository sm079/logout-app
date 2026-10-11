/** @type {import('prettier').Config} */
export default {
  singleQuote: true,
  printWidth: 140,
  trailingComma: 'none',
  arrowParens: 'avoid',
  plugins: ['prettier-plugin-svelte'],
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }]
};

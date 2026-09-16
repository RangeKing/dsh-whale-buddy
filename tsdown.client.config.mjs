/**
 * Client bundle configuration.
 *
 * Portions adapted from:
 * https://github.com/dsh-plugins/dsh-thought-buddy (tsdown.client.config.mjs)
 * BSD-3-Clause. See THIRD_PARTY_NOTICES.md.
 *
 * The `window.__ModuleLoader__.load({ id, factory })` shell is the DSH web
 * client-module contract: `dsh-client-modules` serves this file at
 * `/plugins/<id>/client.js` and materialises it through that global.
 */

/** Modules the DSH web runtime already provides to plugin bundles. */
const externals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
]

export default {
  name: 'dsh-whale-buddy/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: externals,
    alwaysBundle: (id) => (externals.includes(id) ? undefined : true),
    onlyBundle: false,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-whale-buddy", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

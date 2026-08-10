import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TwoTab',
    version: '1.0.0',
    description: 'TwoTab is a privacy-first, lightweight Google Chrome browser extension designed to replace OneTab.',
    permissions: ['tabs', 'storage', 'sessions']
  }
});

import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TwoTab',
    description: 'TwoTab is a privacy-first, lightweight Google Chrome browser extension designed to replace OneTab.',
    permissions: ['tabs', 'storage', 'sessions', 'unlimitedStorage', 'alarms', 'contextMenus', 'tabGroups', 'favicon'],
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png'
    },
    action: {
      default_title: 'TwoTab',
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png'
      }
    }
  }
});

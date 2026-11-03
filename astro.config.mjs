import { defineConfig } from 'astro/config';
import legacyRoutes from './scripts/legacy-routes.mjs';
import devComments from './scripts/dev-comments.mjs';

export default defineConfig({
  site: 'https://wlingze.github.io',
  output: 'static',
  publicDir: './docs/.vuepress/public',
  trailingSlash: 'always',
  integrations: [legacyRoutes(), devComments()],
  build: { format: 'directory', inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});

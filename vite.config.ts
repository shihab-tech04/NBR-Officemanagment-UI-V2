/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  // GitHub Pages project-site base; defaults to root for local/other deployments.
  base: process.env.BASE_PATH || '/',
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  test: {
    // Node built-in regression suites run with node --test in the release jobs.
    // Keep Vitest's original excludes; do not bundle node:test in jsdom.
    exclude: [...configDefaults.exclude,
      'scripts/ci/office-cms-cutover-gate.test.mjs',
      'tests/integration/officeHandoffRpcBoundary.test.mjs'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: {
      NODE_ENV: 'test',
    },
  },
})

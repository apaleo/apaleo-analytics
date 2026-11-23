/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages for this private repo is served at the site root. Set TWIG_BASE only when the site is under a subpath.
const base = process.env.TWIG_BASE && process.env.TWIG_BASE.length > 0 ? process.env.TWIG_BASE : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

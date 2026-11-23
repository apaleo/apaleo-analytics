/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages sets TWIG_BASE=/apaleo-analytics/. Local dev and pull-request builds stay at /.
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

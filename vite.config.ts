/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/pomodoro_slowburn/
  base: '/pomodoro_slowburn/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    // Fixed DST-observing zone so date tests are deterministic and cover DST.
    env: { TZ: 'America/New_York' },
  },
})

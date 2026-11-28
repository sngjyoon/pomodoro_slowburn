// Applies the theme preference to <html data-theme> and persists it.
// index.html sets the attribute before first paint so there is no flash.

import { useEffect, useState } from 'react'
import { loadTheme, saveTheme } from '../lib/storage'
import type { ThemePref } from '../lib/theme'

export function useTheme(): [ThemePref, (theme: ThemePref) => void] {
  const [theme, setTheme] = useState(() => loadTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
    // Match the browser chrome (mobile address bar) to the page background.
    const meta = document.querySelector('meta[name="theme-color"]')
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (meta && bg) meta.setAttribute('content', bg)
  }, [theme])

  return [theme, setTheme]
}

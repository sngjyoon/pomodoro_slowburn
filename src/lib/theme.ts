// Color theme preference. 'auto' follows the operating system setting.

export const THEMES = ['auto', 'light', 'dark'] as const
export type ThemePref = (typeof THEMES)[number]

export const DEFAULT_THEME: ThemePref = 'auto'

export const isThemePref = (x: unknown): x is ThemePref => THEMES.includes(x as ThemePref)

export const parseTheme = (x: unknown): ThemePref => (isThemePref(x) ? x : DEFAULT_THEME)

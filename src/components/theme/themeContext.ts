import { createContext } from 'react'

export type ThemeName = 'light' | 'dark' | 'sepia' | 'contrast'
export type Density = 'cozy' | 'compact'

export interface ThemePrefs {
  theme: ThemeName
  density: Density
  fontScale: number // 0.875 .. 1.375
}

export interface ThemeContextValue extends ThemePrefs {
  setTheme: (t: ThemeName) => void
  setDensity: (d: Density) => void
  setFontScale: (n: number) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

export const defaultPrefs: ThemePrefs = {
  theme: 'light',
  density: 'cozy',
  fontScale: 1,
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

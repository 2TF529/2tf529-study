import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { local } from '@/lib/storage'
import {
  ThemeContext,
  defaultPrefs,
  type Density,
  type ThemeName,
  type ThemePrefs,
} from './themeContext'

const STORAGE_KEY = 'tf529.theme'

function applyToDom(prefs: ThemePrefs) {
  const root = document.documentElement
  root.dataset.theme = prefs.theme
  root.dataset.density = prefs.density
  root.style.setProperty('--font-scale', String(prefs.fontScale))
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ThemePrefs>(() =>
    local.getJson<ThemePrefs>(STORAGE_KEY, defaultPrefs),
  )
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    applyToDom(prefs)
    local.setJson(STORAGE_KEY, prefs)
  }, [prefs])

  // Ctrl/Cmd + Shift + Y toggles the theme panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        setPanelOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setTheme = useCallback((theme: ThemeName) => setPrefs((p) => ({ ...p, theme })), [])
  const setDensity = useCallback((density: Density) => setPrefs((p) => ({ ...p, density })), [])
  const setFontScale = useCallback(
    (fontScale: number) =>
      setPrefs((p) => ({ ...p, fontScale: Math.min(1.375, Math.max(0.875, fontScale)) })),
    [],
  )

  const value = useMemo(
    () => ({ ...prefs, setTheme, setDensity, setFontScale, panelOpen, setPanelOpen }),
    [prefs, setTheme, setDensity, setFontScale, panelOpen],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

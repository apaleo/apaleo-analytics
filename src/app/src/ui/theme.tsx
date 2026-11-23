import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from 'react'

export type ThemeName = 'light' | 'dark'

/** Provisional Apaleo tokens. Dark Fern, White, and Ebony until Notion Brand Identity is applied. */
const light = {
  '--aa-bg': '#f4f5f2',
  '--aa-surface': '#ffffff',
  '--aa-sidebar': '#eef1ea',
  '--aa-text': '#111827',
  '--aa-muted': '#4b5563',
  '--aa-border': '#d9ddd4',
  '--aa-accent': '#284907',
  '--aa-accent-strong': '#142804',
  '--aa-accent-soft': '#e7eedc',
  '--aa-on-accent': '#ffffff',
  '--aa-blue': '#1f5f73',
  '--aa-blue-soft': '#e6f1f4',
  '--aa-shadow': '0 10px 28px rgba(17, 24, 39, 0.08)',
  '--aa-row': '#f7f8f5',
  '--aa-chart-1': '#284907',
  '--aa-chart-2': '#1f6f8a',
  '--aa-chart-3': '#a16207',
  '--aa-chart-4': '#9a3412',
  '--aa-chart-5': '#6b3a4a',
}

const dark = {
  '--aa-bg': '#111827',
  '--aa-surface': '#1f2937',
  '--aa-sidebar': '#0b1220',
  '--aa-text': '#f9fafb',
  '--aa-muted': '#c5cdd6',
  '--aa-border': '#374151',
  '--aa-accent': '#c5d68a',
  '--aa-accent-strong': '#e4f0c4',
  '--aa-accent-soft': '#24301c',
  '--aa-on-accent': '#111827',
  '--aa-blue': '#9fd0e0',
  '--aa-blue-soft': '#1a2c36',
  '--aa-shadow': '0 10px 28px rgba(0, 0, 0, 0.45)',
  '--aa-row': '#182033',
  '--aa-chart-1': '#c5d68a',
  '--aa-chart-2': '#7ec8d8',
  '--aa-chart-3': '#e6c36a',
  '--aa-chart-4': '#e08a62',
  '--aa-chart-5': '#e7a0b0',
} satisfies { [Key in keyof typeof light]: string }

/** CSS variables for the light and dark chrome. Applied on the theme root so descendants inherit them. */
export const themeVariables: Record<ThemeName, { [Key in keyof typeof light]: string }> = { light, dark }

const ThemeContext = createContext<ThemeName | null>(null)

export function useTheme(): ThemeName {
  const theme = useContext(ThemeContext)
  if (theme === null) throw new Error('useTheme must be used within ThemeProvider')
  return theme
}

export function ThemeProvider({ theme, children }: { theme: ThemeName; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.documentElement.style.background = themeVariables[theme]['--aa-bg']
  }, [theme])

  const style = {
    ...themeVariables[theme],
    background: 'var(--aa-bg)',
    color: 'var(--aa-text)',
    colorScheme: theme,
    minHeight: '100svh',
  } as CSSProperties

  return (
    <ThemeContext.Provider value={theme}>
      <div className="theme-root" data-theme={theme} style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

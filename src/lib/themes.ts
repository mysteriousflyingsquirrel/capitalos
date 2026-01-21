export type ThemeId = 'galaxy' | 'fire' | 'emerald' | 'mono'

export interface Theme {
  id: ThemeId
  label: string
  colors: Record<string, string>
}

export const THEMES: Theme[] = [
  {
    id: 'galaxy',
    label: 'Galaxy',
    colors: {
      // Backgrounds
      'bg-page': '#050A1A',
      'bg-frame': '#111827',
      'bg-surface-1': '#141C2F',
      'bg-surface-2': '#18223A',
      'bg-surface-3': '#1D2945',

      // Borders
      'border-subtle': '#27314D',
      'border-strong': '#344067',

      // Text
      'text-primary': '#E9EDFF',
      'text-secondary': '#C7D0F2',
      'text-muted': '#8F9AC7',
      'text-disabled': '#5E678A',

      // Neon Accents
      'accent-blue': '#8F6BFF',
      'accent-purple': '#8F6BFF',

      // Neon Highlights
      'highlight-yellow': '#F6C453',
      'highlight-blue': '#5AA2FF',
      'highlight-turquoise': '#3FD6C6',
      'highlight-purple': '#9A7BFF',
      'highlight-pink': '#FF5BC4',

      // Status
      success: '#32D583',
      warning: '#F6C453',
      danger: '#FF5C5C',
      info: '#5AA2FF',
    },
  },
  {
    id: "fire",
    label: "Fire",
    colors: {
      // Backgrounds (charcoal → ember)
      "bg-page": "#140A05",
      "bg-frame": "#231107",
      "bg-surface-1": "#2F1609",
      "bg-surface-2": "#3A1C0B",
      "bg-surface-3": "#47230E",
  
      // Borders (warm ember lines)
      "border-subtle": "#5A2C12",
      "border-strong": "#6F3716",
  
      // Text (warm white → muted amber)
      "text-primary": "#FFF3E6",
      "text-secondary": "#FFD6B0",
      "text-muted": "#C99A6A",
      "text-disabled": "#8A623E",
  
      // Neon Accents (molten orange)
      "accent-blue": "#FF7A18",
      "accent-purple": "#FF7A18",
  
      // Neon Highlights (fire spectrum)
      "highlight-yellow": "#FFD166",
      "highlight-blue": "#FF9A3C",
      "highlight-turquoise": "#FFB703",
      "highlight-purple": "#FF6A3D",
      "highlight-pink": "#FF3D3D",
  
      // Status (semantic but warm-aligned)
      success: "#3DDC97",
      warning: "#FFD166",
      danger: "#FF3D3D",
      info: "#FF9A3C",
    },
  
  
  },
  {
    id: 'emerald',
    label: 'Emerald',
    colors: {
      // Backgrounds
      'bg-page': '#041413',
      'bg-frame': '#081F1E',
      'bg-surface-1': '#0C2A28',
      'bg-surface-2': '#103633',
      'bg-surface-3': '#14433E',

      // Borders
      'border-subtle': '#1F5A54',
      'border-strong': '#2A726A',

      // Text
      'text-primary': '#E9FFFA',
      'text-secondary': '#BFEFE5',
      'text-muted': '#7FB7AD',
      'text-disabled': '#507B75',

      // Neon Accents
      'accent-blue': '#2EF2C2',
      'accent-purple': '#2EF2C2',

      // Neon Highlights
      'highlight-yellow': '#F6C453',
      'highlight-blue': '#5AA2FF',
      'highlight-turquoise': '#2EF2C2',
      'highlight-purple': '#8F6BFF',
      'highlight-pink': '#FF5BC4',

      // Status
      success: '#2EF2C2',
      warning: '#F6C453',
      danger: '#FF5C5C',
      info: '#5AA2FF',
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    colors: {
      // Backgrounds
      'bg-page': '#0A0B10',
      'bg-frame': '#12141C',
      'bg-surface-1': '#171A24',
      'bg-surface-2': '#1D2130',
      'bg-surface-3': '#242A3D',

      // Borders
      'border-subtle': '#2F364A',
      'border-strong': '#3C4660',

      // Text
      'text-primary': '#F2F4F8',
      'text-secondary': '#D0D6E2',
      'text-muted': '#97A1B5',
      'text-disabled': '#667088',

      // Neon Accents
      'accent-blue': '#A7B0C6',
      'accent-purple': '#A7B0C6',

      // Neon Highlights
      'highlight-yellow': '#F6C453',
      'highlight-blue': '#7EA6FF',
      'highlight-turquoise': '#7FE3D4',
      'highlight-purple': '#B7A6FF',
      'highlight-pink': '#FF8DD6',

      // Status
      success: '#7FE3D4',
      warning: '#F6C453',
      danger: '#FF8A8A',
      info: '#7EA6FF',
    },
  },
]

export function getThemeById(id: string | null | undefined): Theme {
  const fallback = THEMES[0]
  if (!id) return fallback
  return THEMES.find((t) => t.id === id) || fallback
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value)
  }
  root.setAttribute('data-theme', theme.id)
}



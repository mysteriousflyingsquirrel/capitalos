export type ThemeId = 'galaxy' | 'fire' | 'emerald' | 'mono' | 'obsidian' | 'dawn' | 'moss' | 'inferno'

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
      // Backgrounds (anchored exactly)
      "bg-page": "#7E210F",     // brick red
      "bg-frame": "#6E2D1E",    // burnt sienna
      "bg-surface-1": "#7A3A2A",
      "bg-surface-2": "#874634",
      "bg-surface-3": "#945240",
  
      // Borders (darker clay lines for structure)
      "border-subtle": "#5A2418",
      "border-strong": "#471A11",
  
      // Text (warm ivory → muted clay)
      "text-primary": "#FFF2EB",
      "text-secondary": "#FFD2C1",
      "text-muted": "#D6A08A",
      "text-disabled": "#A26E5B",
  
      // Neon Accents (molten orange)
      "accent-blue": "#FF7A18",
      "accent-purple": "#FF7A18",
  
      // Neon Highlights (fire spectrum, controlled)
      "highlight-yellow": "#FFD166",
      "highlight-blue": "#FF9A3C",
      "highlight-turquoise": "#FFB703",
      "highlight-purple": "#FF6A3D",
      "highlight-pink": "#FF3D3D",
  
      // Status (semantic but harmonized)
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
  {
    id: 'obsidian',
    label: 'Obsidian',
    colors: {
      // Backgrounds (true neutral dark)
      'bg-page': '#0B0D12',
      'bg-frame': '#131720',
      'bg-surface-1': '#191E2A',
      'bg-surface-2': '#202637',
      'bg-surface-3': '#28304A',

      // Borders
      'border-subtle': '#323A52',
      'border-strong': '#3F4A6A',

      // Text
      'text-primary': '#F2F4F8',
      'text-secondary': '#D1D6E2',
      'text-muted': '#9AA3B8',
      'text-disabled': '#69728A',

      // Accents (muted steel)
      'accent-blue': '#A7B0C6',
      'accent-purple': '#A7B0C6',

      // Highlights
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
  {
    id: 'dawn',
    label: 'Dawn',
    colors: {
      // Backgrounds (warm sand → soft amber)
      'bg-page': '#1A120D',
      'bg-frame': '#2A1C14',
      'bg-surface-1': '#3A261B',
      'bg-surface-2': '#4A3123',
      'bg-surface-3': '#5B3D2B',

      // Borders (warm clay)
      'border-subtle': '#6F4A36',
      'border-strong': '#875A41',

      // Text (soft ivory → muted bronze)
      'text-primary': '#FFF4EC',
      'text-secondary': '#EFD6C3',
      'text-muted': '#C4A089',
      'text-disabled': '#8F6D59',

      // Accents (soft sunrise orange)
      'accent-blue': '#FF9A3C',
      'accent-purple': '#FF9A3C',

      // Highlights (sunrise spectrum)
      'highlight-yellow': '#FFD166',
      'highlight-blue': '#7EA6FF',
      'highlight-turquoise': '#7FE3D4',
      'highlight-purple': '#B085FF',
      'highlight-pink': '#FF8DD6',

      // Status (semantic, warm-compatible)
      success: '#7FE3D4',
      warning: '#FFD166',
      danger: '#FF8A8A',
      info: '#7EA6FF',
    },
  },
  {
    id: 'moss',
    label: 'Moss',
    colors: {
      // Backgrounds (olive stone)
      'bg-page': '#0F1A14',
      'bg-frame': '#1B2A21',
      'bg-surface-1': '#26382C',
      'bg-surface-2': '#314838',
      'bg-surface-3': '#3D5A45',

      // Borders
      'border-subtle': '#4E6D56',
      'border-strong': '#65896D',

      // Text
      'text-primary': '#F1FFF6',
      'text-secondary': '#CDEAD9',
      'text-muted': '#96B7A4',
      'text-disabled': '#5F7F6C',

      // Accents (muted green glow)
      'accent-blue': '#7DDC9C',
      'accent-purple': '#7DDC9C',

      // Highlights
      'highlight-yellow': '#E6C453',
      'highlight-blue': '#7EA6FF',
      'highlight-turquoise': '#7DDC9C',
      'highlight-purple': '#9A8BFF',
      'highlight-pink': '#FF8DD6',

      // Status
      success: '#7DDC9C',
      warning: '#E6C453',
      danger: '#FF8A8A',
      info: '#7EA6FF',
    },
  },
  {
    id: 'inferno',
    label: 'Inferno',
    colors: {
      // Backgrounds (blood red → dark ash)
      'bg-page': '#1A0505',
      'bg-frame': '#2A0B0B',
      'bg-surface-1': '#3A1212',
      'bg-surface-2': '#4A1818',
      'bg-surface-3': '#5C1F1F',

      // Borders
      'border-subtle': '#6E2A2A',
      'border-strong': '#8A3535',

      // Text
      'text-primary': '#FFF0F0',
      'text-secondary': '#F2C1C1',
      'text-muted': '#B88383',
      'text-disabled': '#7A4F4F',

      // Accents (hot crimson)
      'accent-blue': '#FF3B3B',
      'accent-purple': '#FF3B3B',

      // Highlights
      'highlight-yellow': '#FFD166',
      'highlight-blue': '#FF6A6A',
      'highlight-turquoise': '#FF8F8F',
      'highlight-purple': '#B085FF',
      'highlight-pink': '#FF5FA2',

      // Status
      success: '#3DDC97',
      warning: '#FFD166',
      danger: '#FF3B3B',
      info: '#FF6A6A',
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



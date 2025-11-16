import React from 'react'

const colorGroups = [
  {
    title: 'Backgrounds',
    colors: [
      { name: 'bg-bg-page', className: 'bg-bg-page', hex: '#0E121A' },
      { name: 'bg-bg-surface-1', className: 'bg-bg-surface-1', hex: '#161B22' },
      { name: 'bg-bg-surface-2', className: 'bg-bg-surface-2', hex: '#11151C' },
      { name: 'bg-bg-surface-3', className: 'bg-bg-surface-3', hex: '#1C2129' },
    ],
  },
  {
    title: 'Borders',
    colors: [
      { name: 'border-border-subtle', className: 'bg-border-subtle', hex: '#2A3039' },
      { name: 'border-border-strong', className: 'bg-border-strong', hex: '#39404A' },
    ],
  },
  {
    title: 'Text',
    colors: [
      { name: 'text-text-primary', className: 'bg-text-primary', hex: '#F0F2F5' },
      { name: 'text-text-secondary', className: 'bg-text-secondary', hex: '#C5CAD3' },
      { name: 'text-text-muted', className: 'bg-text-muted', hex: '#8B8F99' },
      { name: 'text-text-disabled', className: 'bg-text-disabled', hex: '#5D6168' },
    ],
  },
  {
    title: 'Accents',
    colors: [
      { name: 'bg-accent-blue', className: 'bg-accent-blue', hex: '#4A56FF' },
      { name: 'bg-accent-purple', className: 'bg-accent-purple', hex: '#AD33FF' },
    ],
  },
  {
    title: 'Highlights',
    colors: [
      { name: 'bg-highlight-yellow', className: 'bg-highlight-yellow', hex: '#F8C445' },
      { name: 'bg-highlight-blue', className: 'bg-highlight-blue', hex: '#4A90E2' },
      { name: 'bg-highlight-turquoise', className: 'bg-highlight-turquoise', hex: '#3CC8C0' },
      { name: 'bg-highlight-purple', className: 'bg-highlight-purple', hex: '#A45CFF' },
      { name: 'bg-highlight-pink', className: 'bg-highlight-pink', hex: '#FF3FB0' },
    ],
  },
  {
    title: 'Status',
    colors: [
      { name: 'bg-success', className: 'bg-success', hex: '#2ECC71' },
      { name: 'bg-warning', className: 'bg-warning', hex: '#F8C445' },
      { name: 'bg-danger', className: 'bg-danger', hex: '#E74C3C' },
      { name: 'bg-info', className: 'bg-info', hex: '#4A90E2' },
    ],
  },
]

const StyleGuide: React.FC = () => {
  return (
    <div className="min-h-screen bg-bg-page text-text-primary font-sans p-8 space-y-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-text-muted">CapitalOS</p>
        <h1 className="text-4xl font-semibold">Design System & Style Guide</h1>
        <p className="text-text-secondary max-w-2xl">
          Reference sheet for CapitalOS colors, typography, buttons, and card treatments built with Tailwind utilities.
        </p>
      </header>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Colors</h2>
        <div className="space-y-8">
          {colorGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xl font-medium mb-4">{group.title}</h3>
              <div className="flex flex-wrap gap-4">
                {group.colors.map((color) => (
                  <div
                    key={color.name}
                    className="w-32 rounded-card border border-border-subtle overflow-hidden bg-bg-surface-2"
                  >
                    <div className={`h-16 ${color.className}`} />
                    <div className="px-3 py-2 text-xs space-y-1">
                      <p className="font-medium">{color.name}</p>
                      <p className="text-text-secondary uppercase tracking-wide">{color.hex}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Typography</h2>
        <div className="space-y-3 bg-bg-surface-2 border border-border-subtle rounded-card p-6">
          <p className="text-3xl font-semibold">Page Title — Inter 600</p>
          <p className="text-2xl">Section Title — Inter 500</p>
          <p className="text-base text-text-secondary">
            Body — Inter 400. CapitalOS blends financial clarity with a modern galactic aesthetic.
          </p>
          <p className="text-xs text-text-muted uppercase tracking-wide">Caption — Inter 400</p>
          <p className="font-mono text-sm text-text-primary">0123456789 — JetBrains Mono</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-4">
          <button className="bg-accent-gradient text-white rounded-full px-6 py-2 font-medium shadow-card transition hover:opacity-90">
            Primary Action
          </button>
          <button className="bg-bg-surface-2 border border-border-subtle text-text-primary rounded-full px-6 py-2 font-medium">
            Secondary Action
          </button>
          <button className="bg-danger text-white rounded-full px-6 py-2 font-medium">Danger Action</button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Cards</h2>
        <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6 max-w-md space-y-2">
          <p className="text-xl font-semibold">Sample Financial Widget</p>
          <p className="text-text-secondary">
            Use cards to contain charts, KPIs, and contextual insights. Maintain spacing, border, and elevation for
            consistent feel.
          </p>
        </div>
      </section>
    </div>
  )
}

export default StyleGuide



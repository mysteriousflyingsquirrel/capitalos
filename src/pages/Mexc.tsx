import Heading from '../components/Heading'

export default function Mexc() {
  return (
    <div className="min-h-screen px-2 lg:px-6 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        <Heading level={1}>MEXC</Heading>

        <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="mb-6 pb-4 border-b border-border-strong">
            <Heading level={2}>Coming soon</Heading>
          </div>
          <div className="text-text-secondary text-sm">
            This page is intentionally empty for now. We’ll add positions/orders/performance once the data
            source is wired.
          </div>
        </div>
      </div>
    </div>
  )
}


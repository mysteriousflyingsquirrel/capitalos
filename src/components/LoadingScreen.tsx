import FloatingLines from './FloatingLines'
import Heading from './Heading'

export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center relative">
      <div className="fixed inset-0 z-0">
        <FloatingLines
          linesGradient={['#4A56FF', '#AD33FF', '#A45CFF', '#3CC8C0']}
          enabledWaves={['top', 'middle', 'bottom']}
          lineCount={[4, 6, 4]}
          animationSpeed={0.5}
          interactive={true}
          parallax={true}
          mixBlendMode="screen"
        />
      </div>
      <div className="relative z-10 text-center">
        <Heading level={1} className="text-text-primary mb-4">
          Capitalos
        </Heading>
        <div className="text-text-secondary">Loading your wealth data...</div>
        <div className="mt-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-goldenrod"></div>
        </div>
      </div>
    </div>
  )
}


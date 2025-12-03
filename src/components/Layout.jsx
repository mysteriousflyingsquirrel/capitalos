import Sidebar from './Sidebar'
import FloatingLines from './FloatingLines'

function Layout({ children }) {
  return (
    <div className="min-h-screen relative">
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
      <Sidebar />
      <div className="flex flex-col lg:ml-[250px] relative z-10">
        <main className="flex-1 overflow-auto pt-[calc(3.5rem+1rem)] lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout


import Sidebar from './Sidebar'

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-[#050A1A]">
      <Sidebar />
      <div className="flex flex-col lg:ml-[250px]">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout


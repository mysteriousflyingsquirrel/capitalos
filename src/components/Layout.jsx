import Sidebar from './Sidebar'

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-galaxy-dark">
      <Sidebar />
      <div className="flex flex-col lg:ml-[250px]">
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout


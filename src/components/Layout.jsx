import Sidebar from './Sidebar'

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-bg-page">
      <Sidebar />
      <div className="flex flex-col lg:ml-[250px]">
        <main className="flex-1 overflow-auto pt-[calc(3.5rem+1rem)] lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout


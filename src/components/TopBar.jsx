import { useState } from 'react'

function TopBar() {
  const [showAccountMenu, setShowAccountMenu] = useState(false)

  return (
    <header className="bg-space-blue border-b border-bronze-gold px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button className="btn-primary">
          + Add Transaction
        </button>
      </div>
      
      <div className="relative">
        <button
          onClick={() => setShowAccountMenu(!showAccountMenu)}
          className="flex items-center gap-2 text-text-primary hover:text-goldenrod transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-bronze-gold flex items-center justify-center text-space-blue font-semibold">
            U
          </div>
          <span className="text-sm">Account</span>
        </button>
        
        {showAccountMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-space-blue border border-bronze-gold rounded-custom shadow-lg z-10">
            <div className="py-2">
              <a href="#" className="block px-4 py-2 text-text-secondary hover:text-goldenrod hover:bg-galaxy-dark transition-colors">
                Profile
              </a>
              <a href="#" className="block px-4 py-2 text-text-secondary hover:text-goldenrod hover:bg-galaxy-dark transition-colors">
                Settings
              </a>
              <a href="#" className="block px-4 py-2 text-text-secondary hover:text-goldenrod hover:bg-galaxy-dark transition-colors">
                Sign Out
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

export default TopBar


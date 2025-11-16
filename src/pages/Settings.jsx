function Settings() {
  return (
    <div className="min-h-screen bg-[#050A1A] p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <h1 className="text-text-primary text-2xl md:text-3xl font-semibold">Settings</h1>
        
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
          <h2 className="text-text-primary text-lg md:text-xl font-semibold mb-4">Account Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="text-text-secondary text-sm font-medium block mb-2">Email</label>
              <input 
                type="email" 
                className="bg-bg-surface-2 border border-border-subtle rounded-input px-4 py-2 text-text-primary w-full max-w-md focus:outline-none focus:border-accent-blue"
                placeholder="your.email@example.com"
                defaultValue="user@example.com"
              />
            </div>
            <div>
              <label className="text-text-secondary text-sm font-medium block mb-2">Currency</label>
              <select className="bg-bg-surface-2 border border-border-subtle rounded-input px-4 py-2 text-text-primary w-full max-w-md focus:outline-none focus:border-accent-blue">
                <option value="CHF">CHF (Swiss Franc)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
          <h2 className="text-text-primary text-lg md:text-xl font-semibold mb-4">Data Management</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary font-medium mb-1">Google Drive Sync</p>
                <p className="text-text-secondary text-sm">Sync your data with Google Drive</p>
              </div>
              <button className="bg-bg-surface-2 border border-border-subtle text-text-primary rounded-full px-6 py-2 hover:bg-bg-surface-3 transition-colors">Connect</button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary font-medium mb-1">Export Data</p>
                <p className="text-text-secondary text-sm">Download your data as JSON</p>
              </div>
              <button className="bg-bg-surface-2 border border-border-subtle text-text-primary rounded-full px-6 py-2 hover:bg-bg-surface-3 transition-colors">Export</button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary font-medium mb-1">Import Data</p>
                <p className="text-text-secondary text-sm">Import data from JSON file</p>
              </div>
              <button className="bg-bg-surface-2 border border-border-subtle text-text-primary rounded-full px-6 py-2 hover:bg-bg-surface-3 transition-colors">Import</button>
            </div>
          </div>
        </div>

        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
          <h2 className="text-text-primary text-lg md:text-xl font-semibold mb-4">Price Updates</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary font-medium mb-1">Auto Price Updates</p>
                <p className="text-text-secondary text-sm">Automatically update prices via APIs</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-bg-surface-2 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-blue rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#F8C445]"></div>
              </label>
            </div>
            <div>
              <label className="text-text-secondary text-sm font-medium block mb-2">Update Frequency</label>
              <select className="bg-bg-surface-2 border border-border-subtle rounded-input px-4 py-2 text-text-primary w-full max-w-md focus:outline-none focus:border-accent-blue">
                <option value="hourly">Hourly</option>
                <option value="daily" selected>Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
          <h2 className="text-text-primary text-lg md:text-xl font-semibold mb-4">Tax Reports</h2>
          <div className="space-y-4">
            <div>
              <label className="text-text-secondary text-sm font-medium block mb-2">Tax Year</label>
              <select className="bg-bg-surface-2 border border-border-subtle rounded-input px-4 py-2 text-text-primary w-full max-w-md focus:outline-none focus:border-accent-blue">
                <option value="2024" selected>2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary font-medium mb-1">Generate Swiss Tax Report</p>
                <p className="text-text-secondary text-sm">Generate tax-compliant report for selected year</p>
              </div>
              <button className="bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] font-semibold rounded-full px-6 py-2 hover:brightness-110 transition-all duration-200 shadow-card">Generate Report</button>
            </div>
          </div>
        </div>

        <div className="bg-bg-surface-1 border border-danger rounded-card shadow-card p-6">
          <h2 className="text-danger text-lg md:text-xl font-semibold mb-4">Danger Zone</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary font-medium mb-1">Delete All Data</p>
                <p className="text-text-secondary text-sm">Permanently delete all your data. This action cannot be undone.</p>
              </div>
              <button className="bg-bg-surface-2 border border-danger text-danger rounded-full px-6 py-2 hover:bg-danger/10 transition-colors">Delete All Data</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings


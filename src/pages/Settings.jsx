function Settings() {
  return (
    <div className="space-y-6">
      <h1 className="section-title text-2xl">Settings</h1>

      <div className="card">
        <h2 className="section-title mb-4">Account Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="label-normal block mb-2">Email</label>
            <input 
              type="email" 
              className="input-field w-full max-w-md"
              placeholder="your.email@example.com"
              defaultValue="user@example.com"
            />
          </div>
          <div>
            <label className="label-normal block mb-2">Currency</label>
            <select className="input-field w-full max-w-md">
              <option value="CHF">CHF (Swiss Franc)</option>
              <option value="USD">USD (US Dollar)</option>
              <option value="EUR">EUR (Euro)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title mb-4">Data Management</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium mb-1">Google Drive Sync</p>
              <p className="label-normal">Sync your data with Google Drive</p>
            </div>
            <button className="btn-secondary">Connect</button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium mb-1">Export Data</p>
              <p className="label-normal">Download your data as JSON</p>
            </div>
            <button className="btn-secondary">Export</button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium mb-1">Import Data</p>
              <p className="label-normal">Import data from JSON file</p>
            </div>
            <button className="btn-secondary">Import</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title mb-4">Price Updates</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium mb-1">Auto Price Updates</p>
              <p className="label-normal">Automatically update prices via APIs</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-space-blue peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-bronze-gold rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bronze-gold"></div>
            </label>
          </div>
          <div>
            <label className="label-normal block mb-2">Update Frequency</label>
            <select className="input-field w-full max-w-md">
              <option value="hourly">Hourly</option>
              <option value="daily" selected>Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title mb-4">Tax Reports</h2>
        <div className="space-y-4">
          <div>
            <label className="label-normal block mb-2">Tax Year</label>
            <select className="input-field w-full max-w-md">
              <option value="2024" selected>2024</option>
              <option value="2023">2023</option>
              <option value="2022">2022</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium mb-1">Generate Swiss Tax Report</p>
              <p className="label-normal">Generate tax-compliant report for selected year</p>
            </div>
            <button className="btn-primary">Generate Report</button>
          </div>
        </div>
      </div>

      <div className="card border-error">
        <h2 className="section-title mb-4 text-error">Danger Zone</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium mb-1">Delete All Data</p>
              <p className="label-normal">Permanently delete all your data. This action cannot be undone.</p>
            </div>
            <button className="btn-secondary border-error text-error hover:bg-error/10">Delete All Data</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings


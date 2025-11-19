import React, { useState } from 'react'
import Heading from '../components/Heading'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import type { CurrencyCode } from '../lib/currency'
import { supportedCurrencies } from '../lib/currency'
import {
  createBackup,
  downloadBackup,
  readBackupFile,
  restoreBackup,
} from '../services/backupService'

function Settings() {
  const { baseCurrency, setBaseCurrency, exchangeRates, isLoading, error } = useCurrency()
  const { uid } = useAuth()
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)

  // Format rate for display
  const formatRate = (value: number) => value.toFixed(4)

  // Get other currencies (all except base)
  const otherCurrencies = supportedCurrencies.filter(c => c !== baseCurrency)

  // Report generation handlers (stubs for now)
  const handleCryptoTaxReport = () => {
    alert('Crypto Tax Report generation is not implemented yet. This will trigger a serverless function in a future version.')
  }

  const handleExportJSON = async () => {
    if (!uid) {
      alert('Please sign in to export your data.')
      return
    }

    setExportLoading(true)
    setExportError(null)
    setExportSuccess(false)

    try {
      const backup = await createBackup(uid)
      downloadBackup(backup)
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export data'
      setExportError(errorMessage)
      setTimeout(() => setExportError(null), 5000)
    } finally {
      setExportLoading(false)
    }
  }

  const handleImportJSON = async () => {
    if (!uid) {
      alert('Please sign in to import your data.')
      return
    }

    // Create a file input element
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setImportLoading(true)
      setImportError(null)
      setImportSuccess(false)

      try {
        // Read and validate backup
        const backup = await readBackupFile(file)

        // Show confirmation dialog
        const confirmed = window.confirm(
          'Importing this backup will overwrite all your current data. This action cannot be undone.\n\n' +
          `Backup exported: ${new Date(backup.exportedAt).toLocaleString()}\n` +
          (backup.userId ? `Original user: ${backup.userId}\n` : '') +
          `Current user: ${uid}\n\n` +
          'Do you want to continue?'
        )

        if (!confirmed) {
          setImportLoading(false)
          return
        }

        // Restore backup
        await restoreBackup(backup, uid, { clearExisting: true })

        setImportSuccess(true)
        setTimeout(() => setImportSuccess(false), 3000)

        // Reload the page to refresh all data
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to import data'
        setImportError(errorMessage)
        setTimeout(() => setImportError(null), 5000)
      } finally {
        setImportLoading(false)
      }
    }
    input.click()
  }

  return (
    <div className="min-h-screen bg-[#050A1A] px-2 py-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Settings</Heading>

        {/* General Section */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-4 lg:p-6">
          <Heading level={2} className="mb-4">General</Heading>
          
          <div>
            {/* Base Currency */}
            <div>
              <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                Base Currency
              </label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value as CurrencyCode)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              >
                <option value="CHF">CHF</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
              <p className="mt-2 text-text-muted text-[0.567rem] md:text-xs">
                All values in Capitalos will be displayed in this currency.
              </p>
              
              {/* Exchange Rates Display */}
              <div className="mt-4 space-y-2">
                {isLoading && (
                  <p className="text-text-muted text-[0.567rem] md:text-xs italic">
                    Loading latest rates...
                  </p>
                )}
                {error && (
                  <p className="text-danger text-[0.567rem] md:text-xs">
                    {error}
                  </p>
                )}
                {!isLoading && !error && exchangeRates && (
                  <div className="space-y-1">
                    {otherCurrencies.map((currency) => {
                      const rate = exchangeRates.rates[currency]
                      return (
                        <p key={currency} className="text-text-secondary text-[0.567rem] md:text-xs">
                          1 {baseCurrency} = {formatRate(rate)} {currency}
                        </p>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Reports Section */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-4 lg:p-6">
          <Heading level={2} className="mb-4">Reports</Heading>
          
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-6">
            Generate tax reports based on your Capitalos data. These buttons will trigger server-side report generation in a future version.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={handleCryptoTaxReport}
              className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg"
            >
              Generate Crypto Tax Report
            </button>
          </div>
        </div>

        {/* Data Section */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-4 lg:p-6">
          <Heading level={2} className="mb-4">Data</Heading>
          
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-6">
            Export or import your Capitalos data. These buttons will trigger data operations in a future version.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <button
                  onClick={handleExportJSON}
                  disabled={exportLoading || !uid}
                  className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-full"
                >
                  {exportLoading ? 'Exporting...' : 'Export All Data (JSON)'}
                </button>
                {exportSuccess && (
                  <p className="mt-2 text-success text-[0.567rem] md:text-xs">
                    Export successful! File downloaded.
                  </p>
                )}
                {exportError && (
                  <p className="mt-2 text-danger text-[0.567rem] md:text-xs">
                    {exportError}
                  </p>
                )}
                <p className="mt-2 text-warning text-[0.567rem] md:text-xs">
                  ⚠️ This JSON file contains sensitive financial data. Keep it private and secure.
                </p>
              </div>

              <div>
                <button
                  onClick={handleImportJSON}
                  disabled={importLoading || !uid}
                  className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-full"
                >
                  {importLoading ? 'Importing...' : 'Import Data (JSON)'}
                </button>
                {importSuccess && (
                  <p className="mt-2 text-success text-[0.567rem] md:text-xs">
                    Import successful! Page will reload shortly...
                  </p>
                )}
                {importError && (
                  <p className="mt-2 text-danger text-[0.567rem] md:text-xs">
                    {importError}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-4 lg:p-6">
          <Heading level={2} className="mb-4">About</Heading>
          
          <div className="space-y-4">
            <div>
              <Heading level={3} className="mb-1">Capitalos</Heading>
              <p className="text-text-secondary text-[0.567rem] md:text-xs">
                Capitalos is your personal wealth, cashflow and investing cockpit.
              </p>
            </div>

            <div>
              <p className="text-text-secondary text-[0.567rem] md:text-xs">
                Version: 1.0.0
              </p>
            </div>

            <div className="pt-4 border-t border-border-subtle">
              <p className="text-text-muted text-[0.567rem] md:text-xs italic">
                Made for personal use. Do not consider this financial advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings


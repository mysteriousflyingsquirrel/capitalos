import React, { useState, useEffect, FormEvent } from 'react'
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
import { savePlatforms, loadPlatforms, saveCashflowAccountflowMappings, loadCashflowAccountflowMappings, type Platform } from '../services/storageService'

function Settings() {
  const { baseCurrency, setBaseCurrency, exchangeRates, isLoading, error } = useCurrency()
  const { uid } = useAuth()
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  
  // Platform management
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [platformLoading, setPlatformLoading] = useState(true)
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null)
  const [newPlatformName, setNewPlatformName] = useState('')
  const [platformError, setPlatformError] = useState<string | null>(null)

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

  // Load platforms on mount
  useEffect(() => {
    const loadPlatformsData = async () => {
      setPlatformLoading(true)
      try {
        const defaultPlatforms: Platform[] = [
          { id: 'physical', name: 'Physical', order: 0 },
          { id: 'raiffeisen', name: 'Raiffeisen', order: 0 },
          { id: 'revolut', name: 'Revolut', order: 0 },
          { id: 'yuh', name: 'yuh!', order: 0 },
          { id: 'saxo', name: 'SAXO', order: 0 },
          { id: 'kraken', name: 'Kraken', order: 0 },
          { id: 'mexc', name: 'MEXC', order: 0 },
          { id: 'bingx', name: 'BingX', order: 0 },
          { id: 'exodus', name: 'Exodus', order: 0 },
          { id: 'trezor', name: 'Trezor', order: 0 },
          { id: 'ledger', name: 'Ledger', order: 0 },
          { id: 'ibkr', name: 'IBKR', order: 0 },
          { id: 'ubs', name: 'UBS', order: 0 },
          { id: 'property', name: 'Property', order: 0 },
          { id: 'wallet', name: 'Wallet', order: 0 },
          { id: 'other', name: 'Other', order: 0 },
        ]
        const loaded = await loadPlatforms(defaultPlatforms, uid)
        setPlatforms(loaded)
      } catch (err) {
        console.error('Failed to load platforms:', err)
      } finally {
        setPlatformLoading(false)
      }
    }
    loadPlatformsData()
  }, [uid])

  const handleAddPlatform = async (e: FormEvent) => {
    e.preventDefault()
    setPlatformError(null)

    if (!newPlatformName.trim()) {
      setPlatformError('Please enter a platform name.')
      return
    }

    if (platforms.some(p => p.name.toLowerCase() === newPlatformName.trim().toLowerCase())) {
      setPlatformError('A platform with this name already exists.')
      return
    }

    const newPlatform: Platform = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `platform-${Date.now()}`,
      name: newPlatformName.trim(),
      order: 0,
    }

    const updated = [...platforms, newPlatform]
    setPlatforms(updated)
    await savePlatforms(updated, uid)
    setNewPlatformName('')
  }

  const handleEditPlatform = async (platform: Platform, newName: string) => {
    if (!newName.trim()) {
      setPlatformError('Platform name cannot be empty.')
      return
    }

    if (platforms.some(p => p.id !== platform.id && p.name.toLowerCase() === newName.trim().toLowerCase())) {
      setPlatformError('A platform with this name already exists.')
      return
    }

    const updated = platforms.map(p => 
      p.id === platform.id ? { ...p, name: newName.trim() } : p
    )
    setPlatforms(updated)
    await savePlatforms(updated, uid)
    setEditingPlatform(null)
    setPlatformError(null)
  }

  const handleRemovePlatform = async (platform: Platform) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${platform.name}"?\n\n` +
      'This will:\n' +
      '- Remove all mappings in Platformflow\n' +
      '- Items in Net Worth will show a warning icon until you change their platform\n\n' +
      'This action cannot be undone.'
    )

    if (!confirmed) return

    // Remove platform
    const updated = platforms.filter(p => p.id !== platform.id)
    setPlatforms(updated)
    await savePlatforms(updated, uid)

    // Remove mappings from platformflow
    if (uid) {
      try {
        const mappings = await loadCashflowAccountflowMappings([], uid)
        const platformName = platform.name
        const filteredMappings = mappings.filter(m => {
          if (m.kind === 'inflowToAccount') {
            return m.account !== platformName
          } else if (m.kind === 'accountToOutflow') {
            return m.account !== platformName
          } else if (m.kind === 'accountToAccount') {
            return m.fromAccount !== platformName && m.toAccount !== platformName
          }
          return true
        })
        if (filteredMappings.length !== mappings.length) {
          await saveCashflowAccountflowMappings(filteredMappings, uid)
        }
      } catch (err) {
        console.error('Failed to remove platform mappings:', err)
      }
    }
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

        {/* Platforms Section */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-4 lg:p-6">
          <Heading level={2} className="mb-4">Platforms</Heading>
          
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-6">
            Manage platforms that appear in dropdowns throughout the application. Platforms with highest inflow are listed first.
          </p>

          {platformError && (
            <div className="mb-4 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
              {platformError}
            </div>
          )}

          {/* Add Platform Form */}
          <form onSubmit={handleAddPlatform} className="mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                placeholder="Enter platform name"
                className="flex-1 bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg"
              >
                Add Platform
              </button>
            </div>
          </form>

          {/* Platforms List */}
          {platformLoading ? (
            <p className="text-text-muted text-[0.567rem] md:text-xs">Loading platforms...</p>
          ) : (
            <div className="space-y-2">
              {platforms.length === 0 ? (
                <p className="text-text-muted text-[0.567rem] md:text-xs">No platforms yet. Add one above.</p>
              ) : (
                platforms.map((platform) => (
                  <div
                    key={platform.id}
                    className="flex items-center justify-between p-3 bg-bg-surface-2 border border-border-subtle rounded-input"
                  >
                    {editingPlatform?.id === platform.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          const input = e.currentTarget.querySelector('input') as HTMLInputElement
                          if (input) {
                            handleEditPlatform(platform, input.value)
                          }
                        }}
                        className="flex-1 flex gap-2"
                      >
                        <input
                          type="text"
                          defaultValue={platform.name}
                          className="flex-1 bg-bg-surface-1 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-3 py-2 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPlatform(null)
                            setPlatformError(null)
                          }}
                          className="px-3 py-2 bg-bg-surface-3 border border-border-subtle text-text-primary text-[0.567rem] md:text-xs rounded-full hover:bg-bg-surface-1 transition-colors"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="text-text-primary text-xs md:text-sm font-medium">{platform.name}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingPlatform(platform)}
                            className="px-3 py-1.5 bg-bg-surface-3 border border-border-subtle text-text-primary text-[0.567rem] md:text-xs rounded-full hover:bg-bg-surface-1 transition-colors"
                            title="Edit platform"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemovePlatform(platform)}
                            className="px-3 py-1.5 bg-bg-surface-3 border border-danger/40 text-danger text-[0.567rem] md:text-xs rounded-full hover:bg-danger/10 transition-colors"
                            title="Remove platform"
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
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


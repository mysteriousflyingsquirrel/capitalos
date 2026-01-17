import React, { useState, useEffect, FormEvent } from 'react'
import Heading from '../components/Heading'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { useApiKeys } from '../contexts/ApiKeysContext'
import { useData } from '../contexts/DataContext'
import type { CurrencyCode } from '../lib/currency'
import { supportedCurrencies } from '../lib/currency'
import {
  createBackup,
  downloadBackup,
  readBackupFile,
  restoreBackup,
} from '../services/backupService'
import { savePlatforms, loadPlatforms, saveCashflowAccountflowMappings, loadCashflowAccountflowMappings, type Platform } from '../services/storageService'
import { getYearsWithCryptoActivity, generateCryptoTaxReport } from '../services/cryptoTaxReportService'
import { generateCryptoTaxReportPDF } from '../services/pdfService'
import { saveSnapshots, hasSnapshotForDate, createSnapshot, getTodayUTCDate, getToday2359UTCTimestamp } from '../services/snapshotService'

function Settings() {
  const { baseCurrency, exchangeRates, isLoading, error, convert } = useCurrency()
  const { uid, user } = useAuth()
  const { rapidApiKey, setRapidApiKey, asterApiKey, setAsterApiKey, asterApiSecretKey, setAsterApiSecretKey, hyperliquidWalletAddress, setHyperliquidWalletAddress, krakenApiKey, setKrakenApiKey, krakenApiSecretKey, setKrakenApiSecretKey, isLoading: apiKeysLoading } = useApiKeys()
  const { data } = useData()
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
  const [generatingTaxReport, setGeneratingTaxReport] = useState(false)
  const [showPlatformsList, setShowPlatformsList] = useState(false)
  // Crypto tax report year selection
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [loadingYears, setLoadingYears] = useState(false)
  // API Keys
  const [rapidApiKeyInput, setRapidApiKeyInput] = useState('')
  const [asterApiKeyInput, setAsterApiKeyInput] = useState('')
  const [asterApiSecretKeyInput, setAsterApiSecretKeyInput] = useState('')
  const [hyperliquidWalletAddressInput, setHyperliquidWalletAddressInput] = useState('')
  const [krakenApiKeyInput, setKrakenApiKeyInput] = useState('')
  const [krakenApiSecretKeyInput, setKrakenApiSecretKeyInput] = useState('')
  const [apiKeySaving, setApiKeySaving] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [apiKeySuccess, setApiKeySuccess] = useState(false)
  // Visibility toggles for API key fields
  const [showRapidApiKey, setShowRapidApiKey] = useState(false)
  const [showAsterApiKey, setShowAsterApiKey] = useState(false)
  const [showAsterApiSecretKey, setShowAsterApiSecretKey] = useState(false)
  const [showHyperliquidWalletAddress, setShowHyperliquidWalletAddress] = useState(false)
  const [showKrakenApiKey, setShowKrakenApiKey] = useState(false)
  const [showKrakenApiSecretKey, setShowKrakenApiSecretKey] = useState(false)
  // Snapshot creation
  const [creatingSnapshot, setCreatingSnapshot] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [snapshotSuccess, setSnapshotSuccess] = useState(false)

  // Format rate for display
  const formatRate = (value: number) => value.toFixed(4)

  // Get other currencies (all except base)
  const otherCurrencies = supportedCurrencies.filter(c => c !== baseCurrency)

  // Report generation handlers
  const handleCryptoTaxReport = async () => {
    if (!uid || !convert || !selectedYear) return
    
    setGeneratingTaxReport(true)
    try {
      // Generate the report using the selected year
      const report = await generateCryptoTaxReport(selectedYear, uid, convert)
      
      if (!report) {
        alert('Report could not be generated. Please try again later.')
        return
      }
      
      // Generate and download PDF
      const userName = user?.email || user?.displayName || undefined
      generateCryptoTaxReportPDF(report, userName)
      
    } catch (error) {
      console.error('Failed to generate tax report:', error)
      alert('Error generating tax report. Please try again later.')
    } finally {
      setGeneratingTaxReport(false)
    }
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

        // Show mode selection dialog
        const modeChoice = window.confirm(
          'Choose import mode:\n\n' +
          'OK = Merge (recommended)\n' +
          '- Adds new items\n' +
          '- Updates existing items by ID\n' +
          '- Keeps items not in backup\n\n' +
          'Cancel = Replace\n' +
          '- Deletes all existing data\n' +
          '- Imports only backup data\n' +
          '- This action cannot be undone\n\n' +
          `Backup exported: ${new Date(backup.exportedAt).toLocaleString()}\n` +
          (backup.userId ? `Original user: ${backup.userId}\n` : '') +
          `Current user: ${uid}`
        )

        const mode = modeChoice ? 'merge' : 'replace'

        // Additional confirmation for replace mode
        if (mode === 'replace') {
          const confirmed = window.confirm(
            '⚠️ WARNING: Replace mode will DELETE all your current data!\n\n' +
            'This action cannot be undone.\n\n' +
            'Are you absolutely sure?'
          )

          if (!confirmed) {
            setImportLoading(false)
            return
          }
        }

        // Restore backup with selected mode
        await restoreBackup(backup, uid, { 
          mode,
          includeSettings: true,
        })

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


  // Load API keys into inputs when they're loaded
  useEffect(() => {
    if (!apiKeysLoading) {
      setRapidApiKeyInput(rapidApiKey || '')
      setAsterApiKeyInput(asterApiKey || '')
      setAsterApiSecretKeyInput(asterApiSecretKey || '')
      setHyperliquidWalletAddressInput(hyperliquidWalletAddress || '')
      setKrakenApiKeyInput(krakenApiKey || '')
      setKrakenApiSecretKeyInput(krakenApiSecretKey || '')
    }
  }, [rapidApiKey, asterApiKey, asterApiSecretKey, hyperliquidWalletAddress, krakenApiKey, krakenApiSecretKey, apiKeysLoading])

  // Load platforms on mount
  // Load available years for crypto tax report
  useEffect(() => {
    const loadYears = async () => {
      if (!uid) return
      setLoadingYears(true)
      try {
        const years = await getYearsWithCryptoActivity(uid)
        setAvailableYears(years)
        if (years.length > 0) {
          setSelectedYear(years[0]) // Select most recent year by default
        }
      } catch (error) {
        console.error('Failed to load years:', error)
      } finally {
        setLoadingYears(false)
      }
    }
    loadYears()
  }, [uid])

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

  const handleSetDefaultPlatform = async (platform: Platform) => {
    // Unset all other platforms as default, set this one as default
    const updated = platforms.map(p => ({
      ...p,
      isDefault: p.id === platform.id ? !p.isDefault : false
    }))
    setPlatforms(updated)
    await savePlatforms(updated, uid)
  }

  const handleSaveAllApiKeys = async (e: FormEvent) => {
    e.preventDefault()
    setApiKeyError(null)
    setApiKeySuccess(false)
    setApiKeySaving(true)

    try {
      // Save all keys (including empty ones to clear them)
      // Save each key individually to ensure they all get saved even if some are empty
      await setRapidApiKey(rapidApiKeyInput || '')
      await setAsterApiKey(asterApiKeyInput || '')
      await setAsterApiSecretKey(asterApiSecretKeyInput || '')
      await setHyperliquidWalletAddress(hyperliquidWalletAddressInput || '')
      await setKrakenApiKey(krakenApiKeyInput || '')
      await setKrakenApiSecretKey(krakenApiSecretKeyInput || '')

      setApiKeySuccess(true)
      setTimeout(() => setApiKeySuccess(false), 3000)
    } catch (error) {
      // Check for Firebase quota errors
      const isFirebaseError = error && typeof error === 'object' && 'code' in error
      const isQuotaError = isFirebaseError && (
        (error as { code?: string }).code === 'resource-exhausted' ||
        (error instanceof Error && error.message.includes('Quota exceeded'))
      )
      
      const errorMessage = isQuotaError
        ? 'Firestore quota exceeded. Please try again later.'
        : (error instanceof Error ? error.message : 'Failed to save API keys')
      
      setApiKeyError(errorMessage)
      setTimeout(() => setApiKeyError(null), 5000)
    } finally {
      setApiKeySaving(false)
    }
  }

  const handleCreateSnapshot = async () => {
    if (!uid) {
      alert('Please sign in to create a snapshot.')
      return
    }

    setCreatingSnapshot(true)
    setSnapshotError(null)
    setSnapshotSuccess(false)

    try {
      // Get data from DataContext
      const { snapshots, netWorthItems, transactions, cryptoPrices, stockPrices, usdToChfRate } = data

      if (!netWorthItems || !transactions || !cryptoPrices || !stockPrices) {
        throw new Error('Data not available. Please wait for data to load.')
      }

      // Get today's date in UTC
      const todayDate = getTodayUTCDate()

      // Check if snapshot already exists for this date
      if (hasSnapshotForDate(snapshots, todayDate)) {
        setSnapshotError(`A snapshot already exists for ${todayDate}.`)
        setTimeout(() => setSnapshotError(null), 5000)
        return
      }

      // Create snapshot using the same calculation logic as the frontend
      const newSnapshot = createSnapshot(
        netWorthItems,
        transactions,
        cryptoPrices,
        stockPrices,
        convert,
        usdToChfRate
      )

      // Override timestamp to be end of day UTC for consistency
      newSnapshot.timestamp = getToday2359UTCTimestamp()

      // Add the new snapshot to the existing snapshots and save
      const updatedSnapshots = [...snapshots, newSnapshot]
      await saveSnapshots(updatedSnapshots, uid)

      setSnapshotSuccess(true)
      setTimeout(() => setSnapshotSuccess(false), 5000)
    } catch (error) {
      console.error('Snapshot creation error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create snapshot'
      setSnapshotError(errorMessage)
      setTimeout(() => setSnapshotError(null), 5000)
    } finally {
      setCreatingSnapshot(false)
    }
  }

  return (
    <div className="min-h-screen px-2 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Settings</Heading>

        {/* General Section */}
        <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <Heading level={2} className="mb-4">General</Heading>
          
          <div>
            {/* Exchange Rates Display */}
            <div>
              <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                Exchange Rates (Base: CHF)
              </label>
              <div className="mt-2 space-y-2">
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

        {/* API Keys Section */}
        <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <Heading level={2} className="mb-4">API Keys</Heading>
          
          {apiKeyError && (
            <div className="mb-4 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
              {apiKeyError}
            </div>
          )}

          {apiKeySuccess && (
            <div className="mb-4 text-[0.567rem] md:text-xs text-success bg-bg-surface-2 border border-success/40 rounded-input px-3 py-2">
              API keys saved successfully!
            </div>
          )}

          <form onSubmit={handleSaveAllApiKeys} className="space-y-6">
            {/* RapidAPI Group */}
            <div className="space-y-4">
              <Heading level={3} className="text-text-secondary mb-2">RapidAPI</Heading>
              <p className="text-text-muted text-[0.567rem] md:text-xs mb-3">
                Required for fetching stock, index fund, and commodity prices. Get your key from{' '}
                <a 
                  href="https://rapidapi.com/apidojo/api/yahoo-finance1" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-accent-blue hover:underline"
                >
                  RapidAPI
                </a>
                .
              </p>
              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showRapidApiKey ? "text" : "password"}
                    value={rapidApiKeyInput}
                    onChange={(e) => setRapidApiKeyInput(e.target.value)}
                    placeholder="Enter your RapidAPI key"
                    className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 pr-10 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue font-mono"
                    disabled={apiKeysLoading || apiKeySaving}
                    autoComplete="off"
                    spellCheck="false"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRapidApiKey(!showRapidApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors p-1"
                    disabled={apiKeysLoading || apiKeySaving}
                  >
                    {showRapidApiKey ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {!apiKeysLoading && (
                  <p className="mt-1 text-text-muted text-[0.567rem] md:text-xs">
                    {rapidApiKey ? '✓ API key is configured' : '⚠️ No API key configured'}
                  </p>
                )}
              </div>
            </div>

            {/* Aster Group */}
            <div className="space-y-4">
              <Heading level={3} className="text-text-secondary mb-2">Aster</Heading>
              <p className="text-text-muted text-[0.567rem] md:text-xs mb-3">
                Required for fetching open positions, open orders, and available margin from Aster exchange. Get your API keys from your Aster account.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showAsterApiKey ? "text" : "password"}
                      value={asterApiKeyInput}
                      onChange={(e) => setAsterApiKeyInput(e.target.value)}
                      placeholder="Enter your Aster API key"
                      className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 pr-10 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue font-mono"
                      disabled={apiKeysLoading || apiKeySaving}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAsterApiKey(!showAsterApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors p-1"
                      disabled={apiKeysLoading || apiKeySaving}
                    >
                      {showAsterApiKey ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {!apiKeysLoading && (
                    <p className="mt-1 text-text-muted text-[0.567rem] md:text-xs">
                      {asterApiKey ? '✓ API key is configured' : '⚠️ No API key configured'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                    Secret API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showAsterApiSecretKey ? "text" : "password"}
                      value={asterApiSecretKeyInput}
                      onChange={(e) => setAsterApiSecretKeyInput(e.target.value)}
                      placeholder="Enter your Aster API secret key"
                      className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 pr-10 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue font-mono"
                      disabled={apiKeysLoading || apiKeySaving}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAsterApiSecretKey(!showAsterApiSecretKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors p-1"
                      disabled={apiKeysLoading || apiKeySaving}
                    >
                      {showAsterApiSecretKey ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {!apiKeysLoading && (
                    <p className="mt-1 text-text-muted text-[0.567rem] md:text-xs">
                      {asterApiSecretKey ? '✓ API secret key is configured' : '⚠️ No API secret key configured'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Hyperliquid Group */}
            <div className="space-y-4">
              <Heading level={3} className="text-text-secondary mb-2">Hyperliquid</Heading>
              <p className="text-text-muted text-[0.567rem] md:text-xs mb-3">
                Required for fetching open positions, locked margin, and available margin from Hyperliquid exchange. Enter your wallet address for read-only access.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                    Wallet Address
                  </label>
                  <div className="relative">
                    <input
                      type={showHyperliquidWalletAddress ? "text" : "password"}
                      value={hyperliquidWalletAddressInput}
                      onChange={(e) => setHyperliquidWalletAddressInput(e.target.value)}
                      placeholder="Enter your Hyperliquid wallet address"
                      className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 pr-10 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue font-mono"
                      disabled={apiKeysLoading || apiKeySaving}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="button"
                      onClick={() => setShowHyperliquidWalletAddress(!showHyperliquidWalletAddress)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors p-1"
                      disabled={apiKeysLoading || apiKeySaving}
                    >
                      {showHyperliquidWalletAddress ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {!apiKeysLoading && (
                    <p className="mt-1 text-text-muted text-[0.567rem] md:text-xs">
                      {hyperliquidWalletAddress ? '✓ Wallet address is configured' : '⚠️ No wallet address configured'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Kraken Futures Group */}
            <div className="space-y-4">
              <Heading level={3} className="text-text-secondary mb-2">Kraken Futures</Heading>
              <p className="text-text-muted text-[0.567rem] md:text-xs mb-3">
                Required for fetching open positions, open orders, and available margin from Kraken Futures exchange. Get your API keys from your Kraken account.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKrakenApiKey ? "text" : "password"}
                      value={krakenApiKeyInput}
                      onChange={(e) => setKrakenApiKeyInput(e.target.value)}
                      placeholder="Enter your Kraken Futures API key"
                      className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 pr-10 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue font-mono"
                      disabled={apiKeysLoading || apiKeySaving}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKrakenApiKey(!showKrakenApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors p-1"
                      disabled={apiKeysLoading || apiKeySaving}
                    >
                      {showKrakenApiKey ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {!apiKeysLoading && (
                    <p className="mt-1 text-text-muted text-[0.567rem] md:text-xs">
                      {krakenApiKey ? '✓ API key is configured' : '⚠️ No API key configured'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                    Secret API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKrakenApiSecretKey ? "text" : "password"}
                      value={krakenApiSecretKeyInput}
                      onChange={(e) => setKrakenApiSecretKeyInput(e.target.value)}
                      placeholder="Enter your Kraken Futures API secret key"
                      className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 pr-10 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue font-mono"
                      disabled={apiKeysLoading || apiKeySaving}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKrakenApiSecretKey(!showKrakenApiSecretKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors p-1"
                      disabled={apiKeysLoading || apiKeySaving}
                    >
                      {showKrakenApiSecretKey ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {!apiKeysLoading && (
                    <p className="mt-1 text-text-muted text-[0.567rem] md:text-xs">
                      {krakenApiSecretKey ? '✓ API secret key is configured' : '⚠️ No API secret key configured'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-border-subtle">
              <button
                type="submit"
                disabled={apiKeysLoading || apiKeySaving}
                className="w-full px-4 py-2 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {apiKeySaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>

        {/* Reports Section */}
        <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <Heading level={2} className="mb-4">Reports</Heading>
          
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-6">
            Generate tax reports based on your Capitalos data. Select a tax year and generate a PDF report for your crypto transactions.
          </p>

          <div className="space-y-4">
            {/* Year Selection */}
            <div>
              <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                Tax Year
              </label>
              {loadingYears ? (
                <div className="text-text-muted text-[0.567rem] md:text-xs">Loading years...</div>
              ) : (
                <select
                  value={selectedYear || ''}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                  disabled={availableYears.length === 0}
                >
                  {availableYears.length === 0 ? (
                    <option value="">No years available</option>
                  ) : (
                    availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {/* Generate Report Button */}
            <button
              onClick={handleCryptoTaxReport}
              disabled={generatingTaxReport || !uid || !selectedYear || availableYears.length === 0}
              className="w-full py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingTaxReport ? 'Generating PDF...' : 'Generate Crypto Tax Report (CH)'}
            </button>
          </div>
        </div>

        {/* Data Section */}
        <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <Heading level={2} className="mb-4">Data</Heading>
          
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-6">
            Export or import your Capitalos data. Net Worth and Cashflow data exports the current state.
          </p>

          <div className="space-y-6">
            {/* Main Data Export/Import */}
            <div>
              <Heading level={3} className="mb-3 text-sm">Net Worth & Cashflow Data</Heading>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <button
                    onClick={handleExportJSON}
                    disabled={exportLoading || !uid}
                    className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-full"
                  >
                    {exportLoading ? 'Exporting...' : 'Export Data (JSON)'}
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
        </div>

        {/* Platforms Section */}
        <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <Heading level={2} className="mb-4">Platforms</Heading>
          
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-4">
            Manage platforms that appear in dropdowns throughout the application. Platforms with highest inflow are listed first.
          </p>

          <div className="bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 mb-6">
            <p className="text-text-secondary text-[0.567rem] md:text-xs">
              <strong className="text-text-primary">Default Platform:</strong> Set a default platform to automatically select it when opening the Analytics page. This saves time if you frequently analyze the same platform. You can mark one platform as default, or leave none selected.
            </p>
          </div>

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

          {/* Platforms List - Collapsible */}
          {platformLoading ? (
            <p className="text-text-muted text-[0.567rem] md:text-xs">Loading platforms...</p>
          ) : platforms.length === 0 ? (
            <p className="text-text-muted text-[0.567rem] md:text-xs">No platforms yet. Add one above.</p>
          ) : (
            <div className="border-t-2 border-border-strong pt-6 mt-6">
              <button
                onClick={() => setShowPlatformsList(!showPlatformsList)}
                className="w-full flex items-center justify-between bg-bg-surface-2 border border-border-subtle hover:border-[#DAA520] rounded-input px-4 py-3 transition-all duration-200 hover:shadow-card group"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className={`w-5 h-5 text-[#DAA520] transition-transform duration-200 ${showPlatformsList ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  <span className="text-text-primary text-xs md:text-sm font-semibold">
                    Platforms
                  </span>
                  <span className="bg-bg-surface-3 text-text-secondary text-[0.567rem] md:text-xs font-medium px-2 py-0.5 rounded-full">
                    {platforms.length}
                  </span>
                </div>
                <span className="text-text-secondary text-[0.567rem] md:text-xs group-hover:text-[#DAA520] transition-colors">
                  {showPlatformsList ? 'Hide' : 'Show'}
                </span>
              </button>
              {showPlatformsList && (
                <div className="space-y-2 mt-6">
                  {platforms.map((platform) => (
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
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-text-primary text-xs md:text-sm font-medium">{platform.name}</span>
                            {platform.isDefault && (
                              <span className="px-2 py-0.5 bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full">
                                Default
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSetDefaultPlatform(platform)}
                              className={`px-3 py-1.5 border text-[0.567rem] md:text-xs rounded-full transition-colors ${
                                platform.isDefault
                                  ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] border-transparent'
                                  : 'bg-bg-surface-3 border-border-subtle text-text-primary hover:bg-bg-surface-1'
                              }`}
                              title={platform.isDefault ? 'Unset as default' : 'Set as default for Analytics'}
                            >
                              {platform.isDefault ? 'Default' : 'Set Default'}
                            </button>
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
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Developer Section */}
        <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <Heading level={2} className="mb-4">Developer</Heading>
          
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-6">
            Developer tools and utilities for testing and debugging.
          </p>

          <div className="space-y-4">
            {/* Create Snapshot */}
            <div>
              <Heading level={3} className="mb-2 text-text-secondary">Create Snapshot</Heading>
              <p className="text-text-muted text-[0.567rem] md:text-xs mb-4">
                Manually create a snapshot of your current net worth. This will calculate and store the total value of all categories in CHF.
              </p>
              
              {snapshotError && (
                <div className="mb-4 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
                  {snapshotError}
                </div>
              )}

              {snapshotSuccess && (
                <div className="mb-4 text-[0.567rem] md:text-xs text-success bg-bg-surface-2 border border-success/40 rounded-input px-3 py-2">
                  Snapshot created successfully!
                </div>
              )}

              <button
                onClick={handleCreateSnapshot}
                disabled={creatingSnapshot || !uid}
                className="w-full py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingSnapshot ? 'Creating Snapshot...' : 'Create Snapshot'}
              </button>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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


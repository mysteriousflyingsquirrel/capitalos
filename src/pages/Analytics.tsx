import { useState, useEffect, useMemo, useRef, type MouseEvent, type FormEvent, type ChangeEvent } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { useCurrency } from '../contexts/CurrencyContext'
import { useIncognito } from '../contexts/IncognitoContext'
import { useData } from '../contexts/DataContext'
import { formatMoney } from '../lib/currency'
import {
  loadPlatforms,
  savePlatform,
  loadCashflowAccountflowMappings,
  loadForecastEntries,
  saveForecastEntry,
  deleteForecastEntry,
  type Platform,
  type ForecastEntry,
} from '../services/storageService'
import {
  calculateForecast,
  getPlatformBalance,
  getPlatformSpareChangeInflow
} from '../services/forecastCalculationService'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const CHART_COLORS = {
  gold: '#DAA520',
  bronze: '#B87333',
  accent1: '#4A90E2',
  success: '#2ECC71',
  danger: '#E74C3C',
  muted1: '#8B8F99',
}

interface EntryMenuProps {
  entry: ForecastEntry
  onEdit: (entry: ForecastEntry) => void
  onRemove: (id: string) => void
}

function EntryMenu({ entry, onEdit, onRemove }: EntryMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
        setMenuPosition(null)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const menuWidth = 180
      setMenuOpen(true)
      setMenuPosition({ x: rect.left - menuWidth - 8, y: rect.top })
    }
  }

  const handleEdit = () => {
    setMenuOpen(false)
    setMenuPosition(null)
    onEdit(entry)
  }

  const handleRemove = () => {
    setMenuOpen(false)
    setMenuPosition(null)
    onRemove(entry.id)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className="p-0"
        aria-label="Options"
      >
        <svg className="w-6 h-6 text-text-secondary" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>
      {menuOpen && menuPosition && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-2 min-w-[160px]"
          style={{ left: menuPosition.x, top: menuPosition.y }}
        >
          <button
            onClick={handleEdit}
            className="w-full text-left px-3 py-1.5 text-text-primary text-[0.567rem] md:text-xs hover:bg-bg-surface-2 transition-colors rounded-input"
          >
            Edit
          </button>
          <button
            onClick={handleRemove}
            className="w-full text-left px-3 py-1.5 text-danger text-[0.567rem] md:text-xs hover:bg-bg-surface-2 transition-colors rounded-input"
          >
            Remove
          </button>
        </div>
      )}
    </>
  )
}

function formatDateToDDMMYYYY(dateString: string): string {
  if (!dateString) return ''
  const [year, month, day] = dateString.split('-')
  return `${day}/${month}/${year}`
}

interface ForecastEntryModalProps {
  type: 'inflow' | 'outflow'
  editingEntry: ForecastEntry | null
  onClose: () => void
  onSubmit: (data: { date: string; title: string; amount: number }) => void
}

function ForecastEntryModal({ type, editingEntry, onClose, onSubmit }: ForecastEntryModalProps) {
  const initialDate = editingEntry
    ? editingEntry.date
    : new Date().toISOString().split('T')[0]

  const [dateValue, setDateValue] = useState(initialDate)
  const [title, setTitle] = useState(editingEntry ? editingEntry.title : '')
  const [amount, setAmount] = useState(editingEntry ? editingEntry.amount.toString() : '')

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDateValue(e.target.value)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!dateValue || !title || !amount || parseFloat(amount) <= 0) {
      return
    }

    onSubmit({
      date: dateValue,
      title,
      amount: parseFloat(amount),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="presentation">
      <div
        className="bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forecast-entry-modal-title"
      >
        <div className="flex items-center justify-between mb-4">
          <Heading level={3} id="forecast-entry-modal-title">
            {editingEntry ? 'Edit' : 'Add'} {type === 'inflow' ? 'Inflow' : 'Payment'}
          </Heading>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-surface-2 rounded transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="forecast-date" className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Date
            </label>
            <input
              id="forecast-date"
              type="date"
              value={dateValue}
              onChange={handleDateChange}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              required
            />
            {dateValue && (
              <p className="mt-1 text-text-muted text-[0.567rem] md:text-xs">
                Selected: {formatDateToDDMMYYYY(dateValue)}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="forecast-title" className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Title
            </label>
            <input
              id="forecast-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder="e.g., Bonus, Rent payment"
              required
            />
          </div>

          <div>
            <label htmlFor="forecast-amount" className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Amount
            </label>
            <input
              id="forecast-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder="0.00"
              step="0.01"
              min="0.01"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-bg-surface-2 border border-border-subtle rounded-input text-text-primary text-xs md:text-sm font-medium hover:bg-bg-surface-3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-xs md:text-sm font-semibold rounded-input transition-all duration-200 shadow-card hover:shadow-lg"
            >
              {editingEntry ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Analytics() {
  const { uid } = useAuth()
  const { baseCurrency, convert } = useCurrency()
  const { isIncognito } = useIncognito()
  const { data } = useData()

  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [selectedPlatformId, setSelectedPlatformId] = useState('')
  const [safetyBuffer, setSafetyBuffer] = useState<number | null>(null)
  const [forecastEntries, setForecastEntries] = useState<ForecastEntry[]>([])
  const [accountflowMappings, setAccountflowMappings] = useState<any[]>([])
  const [editingEntry, setEditingEntry] = useState<ForecastEntry | null>(null)
  const [showAddModal, setShowAddModal] = useState<'inflow' | 'outflow' | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  const getClientUpdatedAt = (obj: { updatedAt?: unknown } | undefined): Date | null => {
    const updatedAt = obj?.updatedAt
    if (!updatedAt) return null
    try {
      const millis = (updatedAt as { toMillis?: () => number })?.toMillis?.()
      const date = new Date(millis || (updatedAt as number))
      return Number.isFinite(date.getTime()) ? date : null
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (!uid) return

    const loadData = async () => {
      try {
        setDataLoading(true)
        const [loadedPlatforms, loadedEntries, loadedMappings] = await Promise.all([
          loadPlatforms([], uid),
          loadForecastEntries([], uid),
          loadCashflowAccountflowMappings([], uid),
        ])
        setPlatforms(loadedPlatforms)
        setForecastEntries(loadedEntries)
        setAccountflowMappings(loadedMappings)

        if (loadedPlatforms.length > 0 && !selectedPlatformId) {
          const defaultPlatform = loadedPlatforms.find((p: Platform) => p.isDefault)
          const platformToSelect = defaultPlatform ? defaultPlatform.id : loadedPlatforms[0].id
          setSelectedPlatformId(platformToSelect)
          const selectedPlatform = loadedPlatforms.find((p: Platform) => p.id === platformToSelect)
          setSafetyBuffer(selectedPlatform?.safetyBuffer ?? null)
        }
      } catch (error) {
        console.error('Failed to load analytics data:', error)
      } finally {
        setDataLoading(false)
      }
    }

    loadData()
  }, [uid])

  useEffect(() => {
    if (!selectedPlatformId || platforms.length === 0) {
      setSafetyBuffer(null)
      return
    }

    const selectedPlatform = platforms.find(p => p.id === selectedPlatformId)
    setSafetyBuffer(selectedPlatform?.safetyBuffer ?? null)
  }, [selectedPlatformId, platforms])

  useEffect(() => {
    if (!uid || dataLoading || !selectedPlatformId) return

    const timeoutId = setTimeout(() => {
      const existingPlatform = platforms.find(p => p.id === selectedPlatformId)
      if (!existingPlatform) return

      const updatedPlatform = {
        ...existingPlatform,
        safetyBuffer: safetyBuffer !== null && safetyBuffer !== undefined ? safetyBuffer : undefined,
      }

      setPlatforms(prev => prev.map(p => (p.id === selectedPlatformId ? updatedPlatform : p)))

      const clientUpdatedAt = getClientUpdatedAt(existingPlatform as { updatedAt?: unknown })
      savePlatform(updatedPlatform, uid, { clientUpdatedAt }).catch((error) => {
        console.error('Failed to save safety buffer:', error)
      })
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [safetyBuffer, selectedPlatformId, uid, dataLoading, platforms])

  const platformData = useMemo(() => {
    if (!selectedPlatformId) {
      return { currentBalance: 0, spareChangeInflow: 0 }
    }

    const selectedPlatform = platforms.find(p => p.id === selectedPlatformId)
    if (!selectedPlatform) {
      return { currentBalance: 0, spareChangeInflow: 0 }
    }

    const currentBalance = getPlatformBalance(
      selectedPlatformId,
      data.netWorthItems,
      data.transactions,
      data.cryptoPrices,
      data.stockPrices,
      data.usdToChfRate,
      convert,
      selectedPlatform.name
    )

    const spareChangeInflow = getPlatformSpareChangeInflow(
      selectedPlatformId,
      accountflowMappings,
      data.inflowItems,
      data.outflowItems,
      convert,
      selectedPlatform.name
    )

    return { currentBalance, spareChangeInflow }
  }, [selectedPlatformId, platforms, data, accountflowMappings, convert])

  const forecastResult = useMemo(() => {
    if (!selectedPlatformId) return null

    const platformEntries = forecastEntries.filter(
      entry => entry.platformId === selectedPlatformId
    )

    return calculateForecast(
      platformData.currentBalance,
      platformData.spareChangeInflow,
      platformEntries
    )
  }, [selectedPlatformId, forecastEntries, platformData])

  const formatCurrency = (value: number) =>
    formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })

  const formatCurrencyValue = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })

  const formatCurrencyTick = (value: number) => {
    if (isIncognito) return '****'
    const converted = convert(value, 'CHF')
    if (!Number.isFinite(converted)) return ''

    const abs = Math.abs(converted)
    const formatScaled = (n: number) => {
      const absN = Math.abs(n)
      const fixed = absN >= 10 ? n.toFixed(0) : n.toFixed(1)
      return fixed.replace(/\.0$/, '')
    }

    if (abs >= 1_000_000) return `${formatScaled(converted / 1_000_000)}M`
    if (abs >= 1_000) return `${formatScaled(converted / 1_000)}k`
    return `${Math.round(converted)}`
  }

  const handleAddEntry = async (type: 'inflow' | 'outflow', entryData: { date: string; title: string; amount: number }) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `forecast-${Date.now()}-${Math.random()}`

    const newEntry: ForecastEntry = {
      id,
      platformId: selectedPlatformId,
      type,
      date: entryData.date,
      title: entryData.title,
      amount: Math.abs(entryData.amount),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setForecastEntries(prev => [...prev, newEntry])
    setShowAddModal(null)

    const result = await saveForecastEntry(newEntry, uid)
    if (!result.success) {
      console.error('[Analytics] Failed to save new forecast entry:', result.reason)
    }
  }

  const handleEditEntry = async (entryData: { date: string; title: string; amount: number }) => {
    if (!editingEntry) return

    const existingEntry = forecastEntries.find(e => e.id === editingEntry.id)
    const clientUpdatedAt = getClientUpdatedAt(existingEntry as { updatedAt?: unknown } | undefined)

    const updatedEntry: ForecastEntry = {
      ...(existingEntry || editingEntry),
      date: entryData.date,
      title: entryData.title,
      amount: Math.abs(entryData.amount),
      updatedAt: new Date().toISOString(),
    }

    setForecastEntries(prev =>
      prev.map(entry => entry.id === editingEntry.id ? updatedEntry : entry)
    )
    setEditingEntry(null)

    const result = await saveForecastEntry(updatedEntry, uid, { clientUpdatedAt })
    if (!result.success) {
      console.error('[Analytics] Failed to save edited forecast entry:', result.reason)
    }
  }

  const handleDeleteEntry = async (entryId: string) => {
    const existingEntry = forecastEntries.find(e => e.id === entryId)
    const clientUpdatedAt = getClientUpdatedAt(existingEntry as { updatedAt?: unknown } | undefined)
    setForecastEntries(prev => prev.filter(entry => entry.id !== entryId))

    const result = await deleteForecastEntry(entryId, uid, { clientUpdatedAt })
    if (!result.success) {
      console.error('[Analytics] Failed to delete forecast entry:', result.reason)
    }
  }

  const selectedPlatformEntries = forecastEntries.filter(
    entry => entry.platformId === selectedPlatformId
  )

  const inflowEntries = selectedPlatformEntries
    .filter(entry => entry.type === 'inflow')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const outflowEntries = selectedPlatformEntries
    .filter(entry => entry.type === 'outflow')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (dataLoading && platforms.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-goldenrod mx-auto mb-4"></div>
          <div className="text-text-secondary text-sm">Loading analytics...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-2 lg:px-6 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        <Heading level={1}>Analytics</Heading>

        <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="mb-6 pb-4 border-b border-border-strong">
            <Heading level={2}>Cashflow Forecast (12 Months)</Heading>
            <p className="text-text-secondary text-[0.567rem] md:text-xs mt-2">
              Plan future inflows/outflows and see projected monthly balances.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="analytics-platform" className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  Platform
                </label>
                <select
                  id="analytics-platform"
                  value={selectedPlatformId}
                  onChange={(e) => setSelectedPlatformId(e.target.value)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select a platform...</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="analytics-safety-buffer" className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  Safety Buffer ({baseCurrency})
                </label>
                <input
                  id="analytics-safety-buffer"
                  type="number"
                  value={safetyBuffer ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    setSafetyBuffer(value === '' ? null : parseFloat(value) || null)
                  }}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                  placeholder=""
                  step="1"
                  min="0"
                />
              </div>
            </div>
          </div>

          {selectedPlatformId && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2">
                  <div className="text-text-secondary text-[0.567rem] md:text-xs mb-1">Current Balance</div>
                  <TotalText variant="inflow" className="text-sm md:text-base">
                    {formatCurrency(platformData.currentBalance)}
                  </TotalText>
                </div>
                <div className="bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2">
                  <div className="text-text-secondary text-[0.567rem] md:text-xs mb-1">Spare-Change Inflow</div>
                  <TotalText variant="spare" className="text-sm md:text-base">
                    {formatCurrency(platformData.spareChangeInflow)} / month
                  </TotalText>
                </div>
                {forecastResult && (
                  <>
                    <div className="bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2">
                      <div className="text-text-secondary text-[0.567rem] md:text-xs mb-1">Lowest Balance</div>
                      <TotalText
                        variant={forecastResult.lowestBalance < 0 ? 'outflow' : 'inflow'}
                        className="text-sm md:text-base"
                      >
                        {formatCurrency(forecastResult.lowestBalance)}
                      </TotalText>
                    </div>
                    <div className="bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2">
                      <div className="text-text-secondary text-[0.567rem] md:text-xs mb-1">Lowest Month</div>
                      <div className="text-text-primary text-sm md:text-base font-semibold">
                        {forecastResult.lowestMonth || 'N/A'}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-bg-frame border border-border-subtle rounded-input p-4">
                  <div className="flex items-end justify-between mb-4">
                    <Heading level={3}>Manual Inflows (Future)</Heading>
                    <button
                      onClick={() => setShowAddModal('inflow')}
                      className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-2 group"
                    >
                      <svg
                        className="w-4 h-4 transition-transform group-hover:rotate-90"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add Item</span>
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {inflowEntries.length === 0 ? (
                      <div className="text-text-muted text-[0.567rem] md:text-xs text-center py-4">
                        No manual inflows yet
                      </div>
                    ) : (
                      inflowEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-stretch bg-bg-surface-1 border border-border-subtle rounded-input overflow-hidden p-[10px]"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-[0.63rem] md:text-[0.79rem] truncate">{entry.title}</div>
                            <div className="text-text-muted text-[0.55rem] md:text-[0.774rem] truncate">
                              {formatDateToDDMMYYYY(entry.date)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 text-right px-2 flex flex-col justify-center">
                            <TotalText variant="inflow" className="text-[0.63rem] md:text-[0.79rem] whitespace-nowrap">
                              {formatCurrency(entry.amount)}
                            </TotalText>
                          </div>
                          <div className="flex-shrink-0 w-3" aria-hidden="true" />
                          <div className="flex-shrink-0 w-px self-stretch bg-border-subtle" aria-hidden="true" />
                          <div className="flex-shrink-0 w-3" aria-hidden="true" />
                          <div className="flex-shrink-0 flex items-center justify-end">
                            <EntryMenu
                              entry={entry}
                              onEdit={setEditingEntry}
                              onRemove={handleDeleteEntry}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-bg-frame border border-border-subtle rounded-input p-4">
                  <div className="flex items-end justify-between mb-4">
                    <Heading level={3}>Planned Payments (Future)</Heading>
                    <button
                      onClick={() => setShowAddModal('outflow')}
                      className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-2 group"
                    >
                      <svg
                        className="w-4 h-4 transition-transform group-hover:rotate-90"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add Item</span>
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {outflowEntries.length === 0 ? (
                      <div className="text-text-muted text-[0.567rem] md:text-xs text-center py-4">
                        No planned payments yet
                      </div>
                    ) : (
                      outflowEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-stretch bg-bg-surface-1 border border-border-subtle rounded-input overflow-hidden p-[10px]"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-[0.63rem] md:text-[0.79rem] truncate">{entry.title}</div>
                            <div className="text-text-muted text-[0.55rem] md:text-[0.774rem] truncate">
                              {formatDateToDDMMYYYY(entry.date)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 text-right px-2 flex flex-col justify-center">
                            <TotalText variant="outflow" className="text-[0.63rem] md:text-[0.79rem] whitespace-nowrap">
                              {formatCurrency(entry.amount)}
                            </TotalText>
                          </div>
                          <div className="flex-shrink-0 w-3" aria-hidden="true" />
                          <div className="flex-shrink-0 w-px self-stretch bg-border-subtle" aria-hidden="true" />
                          <div className="flex-shrink-0 w-3" aria-hidden="true" />
                          <div className="flex-shrink-0 flex items-center justify-end">
                            <EntryMenu
                              entry={entry}
                              onEdit={setEditingEntry}
                              onRemove={handleDeleteEntry}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {forecastResult && (
                <div className="space-y-6">
                  <div className="bg-bg-frame border border-border-subtle rounded-input p-4">
                    <Heading level={3} className="mb-4">Monthly Projection</Heading>
                    <div className="overflow-x-auto -mx-4 px-4">
                      <table className="w-full text-xs md:text-sm min-w-[600px]" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '20%' }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border-subtle">
                            <th scope="col" className="text-left pb-2 pr-2">
                              <Heading level={4}>Month</Heading>
                            </th>
                            <th scope="col" className="text-right pb-2 pr-2">
                              <Heading level={4}>Start Balance</Heading>
                            </th>
                            <th scope="col" className="text-right pb-2 pr-2">
                              <Heading level={4}>Inflows</Heading>
                            </th>
                            <th scope="col" className="text-right pb-2 pr-2">
                              <Heading level={4}>Outflows</Heading>
                            </th>
                            <th scope="col" className="text-right pb-2">
                              <Heading level={4}>End Balance</Heading>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {forecastResult.monthlyProjections.map((projection) => {
                            const isNegative = projection.endBalance < 0
                            const isBelowBuffer = safetyBuffer !== null && safetyBuffer !== undefined && projection.endBalance < safetyBuffer && projection.endBalance >= 0

                            return (
                              <tr
                                key={projection.month}
                                className={`border-b border-border-subtle last:border-b-0 ${
                                  isNegative ? 'bg-danger/10' : isBelowBuffer ? 'bg-amber-500/10' : ''
                                }`}
                              >
                                <td className="py-2 pr-2">
                                  <div className="text2 text-text-primary">{projection.month}</div>
                                </td>
                                <td className="py-2 text-right pr-2 whitespace-nowrap">
                                  <div className="text2 text-text-secondary">{formatCurrency(projection.startBalance)}</div>
                                </td>
                                <td className="py-2 text-right pr-2 whitespace-nowrap">
                                  <div className="text2" style={{ color: '#2ECC71' }}>{formatCurrency(projection.totalInflows)}</div>
                                </td>
                                <td className="py-2 text-right pr-2 whitespace-nowrap">
                                  <div className="text2" style={{ color: '#E74C3C' }}>{formatCurrency(projection.totalOutflows)}</div>
                                </td>
                                <td className="py-2 text-right whitespace-nowrap">
                                  <div className={`text2 ${isNegative ? 'text-danger' : 'text-success'} ${isBelowBuffer ? 'text-amber-500' : ''}`}>
                                    {formatCurrency(projection.endBalance)}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-bg-frame border border-border-subtle rounded-input p-4">
                    <Heading level={3} className="mb-4">Balance Projection Chart</Heading>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart
                        data={forecastResult.monthlyProjections}
                        margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                      >
                        <XAxis
                          dataKey="month"
                          stroke={CHART_COLORS.muted1}
                          tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
                        />
                        <YAxis
                          stroke={CHART_COLORS.muted1}
                          tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
                          tickFormatter={formatCurrencyTick}
                          width={44}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E5E7EB',
                            borderRadius: '12px',
                            color: '#111827',
                            fontSize: '0.648rem',
                            fontWeight: '400',
                          }}
                          formatter={(value: number) => formatCurrencyValue(value)}
                        />
                        <Legend
                          wrapperStyle={{ color: '#8B8F99', fontSize: '0.72rem', fontWeight: '400' }}
                          iconType="line"
                          className="text2"
                        />
                        <Line
                          type="monotone"
                          dataKey="endBalance"
                          name="End Balance"
                          stroke={CHART_COLORS.accent1}
                          strokeWidth={1}
                          dot={false}
                          activeDot={false}
                        />
                        {safetyBuffer !== null && safetyBuffer !== undefined && safetyBuffer > 0 && (
                          <Line
                            type="monotone"
                            dataKey={() => safetyBuffer}
                            name="Safety Buffer"
                            stroke={CHART_COLORS.bronze}
                            strokeWidth={1}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={false}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          )}

          {!selectedPlatformId && (
            <div className="text-center text-text-muted text-[0.567rem] md:text-xs py-8">
              Please select a platform to view cashflow forecast
            </div>
          )}
        </div>

        {(showAddModal || editingEntry) && (
          <ForecastEntryModal
            type={editingEntry ? editingEntry.type : showAddModal!}
            editingEntry={editingEntry}
            onClose={() => {
              setShowAddModal(null)
              setEditingEntry(null)
            }}
            onSubmit={(entryData) => {
              if (editingEntry) {
                handleEditEntry(entryData)
              } else {
                handleAddEntry(showAddModal!, entryData)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

export default Analytics

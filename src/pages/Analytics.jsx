import { useState, useEffect, useMemo } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useIncognito } from '../contexts/IncognitoContext'
import { useData } from '../contexts/DataContext'
import { formatMoney } from '../lib/currency'
import { loadPlatforms, savePlatforms } from '../services/storageService'
import { loadCashflowAccountflowMappings } from '../services/storageService'
import { 
  loadForecastEntries, 
  saveForecastEntries
} from '../services/forecastService'
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

// Chart colors matching Dashboard
const CHART_COLORS = {
  gold: '#DAA520',
  bronze: '#B87333',
  accent1: '#4A90E2',
  success: '#2ECC71',
  danger: '#E74C3C',
  muted1: '#8B8F99',
}

function Analytics() {
  const { uid } = useAuth()
  const { baseCurrency, convert } = useCurrency()
  const { isIncognito } = useIncognito()
  const { data } = useData()
  
  const [platforms, setPlatforms] = useState([])
  const [selectedPlatformId, setSelectedPlatformId] = useState('')
  const [safetyBuffer, setSafetyBuffer] = useState(null)
  const [forecastEntries, setForecastEntries] = useState([])
  const [accountflowMappings, setAccountflowMappings] = useState([])
  const [editingEntry, setEditingEntry] = useState(null)
  const [showAddModal, setShowAddModal] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)

  // Load platforms and forecast entries
  useEffect(() => {
    if (!uid) return

    const loadData = async () => {
      try {
        setDataLoading(true)
        const [loadedPlatforms, loadedEntries, loadedMappings] = await Promise.all([
          loadPlatforms([], uid),
          loadForecastEntries(uid),
          loadCashflowAccountflowMappings([], uid),
        ])
        setPlatforms(loadedPlatforms)
        setForecastEntries(loadedEntries)
        setAccountflowMappings(loadedMappings)
        
        // Auto-select default platform, or first platform if no default
        if (loadedPlatforms.length > 0 && !selectedPlatformId) {
          const defaultPlatform = loadedPlatforms.find(p => p.isDefault)
          const platformToSelect = defaultPlatform ? defaultPlatform.id : loadedPlatforms[0].id
          setSelectedPlatformId(platformToSelect)
          // Load safety buffer for selected platform
          const selectedPlatform = loadedPlatforms.find(p => p.id === platformToSelect)
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

  // Save forecast entries when they change
  useEffect(() => {
    if (uid && !dataLoading) {
      saveForecastEntries(uid, forecastEntries).catch((error) => {
        console.error('Failed to save forecast entries:', error)
      })
    }
  }, [forecastEntries, uid, dataLoading])

  // Load safety buffer when platform changes
  useEffect(() => {
    if (!selectedPlatformId || platforms.length === 0) {
      setSafetyBuffer(null)
      return
    }

    const selectedPlatform = platforms.find(p => p.id === selectedPlatformId)
    setSafetyBuffer(selectedPlatform?.safetyBuffer ?? null)
  }, [selectedPlatformId, platforms])

  // Save safety buffer to platform when it changes (with debouncing)
  useEffect(() => {
    if (!uid || dataLoading || !selectedPlatformId) return

    const timeoutId = setTimeout(() => {
      const updatedPlatforms = platforms.map(platform => {
        if (platform.id === selectedPlatformId) {
          return {
            ...platform,
            safetyBuffer: safetyBuffer !== null && safetyBuffer !== undefined ? safetyBuffer : undefined,
          }
        }
        return platform
      })
      
      savePlatforms(updatedPlatforms, uid).then(() => {
        // Update local state to reflect saved value
        setPlatforms(updatedPlatforms)
      }).catch((error) => {
        console.error('Failed to save safety buffer:', error)
      })
    }, 500) // Debounce: wait 500ms after user stops typing

    return () => clearTimeout(timeoutId)
  }, [safetyBuffer, selectedPlatformId, uid, dataLoading, platforms])


  // Calculate current balance and spare-change for selected platform
  const platformData = useMemo(() => {
    if (!selectedPlatformId) {
      return {
        currentBalance: 0,
        spareChangeInflow: 0,
      }
    }

    const selectedPlatform = platforms.find(p => p.id === selectedPlatformId)
    if (!selectedPlatform) {
      return {
        currentBalance: 0,
        spareChangeInflow: 0,
      }
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

    return {
      currentBalance,
      spareChangeInflow,
    }
  }, [selectedPlatformId, platforms, data, accountflowMappings, convert])

  // Calculate forecast
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

  const formatCurrency = (value) => 
    formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })

  const handleAddEntry = (type, entryData) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto 
      ? crypto.randomUUID() 
      : `forecast-${Date.now()}-${Math.random()}`
    
    const newEntry = {
      id,
      platformId: selectedPlatformId,
      type,
      date: entryData.date,
      title: entryData.title,
      amount: Math.abs(entryData.amount), // Store as absolute value
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setForecastEntries(prev => [...prev, newEntry])
    setShowAddModal(null)
  }

  const handleEditEntry = (entryData) => {
    if (!editingEntry) return

    setForecastEntries(prev =>
      prev.map(entry =>
        entry.id === editingEntry.id
          ? {
              ...entry,
              date: entryData.date,
              title: entryData.title,
              amount: Math.abs(entryData.amount),
              updatedAt: new Date().toISOString(),
            }
          : entry
      )
    )
    setEditingEntry(null)
  }

  const handleDeleteEntry = (entryId) => {
    setForecastEntries(prev => prev.filter(entry => entry.id !== entryId))
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

  return (
    <div className="min-h-screen px-2 py-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <Heading level={1}>Analytics</Heading>

        {/* Cashflow Forecast Section */}
        <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          {/* Header */}
          <div className="mb-6 pb-4 border-b border-border-strong">
            <Heading level={2}>Cashflow Forecast (12 Months)</Heading>
            <p className="text-text-secondary text-[0.567rem] md:text-xs mt-2">
              Plan future inflows/outflows and see projected monthly balances.
            </p>
          </div>

          {/* Controls */}
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  Platform
                </label>
                <select
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
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  Safety Buffer ({baseCurrency})
                </label>
                <input
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
              {/* Summary */}
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

              {/* Entry Lists */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Manual Inflows */}
                <div className="bg-bg-surface-2 border border-border-subtle rounded-input p-4">
                  <div className="flex items-center justify-between mb-4">
                    <Heading level={3}>Manual Inflows (Future)</Heading>
                    <button
                      onClick={() => setShowAddModal('inflow')}
                      className="py-1.5 px-3 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {inflowEntries.length === 0 ? (
                      <div className="text-text-muted text-[0.567rem] md:text-xs text-center py-4">
                        No manual inflows yet
                      </div>
                    ) : (
                      inflowEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-2 bg-bg-surface-1 rounded-input border border-border-subtle"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-text-primary text-xs md:text-sm font-medium truncate">
                              {entry.title}
                            </div>
                            <div className="text-text-secondary text-[0.567rem] md:text-xs">
                              {formatDateToDDMMYYYY(entry.date)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <TotalText variant="inflow" className="text-xs md:text-sm">
                              {formatCurrency(entry.amount)}
                            </TotalText>
                            <button
                              onClick={() => setEditingEntry(entry)}
                              className="p-1 hover:bg-bg-surface-2 rounded transition-colors"
                              title="Edit"
                            >
                              <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="p-1 hover:bg-bg-surface-2 rounded transition-colors"
                              title="Delete"
                            >
                              <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Planned Payments */}
                <div className="bg-bg-surface-2 border border-border-subtle rounded-input p-4">
                  <div className="flex items-center justify-between mb-4">
                    <Heading level={3}>Planned Payments (Future)</Heading>
                    <button
                      onClick={() => setShowAddModal('outflow')}
                      className="py-1.5 px-3 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {outflowEntries.length === 0 ? (
                      <div className="text-text-muted text-[0.567rem] md:text-xs text-center py-4">
                        No planned payments yet
                      </div>
                    ) : (
                      outflowEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-2 bg-bg-surface-1 rounded-input border border-border-subtle"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-text-primary text-xs md:text-sm font-medium truncate">
                              {entry.title}
                            </div>
                            <div className="text-text-secondary text-[0.567rem] md:text-xs">
                              {formatDateToDDMMYYYY(entry.date)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <TotalText variant="outflow" className="text-xs md:text-sm">
                              {formatCurrency(entry.amount)}
                            </TotalText>
                            <button
                              onClick={() => setEditingEntry(entry)}
                              className="p-1 hover:bg-bg-surface-2 rounded transition-colors"
                              title="Edit"
                            >
                              <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="p-1 hover:bg-bg-surface-2 rounded transition-colors"
                              title="Delete"
                            >
                              <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Projection Table and Chart */}
              {forecastResult && (
                <div className="space-y-6">
                  {/* Monthly Projection Table */}
                  <div className="bg-bg-surface-2 border border-border-subtle rounded-input p-4">
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
                            <th className="text-left pb-2 pr-2">Month</th>
                            <th className="text-right pb-2 pr-2">Start Balance</th>
                            <th className="text-right pb-2 pr-2">Inflows</th>
                            <th className="text-right pb-2 pr-2">Outflows</th>
                            <th className="text-right pb-2">End Balance</th>
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
                                <td className="py-2 text-text-primary pr-2">{projection.month}</td>
                                <td className="py-2 text-right text-text-secondary pr-2 whitespace-nowrap">
                                  {formatCurrency(projection.startBalance)}
                                </td>
                                <td className="py-2 text-right text-success pr-2 whitespace-nowrap">
                                  {formatCurrency(projection.totalInflows)}
                                </td>
                                <td className="py-2 text-right text-danger pr-2 whitespace-nowrap">
                                  {formatCurrency(projection.totalOutflows)}
                                </td>
                                <td className="py-2 text-right whitespace-nowrap">
                                  <TotalText
                                    variant={isNegative ? 'outflow' : 'inflow'}
                                    className={isBelowBuffer ? 'text-amber-500' : ''}
                                  >
                                    {formatCurrency(projection.endBalance)}
                                  </TotalText>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="bg-bg-surface-2 border border-border-subtle rounded-input p-4">
                    <Heading level={3} className="mb-4">Balance Projection Chart</Heading>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart 
                        data={forecastResult.monthlyProjections}
                        margin={{ left: 12, right: 12, top: 5, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.muted1} opacity={0.3} />
                        <XAxis
                          dataKey="month"
                          stroke={CHART_COLORS.muted1}
                          tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
                        />
                        <YAxis
                          stroke={CHART_COLORS.muted1}
                          tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
                          tickFormatter={(value) => formatCurrency(value)}
                          width={80}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#050A1A',
                            border: '1px solid #B87333',
                            borderRadius: '8px',
                          }}
                          formatter={(value) => formatCurrency(value)}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="endBalance"
                          name="End Balance"
                          stroke={CHART_COLORS.accent1}
                          strokeWidth={2}
                          dot={{ fill: CHART_COLORS.accent1, r: 4 }}
                          activeDot={{ r: 6 }}
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

        {/* Add/Edit Entry Modal */}
        {(showAddModal || editingEntry) && (
          <ForecastEntryModal
              type={editingEntry ? editingEntry.type : showAddModal}
            editingEntry={editingEntry}
            onClose={() => {
              setShowAddModal(null)
              setEditingEntry(null)
            }}
              onSubmit={(entryData) => {
                if (editingEntry) {
                  handleEditEntry(entryData)
                } else {
                  handleAddEntry(showAddModal, entryData)
                }
              }}
          />
        )}
      </div>
    </div>
  )
}

// Helper function to convert YYYY-MM-DD to DD/MM/YYYY
function formatDateToDDMMYYYY(dateString) {
  if (!dateString) return ''
  const [year, month, day] = dateString.split('-')
  return `${day}/${month}/${year}`
}

// Forecast Entry Modal Component

// Helper function to convert DD/MM/YYYY to YYYY-MM-DD
function parseDateFromDDMMYYYY(dateString) {
  if (!dateString) return ''
  // Remove any non-digit characters except /
  const cleaned = dateString.replace(/[^\d/]/g, '')
  const parts = cleaned.split('/')
  if (parts.length !== 3) return ''
  
  const day = parts[0].padStart(2, '0')
  const month = parts[1].padStart(2, '0')
  const year = parts[2]
  
  // Validate basic format
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return ''
  
  // Validate date
  const date = new Date(`${year}-${month}-${day}`)
  if (isNaN(date.getTime())) return ''
  
  // Check if the parsed date matches the input (to catch invalid dates like 32/13/2024)
  if (date.getDate() !== parseInt(day) || date.getMonth() + 1 !== parseInt(month) || date.getFullYear() !== parseInt(year)) {
    return ''
  }
  
  return `${year}-${month}-${day}`
}

function ForecastEntryModal({ type, editingEntry, onClose, onSubmit }) {
  const initialDate = editingEntry 
    ? editingEntry.date 
    : new Date().toISOString().split('T')[0]
  
  const [dateValue, setDateValue] = useState(initialDate)
  const [title, setTitle] = useState(editingEntry ? editingEntry.title : '')
  const [amount, setAmount] = useState(editingEntry ? editingEntry.amount.toString() : '')

  const handleDateChange = (e) => {
    setDateValue(e.target.value)
  }

  const handleSubmit = (e) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <Heading level={3}>
            {editingEntry ? 'Edit' : 'Add'} {type === 'inflow' ? 'Inflow' : 'Payment'}
          </Heading>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-surface-2 rounded transition-colors"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Date
            </label>
            <input
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
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder="e.g., Bonus, Rent payment"
              required
            />
          </div>

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Amount
            </label>
            <input
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

export default Analytics

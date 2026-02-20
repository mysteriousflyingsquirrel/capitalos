import React, { useState, useEffect } from 'react'
import Heading from './Heading'
import { getYearsWithCryptoActivity, generateCryptoTaxReport, type CryptoTaxReport } from '../services/cryptoTaxReportService'
import { generateCryptoTaxReportPDF } from '../services/pdfService'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { formatMoney, formatNumber } from '../lib/currency'
import { formatDate } from '../lib/dateFormat'

interface CryptoTaxReportModalProps {
  onClose: () => void
}

function CryptoTaxReportModal({ onClose }: CryptoTaxReportModalProps) {
  const { convert } = useCurrency()
  const { uid, user } = useAuth()
  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [loadingYears, setLoadingYears] = useState(true)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [report, setReport] = useState<CryptoTaxReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generatingPDF, setGeneratingPDF] = useState(false)

  // Load years on mount
  useEffect(() => {
    const loadYears = async () => {
      setLoadingYears(true)
      setError(null)
      try {
        const availableYears = await getYearsWithCryptoActivity(uid)
        setYears(availableYears)
        if (availableYears.length > 0) {
          setSelectedYear(availableYears[0]) // Select most recent year by default
        }
      } catch (err) {
        setError('Jahre konnten nicht geladen werden. Bitte später erneut versuchen.')
        console.error('Failed to load years:', err)
      } finally {
        setLoadingYears(false)
      }
    }
    loadYears()
  }, [uid])

  // Generate report when year is selected
  const handleGenerateReport = async () => {
    if (!selectedYear || !convert) return

    setGeneratingReport(true)
    setError(null)
    setReport(null)

    try {
      const generatedReport = await generateCryptoTaxReport(selectedYear, uid, convert)
      setReport(generatedReport)
    } catch (err) {
      setError('Report konnte nicht generiert werden. Bitte später erneut versuchen.')
      console.error('Failed to generate report:', err)
    } finally {
      setGeneratingReport(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!report) return

    setGeneratingPDF(true)
    try {
      const userName = user?.email || user?.displayName || undefined
      await generateCryptoTaxReportPDF(report, userName)
    } catch (err) {
      setError('PDF konnte nicht erstellt werden. Bitte später erneut versuchen.')
      console.error('Failed to generate PDF:', err)
    } finally {
      setGeneratingPDF(false)
    }
  }

  const formatNumberSwiss = (value: number, decimals: number = 2): string => {
    return formatNumber(value, 'ch').replace(/,/g, "'")
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-6xl bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crypto-tax-report-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Heading level={2} id="crypto-tax-report-title">Swiss Crypto Tax Report</Heading>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-surface-2 rounded-input transition-colors text-text-secondary hover:text-text-primary"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Year Selection */}
        <div className="mb-6 flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Jahr
            </label>
            {loadingYears ? (
              <div className="text-text-muted text-[0.567rem] md:text-xs">Lade Jahre...</div>
            ) : (
              <select
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                disabled={years.length === 0}
              >
                {years.length === 0 ? (
                  <option value="">Keine Jahre verfügbar</option>
                ) : (
                  years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={!selectedYear || generatingReport || years.length === 0}
            className="px-4 py-2 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingReport ? 'Generiere...' : 'Report generieren'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        {/* Report Table */}
        {report && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-text-primary text-sm md:text-base font-semibold">
                Steuerjahr {report.year}
              </h3>
              <button
                onClick={handleDownloadPDF}
                disabled={generatingPDF}
                className="px-4 py-2 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingPDF ? 'Erstelle PDF...' : 'PDF herunterladen'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border-strong">
                    <th className="text-left py-2 px-3 text-[0.567rem] md:text-xs font-bold">Coin</th>
                    <th className="text-left py-2 px-3 text-[0.567rem] md:text-xs font-bold">Bestand 1. Januar</th>
                    <th className="text-left py-2 px-3 text-[0.567rem] md:text-xs font-bold">Kauf</th>
                    <th className="text-left py-2 px-3 text-[0.567rem] md:text-xs font-bold">Verkauf</th>
                    <th className="text-left py-2 px-3 text-[0.567rem] md:text-xs font-bold">Bestand 31. Dezember</th>
                  </tr>
                </thead>
                <tbody>
                  {report.coins.map((coin, index) => (
                    <tr key={coin.coin} className={index % 2 === 0 ? 'bg-bg-surface-2' : ''}>
                      <td className="py-3 px-3 text-[0.567rem] md:text-xs font-medium text-text-primary">
                        {coin.coin}
                      </td>
                      <td className="py-3 px-3 text-[0.567rem] md:text-xs text-text-secondary">
                        <div className="space-y-1">
                          <div>Menge: {formatNumberSwiss(coin.balanceStartOfYear.amount, 8)}</div>
                          <div>Preis/CHF: {formatMoney(coin.balanceStartOfYear.priceChf, 'CHF', 'ch')}</div>
                          <div>Wert/CHF: {formatMoney(coin.balanceStartOfYear.valueChf, 'CHF', 'ch')}</div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[0.567rem] md:text-xs text-text-secondary">
                        {coin.buys.length > 0 ? (
                          <div className="space-y-2">
                            {coin.buys.map((buy, buyIndex) => (
                              <div key={buyIndex} className="border-b border-border-subtle pb-1 last:border-b-0 last:pb-0">
                                <div className="font-medium">{formatDate(buy.date)}</div>
                                <div>Menge: {formatNumberSwiss(buy.amount, 8)}</div>
                                <div>Preis/CHF: {formatMoney(buy.priceChf, 'CHF', 'ch')}</div>
                                <div>Total/CHF: {formatMoney(buy.totalChf, 'CHF', 'ch')}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[0.567rem] md:text-xs text-text-secondary">
                        {coin.sells.length > 0 ? (
                          <div className="space-y-2">
                            {coin.sells.map((sell, sellIndex) => (
                              <div key={sellIndex} className="border-b border-border-subtle pb-1 last:border-b-0 last:pb-0">
                                <div className="font-medium">{formatDate(sell.date)}</div>
                                <div>Menge: {formatNumberSwiss(sell.amount, 8)}</div>
                                <div>Preis/CHF: {formatMoney(sell.priceChf, 'CHF', 'ch')}</div>
                                <div>Total/CHF: {formatMoney(sell.totalChf, 'CHF', 'ch')}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[0.567rem] md:text-xs text-text-secondary">
                        <div className="space-y-1">
                          <div>Menge: {formatNumberSwiss(coin.balanceEndOfYear.amount, 8)}</div>
                          <div>Preis/CHF: {formatMoney(coin.balanceEndOfYear.priceChf, 'CHF', 'ch')}</div>
                          <div>Wert/CHF: {formatMoney(coin.balanceEndOfYear.valueChf, 'CHF', 'ch')}</div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Close Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-[0.567rem] md:text-xs bg-bg-surface-2 border border-border-subtle text-text-primary hover:bg-bg-surface-3 transition-colors"
          >
            Schliessen
          </button>
        </div>
      </div>
    </div>
  )
}

export default CryptoTaxReportModal


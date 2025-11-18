import React, { useState } from 'react'
import Heading from '../components/Heading'
import { useCurrency } from '../contexts/CurrencyContext'
import type { CurrencyCode } from '../lib/currency'
import { supportedCurrencies } from '../lib/currency'

type NumberFormat = 'ch' | 'us' | 'de'

function Settings() {
  const { baseCurrency, setBaseCurrency, exchangeRates, isLoading, error } = useCurrency()
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('ch')

  // Format rate for display
  const formatRate = (value: number) => value.toFixed(4)

  // Get other currencies (all except base)
  const otherCurrencies = supportedCurrencies.filter(c => c !== baseCurrency)

  // Report generation handlers (stubs for now)
  const handleCryptoTaxReport = () => {
    alert('Crypto Tax Report generation is not implemented yet. This will trigger a serverless function in a future version.')
  }

  const handleExportJSON = () => {
    alert('JSON export is not implemented yet. This will trigger a serverless function in a future version.')
  }

  const handleImportJSON = () => {
    // Create a file input element
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const jsonData = JSON.parse(event.target?.result as string)
            alert('JSON import is not implemented yet. This will trigger data import logic in a future version.\n\nFile: ' + file.name)
            // TODO: Implement actual import logic
          } catch (error) {
            alert('Error reading JSON file. Please ensure the file is valid JSON.')
          }
        }
        reader.readAsText(file)
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Base Currency */}
            <div>
              <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-2">
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
              <p className="mt-2 text-text-muted text-[0.525rem] md:text-xs">
                All values in Capitalos will be displayed in this currency.
              </p>
              
              {/* Exchange Rates Display */}
              <div className="mt-4 space-y-2">
                {isLoading && (
                  <p className="text-text-muted text-[0.525rem] md:text-xs italic">
                    Loading latest rates...
                  </p>
                )}
                {error && (
                  <p className="text-danger text-[0.525rem] md:text-xs">
                    {error}
                  </p>
                )}
                {!isLoading && !error && exchangeRates && (
                  <div className="space-y-1">
                    {otherCurrencies.map((currency) => {
                      const rate = exchangeRates.rates[currency]
                      return (
                        <p key={currency} className="text-text-secondary text-[0.525rem] md:text-xs">
                          1 {baseCurrency} = {formatRate(rate)} {currency}
                        </p>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Number Format */}
            <div>
              <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-2">
                Number Format
              </label>
              <select
                value={numberFormat}
                onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              >
                <option value="ch">1'500.00 (CH)</option>
                <option value="us">1,500.00 (US)</option>
                <option value="de">1.500,00 (DE)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reports Section */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-4 lg:p-6">
          <Heading level={2} className="mb-4">Reports</Heading>
          
          <p className="text-text-secondary text-[0.525rem] md:text-xs mb-6">
            Generate tax reports based on your Capitalos data. These buttons will trigger server-side report generation in a future version.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={handleCryptoTaxReport}
              className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.525rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg"
            >
              Generate Crypto Tax Report
            </button>
          </div>
        </div>

        {/* Data Section */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-4 lg:p-6">
          <Heading level={2} className="mb-4">Data</Heading>
          
          <p className="text-text-secondary text-[0.525rem] md:text-xs mb-6">
            Export or import your Capitalos data. These buttons will trigger data operations in a future version.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={handleExportJSON}
              className="py-2 px-4 bg-bg-surface-2 border border-border-subtle text-text-primary text-[0.525rem] md:text-xs font-medium rounded-full hover:bg-bg-surface-3 transition-colors"
            >
              Export All Data (JSON)
            </button>

            <button
              onClick={handleImportJSON}
              className="py-2 px-4 bg-bg-surface-2 border border-border-subtle text-text-primary text-[0.525rem] md:text-xs font-medium rounded-full hover:bg-bg-surface-3 transition-colors"
            >
              Import Data (JSON)
            </button>
          </div>
        </div>

        {/* About / Legal Section */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-4 lg:p-6">
          <Heading level={2} className="mb-4">About & Legal</Heading>
          
          <div className="space-y-4">
            <div>
              <Heading level={3} className="mb-1">Capitalos</Heading>
              <p className="text-text-secondary text-[0.525rem] md:text-xs">
                Capitalos is your personal wealth, cashflow and investing cockpit.
              </p>
            </div>

            <div>
              <p className="text-text-secondary text-[0.525rem] md:text-xs">
                Version: 1.0.0
              </p>
            </div>

            <div className="pt-4 border-t border-border-subtle">
              <p className="text-text-muted text-[0.525rem] md:text-xs italic">
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


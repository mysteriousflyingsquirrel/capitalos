import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import Heading from '../components/Heading'

const platforms = [
  { name: 'Kraken', value: 25000, color: '#DAA520' },
  { name: 'Trezor', value: 10000, color: '#B87333' },
  { name: 'IBKR', value: 60000, color: '#0A1A40' },
  { name: 'Revolut', value: 15000, color: '#C0C0C0' },
  { name: 'Yuh', value: 10000, color: '#33B5E5' },
]

const holdings = [
  { asset: 'Bitcoin', platform: 'Kraken', quantity: 0.5, price: 45000, value: 22500, profitLoss: 2500, profitLossPercent: 12.5 },
  { asset: 'PLTR', platform: 'IBKR', quantity: 500, price: 18.5, value: 9250, profitLoss: -750, profitLossPercent: -7.5 },
  { asset: 'Gold', platform: 'Revolut', quantity: 10, price: 1500, value: 15000, profitLoss: 500, profitLossPercent: 3.4 },
  { asset: 'ETH', platform: 'Trezor', quantity: 5, price: 2000, value: 10000, profitLoss: 1500, profitLossPercent: 17.6 },
  { asset: 'S&P 500 ETF', platform: 'Yuh', quantity: 100, price: 100, value: 10000, profitLoss: 800, profitLossPercent: 8.7 },
]

function Investing() {
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0)
  const totalProfitLoss = holdings.reduce((sum, h) => sum + h.profitLoss, 0)
  const totalProfitLossPercent = ((totalProfitLoss / (totalValue - totalProfitLoss)) * 100).toFixed(2)

  const filteredHoldings = selectedPlatform === 'all' 
    ? holdings 
    : holdings.filter(h => h.platform === selectedPlatform)

  return (
    <div className="min-h-screen bg-[#050A1A] px-2 py-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Investing</Heading>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <p className="text-text-secondary text-xs md:text-sm font-medium mb-1 md:mb-2">Total Holdings Value</p>
            <p className="text-2xl md:text-3xl font-semibold text-[#F8C445]">
              CHF {totalValue.toLocaleString()}
            </p>
          </div>
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <p className="text-text-secondary text-xs md:text-sm font-medium mb-1 md:mb-2">Total Profit/Loss</p>
            <p className={`text-2xl md:text-3xl font-semibold ${totalProfitLoss >= 0 ? 'text-success' : 'text-danger'}`}>
              {totalProfitLoss >= 0 ? '+' : ''}CHF {totalProfitLoss.toLocaleString()}
            </p>
          </div>
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <p className="text-text-secondary text-xs md:text-sm font-medium mb-1 md:mb-2">Return %</p>
            <p className={`text-2xl md:text-3xl font-semibold ${totalProfitLoss >= 0 ? 'text-success' : 'text-danger'}`}>
              {totalProfitLoss >= 0 ? '+' : ''}{totalProfitLossPercent}%
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Platform Allocation */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <h2 className="text-text-primary text-lg md:text-xl font-semibold mb-3 md:mb-4">Platform Allocation</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={platforms}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {platforms.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFFFF', 
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  color: '#111827',
                  fontSize: '0.60rem',
                  fontWeight: '400',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

          {/* Asset Allocation */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <h2 className="text-text-primary text-lg md:text-xl font-semibold mb-3 md:mb-4">Asset Allocation</h2>
            <div className="space-y-3">
              {holdings.map((holding, index) => {
                const percentage = (holding.value / totalValue * 100).toFixed(1)
                return (
                  <div key={index} className="border-b border-border-subtle pb-3 last:border-0">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-text-primary text-[0.525rem] md:text-xs">{holding.asset}</p>
                      <p className="text-[#F8C445] text-[0.525rem] md:text-xs">{percentage}%</p>
                    </div>
                    <div className="w-full bg-bg-surface-2 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-[#F8C445] to-[#DAA520] h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Holdings Table */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-text-primary text-lg md:text-xl font-semibold">Holdings by Platform and Asset</h2>
            <select 
              value={selectedPlatform} 
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="bg-bg-surface-2 border border-border-subtle rounded-input pl-4 pr-8 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
            >
              <option value="all">All Platforms</option>
              {platforms.map(platform => (
                <option key={platform.name} value={platform.name}>{platform.name}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left py-3 px-4 text-text-secondary text-[0.525rem] md:text-xs">Asset</th>
                  <th className="text-left py-3 px-4 text-text-secondary text-[0.525rem] md:text-xs">Platform</th>
                  <th className="text-right py-3 px-4 text-text-secondary text-[0.525rem] md:text-xs">Quantity</th>
                  <th className="text-right py-3 px-4 text-text-secondary text-[0.525rem] md:text-xs">Price</th>
                  <th className="text-right py-3 px-4 text-text-secondary text-[0.525rem] md:text-xs">Value</th>
                  <th className="text-right py-3 px-4 text-text-secondary text-[0.525rem] md:text-xs">P/L</th>
                  <th className="text-right py-3 px-4 text-text-secondary text-[0.525rem] md:text-xs">P/L %</th>
                </tr>
              </thead>
              <tbody>
                {filteredHoldings.map((holding, index) => (
                  <tr key={index} className="border-b border-border-subtle hover:bg-bg-surface-2 transition-colors">
                    <td className="py-3 px-4 text-text-primary text-[0.525rem] md:text-xs">{holding.asset}</td>
                    <td className="py-3 px-4 text-text-secondary text-[0.525rem] md:text-xs">{holding.platform}</td>
                    <td className="py-3 px-4 text-right text-text-primary text-[0.525rem] md:text-xs">{holding.quantity}</td>
                    <td className="py-3 px-4 text-right text-text-primary text-[0.525rem] md:text-xs">CHF {holding.price.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-text-primary text-[0.525rem] md:text-xs">CHF {holding.value.toLocaleString()}</td>
                    <td className={`py-3 px-4 text-right text-[0.525rem] md:text-xs ${
                      holding.profitLoss >= 0 ? 'text-success' : 'text-danger'
                    }`}>
                      {holding.profitLoss >= 0 ? '+' : ''}CHF {holding.profitLoss.toLocaleString()}
                    </td>
                    <td className={`py-3 px-4 text-right text-[0.525rem] md:text-xs ${
                      holding.profitLoss >= 0 ? 'text-success' : 'text-danger'
                    }`}>
                      {holding.profitLoss >= 0 ? '+' : ''}{holding.profitLossPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Investing


import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const categories = {
  inflow: ['Time', 'Service', 'Worker Bees'],
  outflow: ['Fixed', 'Variable', 'Investments']
}

const transactions = [
  { id: 1, type: 'inflow', category: 'Time', amount: 5000, date: '2024-01-15', description: 'Salary' },
  { id: 2, type: 'inflow', category: 'Service', amount: 2000, date: '2024-01-20', description: 'Consulting' },
  { id: 3, type: 'outflow', category: 'Fixed', amount: -1500, date: '2024-01-05', description: 'Rent' },
  { id: 4, type: 'outflow', category: 'Variable', amount: -800, date: '2024-01-10', description: 'Groceries' },
  { id: 5, type: 'outflow', category: 'Investments', amount: -2000, date: '2024-01-12', description: 'Stock Purchase' },
]

const monthlyFlowData = [
  { month: 'Jan', inflow: 12000, outflow: 8000 },
  { month: 'Feb', inflow: 13000, outflow: 7500 },
  { month: 'Mar', inflow: 12500, outflow: 9000 },
  { month: 'Apr', inflow: 14000, outflow: 8500 },
  { month: 'May', inflow: 13500, outflow: 8200 },
  { month: 'Jun', inflow: 14500, outflow: 8800 },
]

function Cashflow() {
  const [filter, setFilter] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')

  const filteredTransactions = transactions.filter(t => {
    if (filter !== 'all' && t.type !== filter) return false
    if (selectedCategory !== 'all' && t.category !== selectedCategory) return false
    return true
  })

  return (
    <div className="space-y-6">
      <h1 className="section-title text-2xl">Cashflow</h1>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="label-normal block mb-2">Type</label>
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">All</option>
              <option value="inflow">Inflow</option>
              <option value="outflow">Outflow</option>
            </select>
          </div>
          <div>
            <label className="label-normal block mb-2">Category</label>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input-field"
            >
              <option value="all">All Categories</option>
              {filter === 'inflow' || filter === 'all' ? (
                categories.inflow.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))
              ) : null}
              {filter === 'outflow' || filter === 'all' ? (
                categories.outflow.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))
              ) : null}
            </select>
          </div>
        </div>
      </div>

      {/* Monthly Flow Visualization */}
      <div className="card">
        <h2 className="section-title mb-4">Monthly Flow Visualization</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyFlowData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#B87333" opacity={0.3} />
            <XAxis dataKey="month" stroke="#C0C0C0" />
            <YAxis stroke="#C0C0C0" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0A1A40', 
                border: '1px solid #B87333',
                borderRadius: '8px'
              }}
            />
            <Legend />
            <Bar dataKey="inflow" fill="#00C851" name="Inflow" />
            <Bar dataKey="outflow" fill="#FF4444" name="Outflow" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Transaction List */}
      <div className="card">
        <h2 className="section-title mb-4">Transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bronze-gold">
                <th className="text-left py-3 px-4 label-normal">Date</th>
                <th className="text-left py-3 px-4 label-normal">Type</th>
                <th className="text-left py-3 px-4 label-normal">Category</th>
                <th className="text-left py-3 px-4 label-normal">Description</th>
                <th className="text-right py-3 px-4 label-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-space-blue hover:bg-galaxy-dark transition-colors">
                  <td className="py-3 px-4 text-text-primary">{transaction.date}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-custom text-xs ${
                      transaction.type === 'inflow' 
                        ? 'bg-success/20 text-success' 
                        : 'bg-error/20 text-error'
                    }`}>
                      {transaction.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-text-secondary">{transaction.category}</td>
                  <td className="py-3 px-4 text-text-primary">{transaction.description}</td>
                  <td className={`py-3 px-4 text-right font-medium ${
                    transaction.amount > 0 ? 'text-success' : 'text-error'
                  }`}>
                    {transaction.amount > 0 ? '+' : ''}CHF {transaction.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Cashflow


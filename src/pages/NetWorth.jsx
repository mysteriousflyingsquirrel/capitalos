import { LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts'

const netWorthHistory = [
  { date: '2023-01', value: 120000 },
  { date: '2023-04', value: 130000 },
  { date: '2023-07', value: 140000 },
  { date: '2023-10', value: 150000 },
  { date: '2024-01', value: 162000 },
  { date: '2024-04', value: 175000 },
  { date: '2024-07', value: 180000 },
]

const compositionData = [
  { name: 'Cash', value: 45000, color: '#DAA520' },
  { name: 'Stocks', value: 80000, color: '#B87333' },
  { name: 'Crypto', value: 35000, color: '#0A1A40' },
  { name: 'Real Estate', value: 20000, color: '#C0C0C0' },
]

const trendInsights = [
  { metric: 'Total Growth', value: '+50%', period: 'Last 18 months' },
  { metric: 'Monthly Growth', value: '+2.1%', period: 'Average' },
  { metric: 'Best Asset', value: 'Stocks', period: '+35% YTD' },
]

function NetWorth() {
  const currentNetWorth = 180000
  const previousNetWorth = 175000
  const growth = ((currentNetWorth - previousNetWorth) / previousNetWorth * 100).toFixed(2)

  return (
    <div className="space-y-6">
      <h1 className="section-title text-2xl">Net Worth</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <p className="label-normal mb-2">Current Net Worth</p>
          <p className="text-3xl font-semibold text-goldenrod">
            CHF {currentNetWorth.toLocaleString()}
          </p>
        </div>
        <div className="card">
          <p className="label-normal mb-2">Growth Rate</p>
          <p className="text-3xl font-semibold text-success">
            +{growth}%
          </p>
        </div>
        <div className="card">
          <p className="label-normal mb-2">Total Assets</p>
          <p className="text-3xl font-semibold text-text-primary">
            {compositionData.length}
          </p>
        </div>
      </div>

      {/* Long-term Value Graph */}
      <div className="card">
        <h2 className="section-title mb-4">Long-term Value Graph</h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={netWorthHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#B87333" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              stroke="#C0C0C0"
              tick={{ fill: '#C0C0C0' }}
            />
            <YAxis 
              stroke="#C0C0C0"
              tick={{ fill: '#C0C0C0' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0A1A40', 
                border: '1px solid #B87333',
                borderRadius: '8px',
                color: '#EAEAEA'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#DAA520" 
              strokeWidth={3}
              dot={{ fill: '#B87333', r: 5 }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Composition Pie Chart */}
        <div className="card">
          <h2 className="section-title mb-4">Composition</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={compositionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent, value }) => `${name}: CHF ${value.toLocaleString()} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {compositionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0A1A40', 
                  border: '1px solid #B87333',
                  borderRadius: '8px',
                  color: '#EAEAEA'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Insights */}
        <div className="card">
          <h2 className="section-title mb-4">Trend Insights</h2>
          <div className="space-y-4">
            {trendInsights.map((insight, index) => (
              <div key={index} className="border-b border-bronze-gold pb-4 last:border-0">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-text-primary font-medium">{insight.metric}</p>
                  <p className="text-goldenrod font-semibold text-lg">{insight.value}</p>
                </div>
                <p className="label-normal text-xs">{insight.period}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default NetWorth


import React from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Sparkline from '../components/charts/Sparkline';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';

// Mock data
const holdings = [
  { symbol: 'AAPL', name: 'Apple Inc.', quantity: 50, avg_cost: 150.00, market_value: 8625.00, p_l: 1125.00 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', quantity: 30, avg_cost: 300.00, market_value: 11128.50, p_l: 2128.50 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', quantity: 20, avg_cost: 120.00, market_value: 2764.20, p_l: 364.20 },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', quantity: 15, avg_cost: 130.00, market_value: 2311.80, p_l: 361.80 },
];
const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.market_value, 0);

const allocationData = holdings.map(h => ({ name: h.symbol, value: h.market_value }));
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const portfolioHistory = [
    { name: 'Jan', value: 100000 }, { name: 'Feb', value: 105000 }, { name: 'Mar', value: 102000 },
    { name: 'Apr', value: 110000 }, { name: 'May', value: 115000 }, { name: 'Jun', value: 125680 },
];

const PortfolioPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <h1 className="text-3xl font-bold">My Portfolio</h1>
        <div className="flex gap-2">
            <Button variant="secondary">Add Cash</Button>
            <Button>Add Holding</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
              <h2 className="text-xl font-semibold mb-4">Allocation</h2>
              <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                      <PieChart>
                          <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label>
                              {allocationData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} />
                          <Legend />
                      </PieChart>
                  </ResponsiveContainer>
              </div>
          </Card>
          <Card className="lg:col-span-2">
              <h2 className="text-xl font-semibold mb-4">Portfolio Value</h2>
              <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                      <LineChart data={portfolioHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="name" stroke="#d1d5db" />
                          <YAxis stroke="#d1d5db" tickFormatter={(value) => `$${(value/1000)}k`}/>
                          <Tooltip />
                          <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} dot={{ r: 4 }} >
                            <LabelList dataKey="value" position="top" formatter={(value: number) => `$${(value / 1000).toFixed(0)}k`} style={{ fill: '#d1d5db', fontSize: 12 }} />
                          </Line>
                      </LineChart>
                  </ResponsiveContainer>
              </div>
          </Card>
      </div>

      <Card>
        <h2 className="text-xl font-semibold mb-4">Holdings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-accent">
                <th className="p-3">Symbol</th>
                <th className="p-3">Quantity</th>
                <th className="p-3 hidden md:table-cell">Avg. Cost</th>
                <th className="p-3">Market Value</th>
                <th className="p-3">P/L</th>
                <th className="p-3 hidden lg:table-cell">Allocation</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.symbol} className="border-b border-accent last:border-0 hover:bg-accent/50">
                  <td className="p-3 font-bold">{h.symbol}</td>
                  <td className="p-3">{h.quantity}</td>
                  <td className="p-3 hidden md:table-cell">${h.avg_cost.toFixed(2)}</td>
                  <td className="p-3">${h.market_value.toFixed(2)}</td>
                  <td className={`p-3 ${h.p_l >= 0 ? 'text-success' : 'text-danger'}`}>${h.p_l.toFixed(2)}</td>
                  <td className="p-3 hidden lg:table-cell">{((h.market_value / totalPortfolioValue) * 100).toFixed(2)}%</td>
                  <td className="p-3 space-x-2">
                      <Button variant="secondary" size="sm">Edit</Button>
                      <Button variant="danger" size="sm">Sell</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default PortfolioPage;
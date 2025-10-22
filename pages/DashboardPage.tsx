
import React from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Sparkline from '../components/charts/Sparkline';
import { ArrowUpRight, ArrowDownRight, DollarSign, Percent, Calendar } from 'lucide-react';
import { SparklineData } from '../types';

// Mock data for dashboard
const summaryData = {
  totalValue: 125680.45,
  dayChange: 734.21,
  dayChangePercent: 0.59,
  ytdReturn: 12.3,
  upcomingDividends: 245.50,
};

const mockWatchlist: { symbol: string, name: string, price: number, change: number, data: SparklineData[] }[] = [
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 184.88, change: -2.31, data: [{date: '1', value: 180}, {date: '2', value: 182}, {date: '3', value: 181}, {date: '4', value: 185}] },
    { symbol: 'DIS', name: 'Walt Disney Co', price: 102.50, change: 1.15, data: [{date: '1', value: 100}, {date: '2', value: 101}, {date: '3', value: 103}, {date: '4', value: 102}] },
    { symbol: 'JPM', name: 'JPMorgan Chase', price: 198.70, change: 0.98, data: [{date: '1', value: 195}, {date: '2', value: 196}, {date: '3', value: 197}, {date: '4', value: 199}] },
    { symbol: 'V', name: 'Visa Inc.', price: 275.40, change: -0.50, data: [{date: '1', value: 278}, {date: '2', value: 277}, {date: '3', value: 276}, {date: '4', value: 275}] },
];

const SummaryCard = ({ title, value, change, icon: Icon, isCurrency = true }: { title: string; value: number; change?: number; icon: React.ElementType; isCurrency?: boolean }) => {
    const isPositive = change === undefined || change >= 0;
    return (
        <Card>
            <div className="flex items-center justify-between">
                <p className="text-text-secondary">{title}</p>
                <Icon className="w-5 h-5 text-text-secondary" />
            </div>
            <p className="text-3xl font-bold mt-2">{isCurrency ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : `${value}%`}</p>
            {change !== undefined && (
                <div className={`flex items-center mt-1 text-sm ${isPositive ? 'text-success' : 'text-danger'}`}>
                    {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    <span className="ml-1 font-semibold">{isCurrency ? Math.abs(change).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : `${Math.abs(change)}%`}</span>
                </div>
            )}
        </Card>
    );
};

const DashboardPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard title="Portfolio Value" value={summaryData.totalValue} change={summaryData.dayChange} icon={DollarSign} />
        <SummaryCard title="1-Day Change" value={summaryData.dayChangePercent} isCurrency={false} icon={Percent} />
        <SummaryCard title="YTD Return" value={summaryData.ytdReturn} isCurrency={false} icon={Percent} />
        <SummaryCard title="Upcoming Dividends (30d)" value={summaryData.upcomingDividends} icon={Calendar} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Watchlist */}
        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Watchlist</h2>
            <Button variant="secondary" size="sm">Add Ticker</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-accent">
                  <th className="p-3">Ticker</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Change</th>
                  <th className="p-3 hidden sm:table-cell">Chart (7d)</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {mockWatchlist.map(item => (
                  <tr key={item.symbol} className="border-b border-accent last:border-0 hover:bg-accent/50">
                    <td className="p-3">
                        <div className="font-bold">{item.symbol}</div>
                        <div className="text-xs text-text-secondary truncate">{item.name}</div>
                    </td>
                    <td className="p-3 font-mono">${item.price.toFixed(2)}</td>
                    <td className={`p-3 font-mono ${item.change >= 0 ? 'text-success' : 'text-danger'}`}>{item.change.toFixed(2)}</td>
                    <td className="p-3 hidden sm:table-cell"><Sparkline data={item.data} /></td>
                    <td className="p-3 text-right"><Button variant="primary" size="sm">Add</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card>
          <h2 className="text-xl font-semibold mb-4">Recent News</h2>
          <div className="space-y-4">
            {/* Mock news items */}
            <div className="text-sm">
              <p className="font-semibold">Apple announces new iPhone, stock jumps 2%.</p>
              <p className="text-xs text-text-secondary">MarketWatch - 2h ago</p>
            </div>
            <div className="text-sm">
              <p className="font-semibold">Fed holds interest rates steady amid inflation concerns.</p>
              <p className="text-xs text-text-secondary">Reuters - 5h ago</p>
            </div>
             <div className="text-sm">
              <p className="font-semibold">NVIDIA posts record earnings on AI chip demand.</p>
              <p className="text-xs text-text-secondary">Bloomberg - 1d ago</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;

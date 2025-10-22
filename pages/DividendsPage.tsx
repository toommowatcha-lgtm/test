
import React from 'react';
import Card from '../components/ui/Card';

// Mock data
const dividendCalendar = [
  { symbol: 'MSFT', ex_date: '2024-08-14', pay_date: '2024-09-12', amount: 0.75, yield: 0.7 },
  { symbol: 'JPM', ex_date: '2024-07-05', pay_date: '2024-07-31', amount: 1.05, yield: 2.1 },
  { symbol: 'AAPL', ex_date: '2024-08-09', pay_date: '2024-08-15', amount: 0.25, yield: 0.5 },
];

const DividendsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dividend Tracker</h1>
      
      <Card>
        <h2 className="text-xl font-semibold mb-4">Upcoming Dividends</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-accent">
                <th className="p-3">Ticker</th>
                <th className="p-3">Ex-Dividend Date</th>
                <th className="p-3">Payment Date</th>
                <th className="p-3">Amount per Share</th>
                <th className="p-3">Yield</th>
              </tr>
            </thead>
            <tbody>
              {dividendCalendar.map(div => (
                <tr key={div.symbol} className="border-b border-accent last:border-0 hover:bg-accent/50">
                  <td className="p-3 font-bold">{div.symbol}</td>
                  <td className="p-3">{div.ex_date}</td>
                  <td className="p-3">{div.pay_date}</td>
                  <td className="p-3">${div.amount.toFixed(2)}</td>
                  <td className="p-3">{div.yield.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Placeholder for calendar view component */}
      <Card>
        <h2 className="text-xl font-semibold mb-4">Dividend Calendar</h2>
        <div className="h-64 flex items-center justify-center bg-accent rounded-lg">
          <p className="text-text-secondary">Calendar View Component Placeholder</p>
        </div>
      </Card>
    </div>
  );
};

export default DividendsPage;

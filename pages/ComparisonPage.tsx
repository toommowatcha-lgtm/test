
import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import stockService from '../services/stockService';
import { StockQuote } from '../types';

const ComparisonPage: React.FC = () => {
  const [tickers, setTickers] = useState<string[]>(['AAPL', 'MSFT']);
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const fetchQuotes = async () => {
      const quotePromises = tickers.map(ticker => stockService.getQuote(ticker));
      const results = await Promise.all(quotePromises);
      setQuotes(results.filter((q): q is StockQuote => q !== null));
    };
    fetchQuotes();
  }, [tickers]);

  const addTicker = () => {
    if (input && !tickers.includes(input.toUpperCase()) && tickers.length < 4) {
      setTickers([...tickers, input.toUpperCase()]);
      setInput('');
    }
  };

  const removeTicker = (symbol: string) => {
    setTickers(tickers.filter(t => t !== symbol));
  };

  const metrics = [
    { key: 'companyName', name: 'Company Name' },
    { key: 'latestPrice', name: 'Price', format: (v: number) => `$${v.toFixed(2)}` },
    { key: 'changePercent', name: '% Change', format: (v: number) => `${(v * 100).toFixed(2)}%` },
    { key: 'marketCap', name: 'Market Cap', format: (v: number) => `$${(v / 1e9).toFixed(2)}B` },
    { key: 'peRatio', name: 'P/E Ratio' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Stock Comparison</h1>
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add ticker..."
            className="bg-accent px-4 py-2 rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button onClick={addTicker} disabled={tickers.length >= 4}>Add</Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-accent">
                <th className="p-3 font-semibold text-text-secondary">Metric</th>
                {quotes.map(q => (
                  <th key={q.symbol} className="p-3 font-semibold">
                      <div className="flex justify-between items-center">
                        <span>{q.symbol}</span>
                        <button onClick={() => removeTicker(q.symbol)} className="text-red-500 hover:text-red-700">×</button>
                      </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map(metric => (
                <tr key={metric.key} className="border-b border-accent">
                  <td className="p-3 font-medium text-text-secondary">{metric.name}</td>
                  {quotes.map(q => (
                    <td key={q.symbol} className="p-3">
                      {metric.format ? metric.format(q[metric.key as keyof StockQuote] as number) : q[metric.key as keyof StockQuote]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ComparisonPage;

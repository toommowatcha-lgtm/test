
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import stockService from '../services/stockService';
import { StockQuote, StockFundamentals, Dividend } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Tab = 'Overview' | 'Fundamentals' | 'Dividends' | 'News';

const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [fundamentals, setFundamentals] = useState<StockFundamentals[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!symbol) return;
      setLoading(true);
      try {
        const [quoteData, fundamentalsData, dividendsData] = await Promise.all([
          stockService.getQuote(symbol),
          stockService.getFundamentals(symbol),
          stockService.getDividends(symbol),
        ]);
        setQuote(quoteData);
        setFundamentals(fundamentalsData);
        setDividends(dividendsData);
      } catch (error) {
        console.error("Failed to fetch stock data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [symbol]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!quote) {
    return <div>Stock not found.</div>;
  }
  
  const isPositive = quote.change >= 0;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Fundamentals':
        return <FundamentalsTab fundamentals={fundamentals} />;
      case 'Dividends':
        return <DividendsTab dividends={dividends} />;
      default:
        return <OverviewTab quote={quote} />;
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold">{quote.symbol}</h1>
            <div className="text-text-secondary">{quote.companyName}</div>
        </div>
        <div className="text-sm text-text-secondary">{quote.exchange} - {quote.sector}</div>
      </header>
      
      <div className="flex items-baseline gap-4">
        <p className="text-5xl font-bold">${quote.latestPrice.toFixed(2)}</p>
        <p className={`text-2xl font-semibold ${isPositive ? 'text-success' : 'text-danger'}`}>
          {isPositive ? '+' : ''}{quote.change.toFixed(2)} ({isPositive ? '+' : ''}{(quote.changePercent * 100).toFixed(2)}%)
        </p>
      </div>

      <div className="border-b border-accent">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {(['Overview', 'Fundamentals', 'Dividends', 'News'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {renderTabContent()}
      </div>
    </div>
  );
};

const OverviewTab: React.FC<{ quote: StockQuote }> = ({ quote }) => (
  <Card>
    <h3 className="text-xl font-semibold mb-4">Key Statistics</h3>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div><span className="text-text-secondary">Market Cap:</span> ${ (quote.marketCap / 1_000_000_000).toFixed(2) }B</div>
      <div><span className="text-text-secondary">P/E Ratio:</span> {quote.peRatio}</div>
      <div><span className="text-text-secondary">52-Wk High:</span> ${quote.week52High.toFixed(2)}</div>
      <div><span className="text-text-secondary">52-Wk Low:</span> ${quote.week52Low.toFixed(2)}</div>
    </div>
  </Card>
);

const FundamentalsTab: React.FC<{ fundamentals: StockFundamentals[] }> = ({ fundamentals }) => (
    <Card>
        <h3 className="text-xl font-semibold mb-4">Financials</h3>
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <BarChart data={fundamentals.slice().reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="fiscal_year" stroke="#d1d5db"/>
                    <YAxis yAxisId="left" orientation="left" stroke="#06b6d4" tickFormatter={(v) => `$${v/1_000_000}M`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" tickFormatter={(v) => `$${v/1_000_000}M`}/>
                    <Tooltip formatter={(value, name) => [`$${Number(value).toLocaleString()}M`, name]}/>
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" fill="#06b6d4" name="Revenue" />
                    <Bar yAxisId="right" dataKey="net_income" fill="#82ca9d" name="Net Income" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    </Card>
);

const DividendsTab: React.FC<{ dividends: Dividend[] }> = ({ dividends }) => (
    <Card>
        <h3 className="text-xl font-semibold mb-4">Dividend History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
              <thead>
              <tr className="border-b border-accent">
                  <th className="p-2">Ex-Date</th>
                  <th className="p-2">Pay Date</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Declared Date</th>
              </tr>
              </thead>
              <tbody>
              {dividends.map((div) => (
                  <tr key={div.id} className="border-b border-accent last:border-0">
                  <td className="p-2">{div.ex_date}</td>
                  <td className="p-2">{div.pay_date}</td>
                  <td className="p-2">${div.amount.toFixed(4)}</td>
                  <td className="p-2">{div.declared_date}</td>
                  </tr>
              ))}
              </tbody>
          </table>
        </div>
    </Card>
);

export default StockDetailPage;


// This service uses a mock adapter by default.
// To use a real API, you would create an external adapter and change the export.

import { StockQuote, StockFundamentals, Dividend, SparklineData } from '../types';

// --- MOCK DATA ---
const mockQuotes: { [key: string]: StockQuote } = {
  'AAPL': { symbol: 'AAPL', companyName: 'Apple Inc.', latestPrice: 172.50, change: 1.25, changePercent: 0.0073, marketCap: 2800000000000, peRatio: 28.5, week52High: 198.23, week52Low: 164.08, exchange: 'NASDAQ', sector: 'Technology' },
  'MSFT': { symbol: 'MSFT', companyName: 'Microsoft Corporation', latestPrice: 370.95, change: -2.10, changePercent: -0.0056, marketCap: 2750000000000, peRatio: 35.8, week52High: 384.30, week52Low: 275.37, exchange: 'NASDAQ', sector: 'Technology' },
  'GOOGL': { symbol: 'GOOGL', companyName: 'Alphabet Inc.', latestPrice: 138.21, change: 0.88, changePercent: 0.0064, marketCap: 1720000000000, peRatio: 26.1, week52High: 152.10, week52Low: 115.83, exchange: 'NASDAQ', sector: 'Communication Services' },
  'AMZN': { symbol: 'AMZN', companyName: 'Amazon.com, Inc.', latestPrice: 154.12, change: -1.05, changePercent: -0.0068, marketCap: 1590000000000, peRatio: 70.2, week52High: 161.73, week52Low: 118.35, exchange: 'NASDAQ', sector: 'Consumer Cyclical' },
  'NVDA': { symbol: 'NVDA', companyName: 'NVIDIA Corporation', latestPrice: 475.69, change: 5.12, changePercent: 0.0109, marketCap: 1170000000000, peRatio: 60.5, week52High: 505.48, week52Low: 259.98, exchange: 'NASDAQ', sector: 'Technology' },
};

const mockFundamentals: { [key: string]: StockFundamentals[] } = {
    'AAPL': [
        { symbol: 'AAPL', fiscal_year: 2023, revenue: 383285, net_income: 96995, eps: 6.13, pe: 28.5, gross_margin: 0.4413 },
        { symbol: 'AAPL', fiscal_year: 2022, revenue: 394328, net_income: 99803, eps: 6.11, pe: 25.1, gross_margin: 0.4331 },
        { symbol: 'AAPL', fiscal_year: 2021, revenue: 365817, net_income: 94680, eps: 5.61, pe: 26.7, gross_margin: 0.4177 },
        { symbol: 'AAPL', fiscal_year: 2020, revenue: 274515, net_income: 57411, eps: 3.28, pe: 35.0, gross_margin: 0.3824 },
        { symbol: 'AAPL', fiscal_year: 2019, revenue: 260174, net_income: 55256, eps: 2.97, pe: 21.3, gross_margin: 0.3782 },
    ]
};

const mockDividends: { [key: string]: Dividend[] } = {
    'AAPL': [
        { id: 1, symbol: 'AAPL', ex_date: '2024-02-09', pay_date: '2024-02-15', amount: 0.24, declared_date: '2024-01-25' },
        { id: 2, symbol: 'AAPL', ex_date: '2023-11-10', pay_date: '2023-11-16', amount: 0.24, declared_date: '2023-10-26' },
        { id: 3, symbol: 'AAPL', ex_date: '2023-08-11', pay_date: '2023-08-17', amount: 0.24, declared_date: '2023-07-27' },
    ]
};

const generateMockSparkline = (): SparklineData[] => {
    const data = [];
    let price = 100 + Math.random() * 50;
    for (let i = 30; i > 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        price += (Math.random() - 0.5) * 5;
        data.push({ date: date.toISOString().split('T')[0], value: parseFloat(price.toFixed(2)) });
    }
    return data;
};

// --- ADAPTER INTERFACE ---
interface StockServiceAdapter {
  getQuote(symbol: string): Promise<StockQuote | null>;
  getFundamentals(symbol: string): Promise<StockFundamentals[]>;
  getDividends(symbol: string): Promise<Dividend[]>;
  getSparkline(symbol: string): Promise<SparklineData[]>;
  search(query: string): Promise<{ symbol: string; companyName: string }[]>;
}

// --- MOCK ADAPTER ---
const mockAdapter: StockServiceAdapter = {
  getQuote: async (symbol: string): Promise<StockQuote | null> => {
    console.log(`[Mock] Fetching quote for ${symbol}`);
    return new Promise(resolve => setTimeout(() => resolve(mockQuotes[symbol.toUpperCase()] || null), 300));
  },
  getFundamentals: async (symbol: string): Promise<StockFundamentals[]> => {
    console.log(`[Mock] Fetching fundamentals for ${symbol}`);
    return new Promise(resolve => setTimeout(() => resolve(mockFundamentals[symbol.toUpperCase()] || []), 500));
  },
  getDividends: async (symbol: string): Promise<Dividend[]> => {
    console.log(`[Mock] Fetching dividends for ${symbol}`);
    return new Promise(resolve => setTimeout(() => resolve(mockDividends[symbol.toUpperCase()] || []), 400));
  },
  getSparkline: async (symbol: string): Promise<SparklineData[]> => {
    console.log(`[Mock] Fetching sparkline for ${symbol}`);
    return new Promise(resolve => setTimeout(() => resolve(generateMockSparkline()), 200));
  },
  search: async (query: string): Promise<{ symbol: string; companyName: string }[]> => {
    console.log(`[Mock] Searching for ${query}`);
    const q = query.toLowerCase();
    const results = Object.values(mockQuotes)
        .filter(stock => stock.symbol.toLowerCase().includes(q) || stock.companyName.toLowerCase().includes(q))
        .map(stock => ({ symbol: stock.symbol, companyName: stock.companyName }));
    return new Promise(resolve => setTimeout(() => resolve(results), 150));
  }
};

// --- EXTERNAL ADAPTER (STUB) ---
/*
  This is a placeholder for a real API adapter. You would implement this
  to call your Supabase Edge Function which in turn calls a service like
  Alpha Vantage or IEX Cloud.
*/
const externalAdapter: StockServiceAdapter = {
  getQuote: async (symbol: string): Promise<StockQuote | null> => {
    // const { data, error } = await supabase.functions.invoke('fetch-stock-data', {
    //   body: { endpoint: 'quote', symbol }
    // });
    // if (error) throw error;
    // return data;
    console.warn("External adapter not implemented. Using mock data.");
    return mockAdapter.getQuote(symbol);
  },
  // ... implement other methods similarly
  getFundamentals: async (symbol) => mockAdapter.getFundamentals(symbol),
  getDividends: async (symbol) => mockAdapter.getDividends(symbol),
  getSparkline: async (symbol) => mockAdapter.getSparkline(symbol),
  search: async (query) => mockAdapter.search(query),
};


// --- EXPORTED SERVICE ---
// Change this to 'externalAdapter' to use the real API
const stockService = mockAdapter;

export default stockService;

import { Session, User } from '@supabase/supabase-js';

export interface AppState {
  session: Session | null;
  user: User | null;
  setSession: (session: Session | null) => void;
  isLoading: boolean;
  setLoading: (isLoading: boolean) => void;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  company_name: string;
}

export interface RevenueSegment {
  segment: string;
  percent: number | string;
}

export interface MoatPower {
  power_name: string;
  description: string;
  level: 'Weak' | 'Normal' | 'High' | '';
}

export interface StockDetails {
  id: number;
  stock_id: number;
  what_do?: string;
  customers?: string;
  revenue_segments?: RevenueSegment[];
  moat?: MoatPower[];
  growth_engine?: string;
  tam?: string;
  market_share?: string;
  unit_economics?: string;
  tipping_point?: string;
  updated_at?: string;
}

// Represents a single data point in the 'financials' table.
export interface FinancialMetric {
  id?: number;
  stock_id: number;
  metric_name: string;
  quarter: string; // e.g., "Q1 2024"
  value: number | null;
}


// FIX: Add definitions for stock-related types used throughout the application, inferred from mock data.
export interface StockQuote {
  symbol: string;
  companyName: string;
  latestPrice: number;
  change: number;
  changePercent: number;
  marketCap: number;
  peRatio: number;
  week52High: number;
  week52Low: number;
  exchange: string;
  sector: string;
}

export interface StockFundamentals {
  symbol: string;
  fiscal_year: number;
  revenue: number;
  net_income: number;
  eps: number;
  pe: number;
  gross_margin: number;
}

export interface Dividend {
  id: number;
  symbol: string;
  ex_date: string;
  pay_date: string;
  amount: number;
  declared_date: string;
}

export interface SparklineData {
  date: string;
  value: number;
}

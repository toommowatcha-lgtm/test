import { Session, User } from '@supabase/supabase-js';

// Fix: Add AppState interface for Zustand store
export interface AppState {
  session: Session | null;
  user: User | null;
  setSession: (session: Session | null) => void;
  isLoading: boolean;
  setLoading: (isLoading: boolean) => void;
}

export interface WatchlistItem {
  id: string; // Supabase UUID is a string
  symbol: string;
  company: string;
  created_at: string;
}

export interface RevenueBreakdownItem {
  segment: string;
  percent: number | string; // Allow string for input field flexibility
}

export interface BusinessOverview {
  id: number;
  stock_id: string; // Foreign key to watchlist.id
  what_do_they_do?: string;
  customers?: string;
  revenue_breakdown?: RevenueBreakdownItem[];
  growth_engine?: string;
  tipping_point?: string;
  updated_at?: string;

  // 7 Powers
  power_network_effect?: string;
  power_switching_cost?: string;
  power_branding?: string;
  power_economics_of_scale?: string;
  power_process_of_power?: string;
  power_counter_position?: string;
  power_corner_resource?: string;

  // Market
  think_tam?: string;
  think_market_share?: string;
  think_unit_economics?: string;
}

export interface FinancialMetric {
  // id is no longer needed on the frontend. DB handles it.
  stock_id: string;
  metric_name: string;
  period_label: string; // e.g., "Q1 2024" or "2024"
  value: number | null;
}

export interface EarningCallStory {
    id: number;
    stock_id: string;
    period_label: string;
    headline: string;
    text: string;
    created_at?: string;
}


// Fix: Add StockQuote interface
export interface StockQuote {
  symbol: string;
  companyName: string;
  latestPrice: number;
  change: number;
  changePercent: number;
  marketCap: number;
  peRatio: number | null;
  week52High: number;
  week52Low: number;
  exchange: string;
  sector: string;
}

// Fix: Add StockFundamentals interface
export interface StockFundamentals {
  symbol: string;
  fiscal_year: number;
  revenue: number;
  net_income: number;
  eps: number;
  pe: number;
  gross_margin: number;
}

// Fix: Add Dividend interface
export interface Dividend {
  id: number;
  symbol: string;
  ex_date: string;
  pay_date: string;
  amount: number;
  declared_date: string;
}

// Fix: Add SparklineData interface
export interface SparklineData {
  date: string;
  value: number;
}